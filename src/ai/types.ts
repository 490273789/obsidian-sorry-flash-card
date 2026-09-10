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
	| "unauthorized"
	| "rate-limited"
	| "provider-error"
	| "network"
	| "invalid-response"
	| "incomplete-response"
	| "timeout"
	| "cancelled"
	| "disposed"
	| "save-failed";

/** Safe diagnostics: no raw response bodies, credentials or prompts. */
export class AiError extends Error {
	constructor(
		public readonly code: AiErrorCode,
		public readonly httpStatus?: number,
	) {
		super(code);
		this.name = "AiError";
	}
}

export interface AiHttpRequest {
	url: string;
	method: "GET" | "POST";
	headers: Record<string, string>;
	body?: string;
}

export interface AiHttpResponse {
	status: number;
	text: string;
}
export interface AiDependencies {
	request: (request: AiHttpRequest) => Promise<AiHttpResponse>;
	readSecret: (id: string) => string | null | Promise<string | null>;
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
