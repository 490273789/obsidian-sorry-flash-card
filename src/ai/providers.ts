import { isRecord, validateAiConnection } from "./configuration";
import {
	AiError,
	type AiDependencies,
	type AiEngineConfig,
	type AiMessage,
	type AiModel,
} from "./types";

export function knownImageInput(config: AiEngineConfig): AiModel["imageInput"] {
	// Limit static knowledge to the official endpoint; proxies may remap model IDs.
	if (config.provider === "deepseek" && new URL(config.baseUrl).hostname === "api.deepseek.com") {
		if (["deepseek-v4-flash", "deepseek-v4-pro"].includes(config.model)) return "unsupported";
		if (config.model === "deepseek-v4-flash-vision-exp") return "supported";
	}
	return "unknown";
}

export async function callAiJson(
	deps: AiDependencies,
	config: AiEngineConfig,
	url: string,
	body?: unknown,
	checkActive: () => void = () => {},
): Promise<unknown> {
	validateAiConnection(config);
	checkActive();
	let key: string | null;
	try {
		key = await deps.readSecret(config.secretId);
	} catch {
		throw new AiError("missing-key");
	}
	checkActive();
	if (!key?.trim()) throw new AiError("missing-key");
	let response;
	try {
		response = await deps.request({
			url,
			method: body === undefined ? "GET" : "POST",
			headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch {
		throw new AiError("network");
	}
	checkActive();
	if (response.status < 200 || response.status >= 300) {
		throw new AiError(
			response.status === 401 || response.status === 403
				? "unauthorized"
				: response.status === 429
					? "rate-limited"
					: "provider-error",
			response.status,
		);
	}
	try {
		return JSON.parse(response.text);
	} catch {
		throw new AiError("invalid-response");
	}
}

export function encodeMessages(messages: readonly AiMessage[]): unknown[] {
	if (!messages.length) throw new AiError("invalid-input");
	return messages.map((message) => {
		if (
			!["system", "user", "assistant"].includes(message.role) ||
			typeof message.text !== "string" ||
			(!message.text.trim() && !message.images?.length)
		)
			throw new AiError("invalid-input");
		if (!message.images?.length) return { role: message.role, content: message.text };
		if (message.role !== "user") throw new AiError("invalid-input");
		return {
			role: message.role,
			content: [
				...(message.text ? [{ type: "text", text: message.text }] : []),
				...message.images.map((image) => {
					if (
						!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
							image.mimeType,
						) ||
						!image.base64 ||
						image.base64.length % 4 !== 0 ||
						!/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)
					)
						throw new AiError("invalid-input");
					return {
						type: "image_url",
						image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
					};
				}),
			],
		};
	});
}

export function readTextResponse(data: unknown): string {
	if (!isRecord(data) || !Array.isArray(data.choices)) throw new AiError("invalid-response");
	const choice: unknown = data.choices[0];
	if (!isRecord(choice) || !isRecord(choice.message)) throw new AiError("invalid-response");
	if (choice.finish_reason !== "stop") throw new AiError("incomplete-response");
	if (typeof choice.message.content !== "string" || !choice.message.content.trim())
		throw new AiError("invalid-response");
	return choice.message.content;
}

function usageInteger(value: unknown): number | null {
	return typeof value === "number" &&
		Number.isFinite(value) &&
		Number.isInteger(value) &&
		value >= 0
		? value
		: null;
}

/** Return undefined when the provider did not report usage, preserving legacy result shape. */
export function readUsage(
	data: unknown,
): { inputTokens: number | null; outputTokens: number | null } | undefined {
	if (!isRecord(data) || !isRecord(data.usage)) return undefined;
	return {
		inputTokens: usageInteger(data.usage.prompt_tokens ?? data.usage.input_tokens),
		outputTokens: usageInteger(data.usage.completion_tokens ?? data.usage.output_tokens),
	};
}

export async function fetchAiModels(
	deps: AiDependencies,
	config: AiEngineConfig,
	checkActive: () => void,
): Promise<AiModel[]> {
	const base = config.baseUrl.replace(/\/+$/, "");
	const nativeBailian = config.provider === "bailian" && base.endsWith("/compatible-mode/v1");
	if (!nativeBailian) {
		const data = await callAiJson(deps, config, `${base}/models`, undefined, checkActive);
		if (!isRecord(data) || !Array.isArray(data.data)) throw new AiError("invalid-response");
		return data.data
			.filter(isRecord)
			.flatMap((item) =>
				typeof item.id === "string"
					? [{ id: item.id, imageInput: knownImageInput({ ...config, model: item.id }) }]
					: [],
			);
	}
	const models: AiModel[] = [];
	for (let page = 1; page <= 100; page++) {
		const url = `${base.replace(/\/compatible-mode\/v1$/, "/api/v1/models")}?page_no=${page}&page_size=100`;
		const data = await callAiJson(deps, config, url, undefined, checkActive);
		if (!isRecord(data) || !isRecord(data.output) || !Array.isArray(data.output.models))
			throw new AiError("invalid-response");
		for (const item of data.output.models) {
			if (!isRecord(item) || typeof item.model !== "string") continue;
			const metadata = isRecord(item.inference_metadata)
				? item.inference_metadata
				: undefined;
			if (
				Array.isArray(metadata?.response_modality) &&
				!metadata.response_modality.includes("Text")
			)
				continue;
			const inputs = metadata?.request_modality;
			models.push({
				id: item.model,
				imageInput: Array.isArray(inputs)
					? inputs.includes("Image")
						? "supported"
						: "unsupported"
					: "unknown",
			});
		}
		if (
			data.output.models.length === 0 ||
			(typeof data.output.total === "number"
				? page * 100 >= data.output.total
				: data.output.models.length < 100)
		)
			return models;
	}
	throw new AiError("invalid-response");
}
