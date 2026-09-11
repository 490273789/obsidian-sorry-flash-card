import { Platform, type DataAdapter } from "obsidian";
import type { OutboundPort } from "../../../core/net/types";
import { dictionaryText } from "./messages";
import type { LocalDictionarySettings } from "./types";
// oxlint-disable-next-line import/default -- Vite's ?worker&inline query generates this constructor.
import QueryWorker from "./dictionary.worker?worker&inline";
import {
	CompiledPackageError,
	openCompiledPackage,
	type CompiledPackageReader,
} from "./compiled-package";
import { EUDIC_IMAGE_RESOURCE_KIND, EudicImageResourceLoader } from "./eudic-image";
import { createDictionaryResourceUrl, revokeDictionaryResourceUrl } from "./resource-url";
import { prepareDictionarySandboxDocument } from "./sandbox-document";
import type { DictionarySandboxStorageMutation } from "./sandbox-document/protocol";
import { LocalDictionarySandboxStorage } from "./sandbox-storage";
import {
	DictionaryError,
	type DictionaryQuery,
	type DictionaryResult,
	type DictionarySection,
	type DictionarySource,
} from "./types";

const MAX_VISIBLE_DEFINITIONS = 8;
const MAX_LOCAL_TEXT_RESOURCE_BYTES = 8 * 1_048_576;

interface QueryResult {
	readonly definitions: readonly { definition: string; keyText: string }[];
	readonly suggestions: readonly string[];
}

interface ResourceResult {
	readonly data: ArrayBuffer;
	readonly mime: string;
}

interface WorkerOutput {
	readonly data?: ArrayBuffer;
	readonly error?: string;
	readonly id: number;
	readonly mime?: string;
	readonly path?: string;
	readonly result?: QueryResult | ResourceResult | null;
	readonly type: "error" | "lookup-result" | "read" | "resource-result";
}

interface PendingRequest {
	reject(error: Error): void;
	resolve(value: unknown): void;
}

export class CompiledDictionarySource implements DictionarySource {
	readonly kind = "local" as const;
	readonly id: string;
	readonly label: string;
	private readonly packageCacheBytes: number;
	private readonly resourceUrls: ResourceUrlLru;
	private readonly sandboxStorage: LocalDictionarySandboxStorage;
	private readonly textResources = new Map<string, Promise<string | null>>();
	private readonly pending = new Map<number, PendingRequest>();
	private readonly queryWorker = new QueryWorker();
	private readonly remoteResources: EudicImageResourceLoader;
	private closed = false;
	private packageReader: CompiledPackageReader | null = null;
	private nextRequestId = 1;
	private opening: Promise<void> | null = null;
	private script = "";
	private stylesheet = "";

	constructor(
		private readonly metadata: Readonly<LocalDictionarySettings>,
		private readonly adapter: DataAdapter,
		private readonly dictionaryRoot: string,
		net: Pick<OutboundPort, "requestHostPinned">,
	) {
		this.id = metadata.id;
		this.label = metadata.name;
		const totalBudget = Platform.isMobile ? 24 * 1_048_576 : 64 * 1_048_576;
		this.packageCacheBytes = (totalBudget * 3) / 8;
		this.resourceUrls = new ResourceUrlLru(totalBudget / 4);
		this.sandboxStorage = new LocalDictionarySandboxStorage(adapter, dictionaryRoot);
		this.remoteResources = new EudicImageResourceLoader(net);
		this.queryWorker.addEventListener("message", (event: MessageEvent<WorkerOutput>) => {
			void this.handleWorkerMessage(event.data);
		});
		this.queryWorker.addEventListener("error", (event) => {
			this.failAll(new DictionaryError("invalid-response", event.message));
		});
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.queryWorker.terminate();
		this.remoteResources.close();
		this.failAll(new DictionaryError("request", dictionaryText().errors.request));
		this.packageReader?.close();
		this.packageReader = null;
		this.resourceUrls.clear();
		this.textResources.clear();
		this.sandboxStorage.close();
	}

	async lookup(query: DictionaryQuery): Promise<DictionaryResult> {
		await this.open();
		const storage = {
			update: (mutation: DictionarySandboxStorageMutation) =>
				this.sandboxStorage.update(mutation),
			values: await this.sandboxStorage.snapshot(),
		};
		const content = await this.request<QueryResult>({ type: "lookup", word: query.text });
		const visible = content.definitions.slice(0, MAX_VISIBLE_DEFINITIONS);
		const sections: DictionarySection[] = await Promise.all(
			visible.map(async ({ definition, keyText }): Promise<DictionarySection> => ({
				content: {
					document: await prepareDictionarySandboxDocument(
						definition,
						(path) => this.resolveResource(path),
						this.stylesheet,
						{
							localCompatibility: true,
							resolveScript: (path) => this.resolveScript(path),
							resolveStylesheet: (path) => this.resolveStylesheet(path),
							script: this.script,
							storage,
						},
					),
					kind: "document",
				},
				presentation: "stack",
				title:
					content.definitions.length > 1
						? `${dictionaryText().sections.definitions} · ${keyText}`
						: dictionaryText().sections.definitions,
			})),
		);
		if (content.definitions.length > MAX_VISIBLE_DEFINITIONS) {
			const remaining = content.definitions.slice(MAX_VISIBLE_DEFINITIONS);
			const html = `<details><summary>${escapeHtml(dictionaryText().moreDefinitions(remaining.length))}</summary>${remaining
				.map(
					({ definition, keyText }) =>
						`<article><h3>${escapeHtml(keyText)}</h3>${definition}</article>`,
				)
				.join("")}</details>`;
			sections.push({
				content: {
					document: await prepareDictionarySandboxDocument(
						html,
						(path) => this.resolveResource(path),
						this.stylesheet,
						{
							localCompatibility: true,
							resolveScript: (path) => this.resolveScript(path),
							resolveStylesheet: (path) => this.resolveStylesheet(path),
							script: this.script,
							storage,
						},
					),
					kind: "document",
				},
				presentation: "stack",
				title: dictionaryText().sections.definitions,
			});
		}
		if (sections.length === 0 && content.suggestions.length === 0) {
			throw new DictionaryError("not-found", dictionaryText().errors.notFound);
		}
		return {
			attribution: `${dictionaryText().local} · ${this.metadata.name}`,
			pronunciations: [],
			sections,
			sourceId: this.id,
			sourceLabel: this.label,
			suggestions: [...content.suggestions],
			word: visible[0]?.keyText ?? query.text,
		};
	}

	private async open(): Promise<void> {
		if (this.closed) throw new DictionaryError("request", dictionaryText().errors.request);
		this.opening ??= this.openNow();
		return this.opening;
	}

	private async openNow(): Promise<void> {
		const compiled = this.metadata.compiled;
		if (!compiled) {
			throw new DictionaryError("unsupported", dictionaryText().compiledReimportRequired);
		}
		let reader: CompiledPackageReader;
		try {
			reader = await openCompiledPackage({
				adapter: this.adapter,
				cacheBytes: this.packageCacheBytes,
				dictionaryRoot: this.dictionaryRoot,
				expected: compiled,
			});
		} catch (error) {
			if (error instanceof CompiledPackageError && error.code === "incompatible") {
				throw new DictionaryError("unsupported", dictionaryText().compiledReimportRequired);
			}
			throw packageCorrupt();
		}
		if (this.closed) {
			reader.close();
			throw new DictionaryError("request", dictionaryText().errors.request);
		}
		this.packageReader = reader;
		this.script = reader.script;
		this.stylesheet = reader.stylesheet;
		this.queryWorker.postMessage({
			cacheBytes: this.packageCacheBytes,
			queryPlan: reader.queryPlan,
			type: "open",
		});
	}

	private request<T>(value: Record<string, unknown>): Promise<T> {
		if (this.closed)
			return Promise.reject(new DictionaryError("request", dictionaryText().errors.request));
		const id = this.nextRequestId;
		this.nextRequestId += 1;
		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, {
				reject,
				resolve: (result) => resolve(result as T),
			});
			this.queryWorker.postMessage({ ...value, id });
		});
	}

	private async handleWorkerMessage(message: WorkerOutput): Promise<void> {
		if (message.type === "read" && message.path) {
			try {
				const data = await this.readPackageFile(message.path);
				const transfer = data.buffer.slice(
					data.byteOffset,
					data.byteOffset + data.byteLength,
				);
				this.queryWorker.postMessage(
					{ data: transfer, id: message.id, type: "read-result" },
					[transfer],
				);
			} catch (error) {
				this.queryWorker.postMessage({
					error:
						error instanceof Error ? error.message : "Dictionary package read failed.",
					id: message.id,
					type: "read-result",
				});
			}
			return;
		}
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		if (message.type === "error") {
			pending.reject(
				new DictionaryError(
					"invalid-response",
					message.error ?? dictionaryText().errors.invalidResponse,
				),
			);
			return;
		}
		pending.resolve(message.result);
	}

	private async readPackageFile(path: string): Promise<Uint8Array> {
		const reader = this.packageReader;
		if (!reader) throw packageCorrupt();
		try {
			return await reader.readFile(path);
		} catch {
			throw packageCorrupt();
		}
	}

	private async resolveResource(path: string): Promise<string | null> {
		const existing = this.resourceUrls.get(path);
		if (existing) return existing;
		let result = await this.request<ResourceResult | null>({ path, type: "resource" });
		if (!result && this.packageReader?.remoteResourceKind === EUDIC_IMAGE_RESOURCE_KIND) {
			return this.remoteResources.resolve(path);
		}
		if (!result || !safeMime(result.mime)) return null;
		const url = createDictionaryResourceUrl(result.data, result.mime);
		this.resourceUrls.set(path, url, result.data.byteLength);
		return url;
	}

	private async resolveScript(path: string): Promise<string | null> {
		return this.resolveTextResource(path, "text/javascript");
	}

	private async resolveStylesheet(path: string): Promise<string | null> {
		return this.resolveTextResource(path, "text/css");
	}

	private async resolveTextResource(path: string, expectedMime: string): Promise<string | null> {
		const cacheKey = `${expectedMime}\0${path}`;
		const existing = this.textResources.get(cacheKey);
		if (existing) return existing;
		const pending = this.resolveTextResourceNow(path, expectedMime);
		this.textResources.set(cacheKey, pending);
		try {
			return await pending;
		} catch (error) {
			this.textResources.delete(cacheKey);
			throw error;
		}
	}

	private async resolveTextResourceNow(
		path: string,
		expectedMime: string,
	): Promise<string | null> {
		const result = await this.request<ResourceResult | null>({ path, type: "resource" });
		if (
			!result ||
			result.mime !== expectedMime ||
			result.data.byteLength > MAX_LOCAL_TEXT_RESOURCE_BYTES
		) {
			return null;
		}
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(result.data);
		} catch {
			return null;
		}
	}

	private failAll(error: Error): void {
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
	}
}
function packageCorrupt(): DictionaryError {
	return new DictionaryError("invalid-response", dictionaryText().compiledCorrupt);
}

function safeMime(value: string): boolean {
	return /^(?:text\/(?:css|html|javascript|plain|vtt)|application\/(?:json|manifest\+json|octet-stream|vnd\.ms-fontobject|wasm|xml)|image\/(?:apng|avif|bmp|gif|jpeg|png|svg\+xml|webp|x-icon)|audio\/(?:aac|flac|mp4|mpeg|ogg|opus|wav|webm)|video\/(?:mp4|ogg|quicktime|webm)|font\/(?:otf|ttf|woff|woff2))$/.test(
		value,
	);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

class ResourceUrlLru {
	private bytes = 0;
	private readonly values = new Map<string, { bytes: number; url: string }>();

	constructor(private readonly budget: number) {}

	clear(): void {
		for (const value of this.values.values()) revokeDictionaryResourceUrl(value.url);
		this.values.clear();
		this.bytes = 0;
	}

	get(key: string): string | null {
		const value = this.values.get(key);
		if (!value) return null;
		this.values.delete(key);
		this.values.set(key, value);
		return value.url;
	}

	set(key: string, url: string, bytes: number): void {
		const previous = this.values.get(key);
		if (previous) {
			revokeDictionaryResourceUrl(previous.url);
			this.bytes -= previous.bytes;
		}
		this.values.delete(key);
		this.values.set(key, { bytes, url });
		this.bytes += bytes;
		while (this.bytes > this.budget) {
			const oldest = this.values.entries().next().value as
				| [string, { bytes: number; url: string }]
				| undefined;
			if (!oldest) break;
			this.values.delete(oldest[0]);
			this.bytes -= oldest[1].bytes;
			revokeDictionaryResourceUrl(oldest[1].url);
		}
	}
}
