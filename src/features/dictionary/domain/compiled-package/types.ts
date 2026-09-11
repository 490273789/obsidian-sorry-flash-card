import type { DataAdapter } from "obsidian";
import type { CompiledDictionarySettings } from "../types";

declare const compiledPackageQueryPlanBrand: unique symbol;

export type CompiledPackageSourceFormat = "eudic" | "mdict";

export type CompiledPackageProgressPhase =
	| "validate"
	| "parse"
	| "index"
	| "records"
	| "resources"
	| "verify";

export interface CompiledPackageProgress {
	readonly completedBytes: number;
	readonly fileName: string;
	readonly phase: CompiledPackageProgressPhase;
	readonly totalBytes: number;
}

export type CompiledPackageProgressListener = (progress: CompiledPackageProgress) => void;

export type CompiledPackageErrorCode =
	| "cancelled"
	| "collision"
	| "corrupt"
	| "encrypted"
	| "incompatible"
	| "limit-exceeded"
	| "recovery-incomplete"
	| "storage-failed"
	| "unsupported-format";

export class CompiledPackageError extends Error {
	constructor(
		readonly code: CompiledPackageErrorCode,
		message = "Compiled dictionary package operation failed.",
	) {
		super(message);
		this.name = "CompiledPackageError";
	}
}

export interface CompiledPackageQueryPlan {
	readonly [compiledPackageQueryPlanBrand]: true;
}

export type CompiledPackageRemoteResourceKind = "eudic-word-card-en-v2" | null;

export interface CompiledPackageReader {
	readonly queryPlan: CompiledPackageQueryPlan;
	readonly remoteResourceKind: CompiledPackageRemoteResourceKind;
	readonly script: string;
	readonly stylesheet: string;
	close(): void;
	readFile(path: string): Promise<Uint8Array>;
}

export type CompiledPackageStatus = "ready" | "missing" | "incomplete" | "corrupt" | "incompatible";

export interface CompiledPackagePublishRequest {
	readonly dictionaryDirectory: string;
	readonly files: readonly File[];
	readonly format: CompiledPackageSourceFormat;
}

export interface CompiledPackagePublication {
	readonly metadata: CompiledDictionarySettings;
	commit(): void;
	rollback(): Promise<void>;
}

export interface CompiledPackagePublisher {
	close(): void;
	publish(
		request: CompiledPackagePublishRequest,
		onProgress?: CompiledPackageProgressListener,
		signal?: AbortSignal,
	): Promise<CompiledPackagePublication>;
}

export interface OpenCompiledPackageRequest {
	readonly adapter: DataAdapter;
	readonly cacheBytes: number;
	readonly dictionaryRoot: string;
	readonly expected: Readonly<CompiledDictionarySettings>;
}

export interface InspectCompiledPackageRequest {
	readonly adapter: DataAdapter;
	readonly dictionaryRoot: string;
	readonly expected: Readonly<CompiledDictionarySettings>;
}
