import {
	begin_mdict_compile,
	compile_eudic_file,
	type CompiledDictionary,
} from "./engine/dictionary_engine.js";
import { ensureDictionaryEngine } from "./engine-loader";
import type {
	DictionaryCompileErrorCode,
	DictionaryCompileProgress,
	DictionaryCompileRequest,
} from "./compiled-package/internal";

interface StartMessage {
	readonly request: DictionaryCompileRequest;
	readonly type: "start";
}

interface AcknowledgeMessage {
	readonly path: string;
	readonly type: "acknowledge";
}

type CompilerInput = AcknowledgeMessage | StartMessage;

interface CompilerWorkerContext {
	addEventListener(type: "message", listener: (event: MessageEvent<CompilerInput>) => void): void;
	postMessage(message: unknown, transfer?: Transferable[]): void;
}

interface SyncFileReader {
	readAsArrayBuffer(blob: Blob): ArrayBuffer;
}

const context = self as unknown as CompilerWorkerContext;
const pendingWrites = new Map<string, () => void>();
let sourceFiles: readonly File[] = [];
Object.assign(globalThis, {
	dictionaryEngineRead(fileId: number, offset: number, length: number): Uint8Array {
		const file = sourceFiles[fileId];
		if (!file || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length)) {
			return new Uint8Array();
		}
		const Reader = (globalThis as unknown as { FileReaderSync: new () => SyncFileReader })
			.FileReaderSync;
		const reader = new Reader();
		return new Uint8Array(reader.readAsArrayBuffer(file.slice(offset, offset + length)));
	},
});

context.addEventListener("message", (event: MessageEvent<CompilerInput>) => {
	if (event.data.type === "acknowledge") {
		pendingWrites.get(event.data.path)?.();
		pendingWrites.delete(event.data.path);
		return;
	}
	if (event.data.type !== "start") return;
	void compile(event.data).catch((error: unknown) => {
		const parsed = parseEngineError(error);
		context.postMessage({ code: parsed.code, message: parsed.message, type: "error" });
	});
});

async function compile(message: StartMessage): Promise<void> {
	await ensureDictionaryEngine();
	sourceFiles = message.request.files;
	const sourceBytes = message.request.files.reduce((total, file) => total + file.size, 0);
	progress(message.request, "validate", sourceBytes, message.request.files[0]?.name ?? "");
	let compiled: CompiledDictionary;
	let engineVersion: string;
	let entryCount: number;
	let writtenBytes = 0;
	if (message.request.format === "mdict") {
		const mdxIndex = message.request.files.findIndex((file) =>
			file.name.toLowerCase().endsWith(".mdx"),
		);
		if (mdxIndex < 0) throw new Error("Missing MDX source file.");
		const mddIndexes = message.request.files
			.map((file, index) => ({ file, index }))
			.filter(({ file }) => file.name.toLowerCase().endsWith(".mdd"))
			.map(({ index }) => index);
		const css = message.request.files.find((file) => file.name.toLowerCase().endsWith(".css"));
		const script = message.request.files.find((file) =>
			file.name.toLowerCase().endsWith(".js"),
		);
		progress(message.request, "parse", sourceBytes, message.request.files[mdxIndex]!.name);
		const session = begin_mdict_compile(
			mdxIndex,
			message.request.files[mdxIndex]!.size,
			css ? await css.text() : undefined,
			script ? await script.text() : undefined,
			JSON.stringify(message.request.sources),
		);
		try {
			engineVersion = session.engine_version;
			entryCount = Number(session.entry_count);
			progress(message.request, "index", sourceBytes, "indexes");
			progress(message.request, "records", sourceBytes, "records");
			writtenBytes += await emitFiles(message.request, session, sourceBytes + writtenBytes);
			for (const index of mddIndexes) {
				const file = message.request.files[index]!;
				progress(message.request, "resources", sourceBytes + writtenBytes, file.name);
				session.add_mdd(index, file.size);
				// oxlint-disable-next-line no-await-in-loop -- drain one MDD before parsing the next.
				writtenBytes += await emitFiles(
					message.request,
					session,
					sourceBytes + writtenBytes,
				);
			}
			compiled = session.finish();
		} finally {
			session.free();
		}
	} else {
		progress(message.request, "parse", sourceBytes, message.request.files[0]?.name ?? "");
		const eudicIndex = message.request.files.findIndex((file) =>
			file.name.toLowerCase().endsWith(".eudic"),
		);
		if (eudicIndex < 0) throw new Error("Missing EUDIC source file.");
		compiled = compile_eudic_file(
			eudicIndex,
			message.request.files[eudicIndex]!.size,
			JSON.stringify(message.request.sources),
		);
		engineVersion = compiled.engine_version;
		entryCount = Number(compiled.entry_count);
	}

	try {
		if (message.request.format === "eudic") {
			progress(message.request, "index", sourceBytes, "indexes");
			progress(message.request, "records", sourceBytes, "records");
			progress(message.request, "resources", sourceBytes, "resources");
		}
		writtenBytes += await emitFiles(message.request, compiled, sourceBytes + writtenBytes);
		progress(message.request, "verify", sourceBytes + writtenBytes, "manifest.json");
		context.postMessage({
			engineVersion,
			entryCount,
			totalBytes: writtenBytes,
			type: "complete",
		});
	} finally {
		compiled.free();
		sourceFiles = [];
	}
}

interface PackageFiles {
	file_count(): number;
	file_path(index: number): string | undefined;
	take_file(index: number): Uint8Array | undefined;
}

async function emitFiles(
	request: DictionaryCompileRequest,
	packageFiles: PackageFiles,
	completedBefore: number,
): Promise<number> {
	let writtenBytes = 0;
	while (packageFiles.file_count() > 0) {
		const path = packageFiles.file_path(0);
		const data = packageFiles.take_file(0);
		if (!path || !data) throw new Error("Dictionary engine returned an incomplete package.");
		const transfer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
		context.postMessage({ data: transfer, path, type: "file" }, [transfer]);
		// oxlint-disable-next-line no-await-in-loop -- ACK backpressure bounds pending package writes.
		await waitForWrite(path);
		writtenBytes += data.byteLength;
		progress(request, "resources", completedBefore + writtenBytes, path);
	}
	return writtenBytes;
}

function progress(
	request: DictionaryCompileRequest,
	phase: DictionaryCompileProgress["phase"],
	completedBytes: number,
	fileName: string,
): void {
	context.postMessage({
		progress: {
			completedBytes,
			fileName,
			phase,
			totalBytes: Math.ceil(
				request.files.reduce((total, file) => total + file.size, 0) * 2.25,
			),
		},
		type: "progress",
	});
}

function waitForWrite(path: string): Promise<void> {
	return new Promise((resolve) => pendingWrites.set(path, resolve));
}

function parseEngineError(error: unknown): { code: DictionaryCompileErrorCode; message: string } {
	if (typeof error === "string") {
		try {
			const parsed = JSON.parse(error) as { code?: unknown; detail?: unknown };
			if (isErrorCode(parsed.code) && typeof parsed.detail === "string") {
				return { code: parsed.code, message: parsed.detail };
			}
		} catch {
			// Fall through to the stable corrupt error below.
		}
	}
	return {
		code: "corrupt",
		message: error instanceof Error ? error.message : "Dictionary compilation failed.",
	};
}

function isErrorCode(value: unknown): value is DictionaryCompileErrorCode {
	return (
		value === "unsupported-format" ||
		value === "encrypted" ||
		value === "corrupt" ||
		value === "limit-exceeded" ||
		value === "cancelled" ||
		value === "storage-failed"
	);
}
