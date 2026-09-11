import type { OutboundPort, TransportErrorCode } from "../net/types";

export type AiProvider = "deepseek" | "bailian" | "youdao";

export interface AiEngineConfig {
	id: string;
	name: string;
	provider: AiProvider;
	baseUrl: string;
	/** Obsidian SecretStorage identifier; never the API key itself. */
	secretId: string;
	model: string;
}

export interface AiSettings {
	configs: AiEngineConfig[];
	defaultConfigId: string | null;
}

export interface AiModel {
	id: string;
	imageInput: "supported" | "unsupported" | "unknown";
}

export interface AiMessage {
	role: "system" | "user" | "assistant";
	text: string;
	/** Base64-encoded image bytes, without a data URL prefix. */
	images?: readonly {
		mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
		base64: string;
	}[];
}

export interface AiRequestOptions {
	timeoutMs?: number;
	signal?: AbortSignal;
}

export interface AiGenerateRequest extends AiRequestOptions {
	/** Omit to use the global default. Explicit missing IDs never fall back. */
	configId?: string;
	/** Request provider-specific reasoning when the selected engine supports it. */
	thinkingEnabled?: boolean;
	/** Ask the provider for a JSON object response (`response_format`). */
	jsonMode?: boolean;
	messages: readonly AiMessage[];
}

export interface AiTextResult {
	text: string;
	configId: string;
	model: string;
	usage?: { inputTokens: number | null; outputTokens: number | null } | null;
}

export type AiErrorCode =
	| "busy"
	| "invalid-config"
	| "config-not-found"
	| "no-default"
	| "missing-key"
	| "invalid-input"
	| "unsupported-image"
	| "incomplete-response"
	| "disposed"
	| "save-failed";

/** Domain and transport failures a caller may present for an AI operation. */
export type AiFailureCode = AiErrorCode | TransportErrorCode;

/** Safe diagnostics: no raw response bodies, credentials or prompts. */
export class AiError extends Error {
	constructor(public readonly code: AiErrorCode) {
		super(code);
		this.name = "AiError";
	}
}

export interface AiDependencies {
	net: Pick<OutboundPort, "request" | "readSecret">;
	persist: (settings: AiSettings) => Promise<void>;
	createId: () => string;
}

export interface AiSnapshot {
	readonly settings: {
		readonly configs: readonly Readonly<AiEngineConfig>[];
		readonly defaultConfigId: string | null;
	};
	readonly models: Readonly<Record<string, readonly Readonly<AiModel>[]>>;
	readonly loadingModels: readonly string[];
	readonly testing: readonly string[];
}
