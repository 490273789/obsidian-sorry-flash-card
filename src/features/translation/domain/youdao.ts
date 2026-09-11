import { AiError } from "../../../core/ai/types";
import { TransportError, type OutboundPort } from "../../../core/net/types";
import {
	buildYoudaoV3Body as buildYoudaoV3BodyFromSign,
	youdaoV3SignInput,
} from "../../../core/shared/youdaoSign";

export interface YoudaoConnection {
	baseUrl: string;
	appKeySecretId: string;
	appSecretSecretId: string;
}

/**
 * The v3 signing algorithm is shared with the dictionary tool; only the form
 * fields differ between translation and dictionary lookups.
 */
export { youdaoV3SignInput };

export async function buildYoudaoV3Body(options: {
	appKey: string;
	appSecret: string;
	query: string;
	from: string;
	to: string;
}): Promise<string> {
	return buildYoudaoV3BodyFromSign({
		appKey: options.appKey,
		appSecret: options.appSecret,
		fields: { from: options.from, to: options.to },
		query: options.query,
	});
}

function validateConnection(connection: YoudaoConnection, text: string): string {
	if (!connection.appKeySecretId.trim() || !connection.appSecretSecretId.trim())
		throw new AiError("invalid-config");
	if (!text.trim()) throw new AiError("invalid-input");
	try {
		const url = new URL(connection.baseUrl.trim());
		if (
			!["https:", "http:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		)
			throw new Error();
		return url.toString();
	} catch {
		throw new AiError("invalid-config");
	}
}

function parseResponse(text: string): { text: string; usage: null } {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new TransportError("invalid-response");
	}
	if (!data || typeof data !== "object" || Array.isArray(data))
		throw new TransportError("invalid-response");
	const result = data as Record<string, unknown>;
	if (typeof result.errorCode !== "string" && typeof result.errorCode !== "number")
		throw new TransportError("invalid-response");
	const code = String(result.errorCode);
	if (code !== "0") {
		throw new TransportError(
			["108", "111", "202", "203"].includes(code)
				? "unauthorized"
				: ["411", "412"].includes(code)
					? "rate-limited"
					: "server",
		);
	}
	if (!Array.isArray(result.translation)) throw new TransportError("invalid-response");
	const translations = result.translation.filter(
		(value): value is string => typeof value === "string" && Boolean(value.trim()),
	);
	if (!translations.length) throw new TransportError("invalid-response");
	return { text: translations.join("\n"), usage: null };
}

export async function translateYoudao(
	connection: YoudaoConnection,
	text: string,
	direction: "zh-en" | "en-zh",
	net: Pick<OutboundPort, "request" | "readSecret">,
	signal?: AbortSignal,
): Promise<{ text: string; usage: null }> {
	const endpoint = validateConnection(connection, text);
	let appKey: string | null;
	let appSecret: string | null;
	try {
		appKey = net.readSecret(connection.appKeySecretId.trim());
		appSecret = net.readSecret(connection.appSecretSecretId.trim());
	} catch {
		throw new AiError("missing-key");
	}
	if (!appKey?.trim() || !appSecret?.trim()) throw new AiError("missing-key");
	const body = await buildYoudaoV3Body({
		appKey: appKey.trim(),
		appSecret: appSecret.trim(),
		query: text.trim(),
		...(direction === "zh-en" ? { from: "zh-CHS", to: "en" } : { from: "en", to: "zh-CHS" }),
	});
	try {
		const response = await net.request({
			label: "translation-youdao",
			url: endpoint,
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body,
			signal,
		});
		return parseResponse(response.text);
	} catch (error) {
		if (error instanceof AiError || error instanceof TransportError) throw error;
		throw new TransportError("network", { cause: error });
	}
}
