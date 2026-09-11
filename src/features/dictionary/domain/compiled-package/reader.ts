import { normalizePath, type DataAdapter } from "obsidian";
import {
	assertCompiledPackageIdentity,
	compiledPackageDirectory,
	compiledPackageManifestPath,
	createCompiledPackageQueryPlan,
	describeCompiledPackage,
	isCompiledPackageCompatible,
	MAX_COMPILED_STYLESHEET_BYTES,
	MAX_COMPILED_SCRIPT_BYTES,
	parseCompiledPackageManifest,
	validateCompiledPackageFile,
} from "./manifest";
import type { CompiledDictionaryManifest } from "./internal";
import type {
	CompiledPackageReader,
	CompiledPackageStatus,
	InspectCompiledPackageRequest,
	OpenCompiledPackageRequest,
} from "./types";
import { CompiledPackageError } from "./types";

export async function openCompiledPackage(
	request: OpenCompiledPackageRequest,
): Promise<CompiledPackageReader> {
	if (!isCompiledPackageCompatible(request.expected)) {
		throw new CompiledPackageError("incompatible");
	}
	const manifestBytes = await readManifest(request.adapter, request.dictionaryRoot);
	const manifest = parseCompiledPackageManifest(manifestBytes);
	const facts = await describeCompiledPackage(manifestBytes, manifest);
	assertCompiledPackageIdentity(request.expected, facts);
	const reader = new DataAdapterCompiledPackageReader(
		request.adapter,
		request.dictionaryRoot,
		manifest,
		request.cacheBytes,
	);
	try {
		await reader.initialize();
		return reader;
	} catch (error) {
		reader.close();
		throw error;
	}
}

export async function inspectCompiledPackage(
	request: InspectCompiledPackageRequest,
): Promise<CompiledPackageStatus> {
	if (!isCompiledPackageCompatible(request.expected)) return "incompatible";
	const manifestPath = normalizePath(compiledPackageManifestPath(request.dictionaryRoot));
	const manifestStat = await request.adapter.stat(manifestPath).catch(() => null);
	if (!manifestStat) return "missing";
	let manifestBytes: Uint8Array;
	try {
		manifestBytes = await readManifest(request.adapter, request.dictionaryRoot);
	} catch {
		return "missing";
	}
	let manifest: CompiledDictionaryManifest;
	try {
		manifest = parseCompiledPackageManifest(manifestBytes);
		assertCompiledPackageIdentity(
			request.expected,
			await describeCompiledPackage(manifestBytes, manifest),
		);
	} catch (error) {
		return error instanceof CompiledPackageError && error.code === "incompatible"
			? "incompatible"
			: "corrupt";
	}
	const entries = Object.entries(manifest.files);
	for (let offset = 0; offset < entries.length; offset += 16) {
		const batch = entries.slice(offset, offset + 16);
		// oxlint-disable-next-line no-await-in-loop -- bounded batches avoid flooding mobile adapters.
		const statuses = await Promise.all(
			batch.map(async ([path, descriptor]) => {
				const stat = await request.adapter
					.stat(
						normalizePath(
							`${compiledPackageDirectory(request.dictionaryRoot)}/${path}`,
						),
					)
					.catch(() => null);
				return stat ? (stat.size === descriptor.size ? "ready" : "corrupt") : "missing";
			}),
		);
		if (statuses.includes("corrupt")) return "corrupt";
		if (statuses.includes("missing")) return "incomplete";
	}
	return "ready";
}

async function readManifest(adapter: DataAdapter, dictionaryRoot: string): Promise<Uint8Array> {
	try {
		return new Uint8Array(
			await adapter.readBinary(normalizePath(compiledPackageManifestPath(dictionaryRoot))),
		);
	} catch {
		throw new CompiledPackageError("corrupt");
	}
}

class DataAdapterCompiledPackageReader implements CompiledPackageReader {
	readonly queryPlan;
	readonly remoteResourceKind;
	script = "";
	stylesheet = "";
	private readonly cache: ByteLru;
	private readonly inflightFiles = new Map<string, Promise<Uint8Array>>();
	private closed = false;

	constructor(
		private readonly adapter: DataAdapter,
		private readonly dictionaryRoot: string,
		private readonly manifest: CompiledDictionaryManifest,
		cacheBytes: number,
	) {
		this.cache = new ByteLru(Math.max(0, cacheBytes));
		this.queryPlan = createCompiledPackageQueryPlan(manifest);
		this.remoteResourceKind = manifest.remoteResourceKind ?? null;
	}

	async initialize(): Promise<void> {
		this.stylesheet = await this.readTextFile(
			this.manifest.stylesheet,
			MAX_COMPILED_STYLESHEET_BYTES,
		);
		this.script = await this.readTextFile(this.manifest.script, MAX_COMPILED_SCRIPT_BYTES);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.cache.clear();
		this.inflightFiles.clear();
	}

	async readFile(path: string): Promise<Uint8Array> {
		if (this.closed) throw new CompiledPackageError("storage-failed");
		const cached = this.cache.get(path);
		if (cached) return cached;
		const inflight = this.inflightFiles.get(path);
		if (inflight) return inflight;
		const promise = this.readFileNow(path);
		this.inflightFiles.set(path, promise);
		try {
			return await promise;
		} finally {
			this.inflightFiles.delete(path);
		}
	}

	private async readTextFile(
		path: string | null | undefined,
		maximumBytes: number,
	): Promise<string> {
		if (!path) return "";
		const bytes = await this.readFile(path);
		if (bytes.byteLength > maximumBytes) throw new CompiledPackageError("corrupt");
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch {
			throw new CompiledPackageError("corrupt");
		}
	}

	private async readFileNow(path: string): Promise<Uint8Array> {
		const descriptor = this.manifest.files[path];
		if (!descriptor) throw new CompiledPackageError("corrupt");
		let data: Uint8Array;
		try {
			data = new Uint8Array(
				await this.adapter.readBinary(
					normalizePath(`${compiledPackageDirectory(this.dictionaryRoot)}/${path}`),
				),
			);
		} catch {
			throw new CompiledPackageError("corrupt");
		}
		await validateCompiledPackageFile(data, descriptor);
		if (!this.closed) this.cache.set(path, data);
		return data;
	}
}

class ByteLru {
	private bytes = 0;
	private readonly values = new Map<string, Uint8Array>();

	constructor(private readonly budget: number) {}

	clear(): void {
		this.values.clear();
		this.bytes = 0;
	}

	get(key: string): Uint8Array | undefined {
		const value = this.values.get(key);
		if (!value) return undefined;
		this.values.delete(key);
		this.values.set(key, value);
		return value;
	}

	set(key: string, value: Uint8Array): void {
		if (value.byteLength > this.budget) return;
		const previous = this.values.get(key);
		if (previous) this.bytes -= previous.byteLength;
		this.values.delete(key);
		this.values.set(key, value);
		this.bytes += value.byteLength;
		while (this.bytes > this.budget) {
			const oldest = this.values.entries().next().value as [string, Uint8Array] | undefined;
			if (!oldest) break;
			this.values.delete(oldest[0]);
			this.bytes -= oldest[1].byteLength;
		}
	}
}
