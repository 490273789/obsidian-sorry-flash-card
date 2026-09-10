import { AiError, type AiDependencies, type AiHttpResponse } from "../ai/types";

export interface YoudaoConnection {
	baseUrl: string;
	appKeySecretId: string;
	appSecretSecretId: string;
}

export function youdaoV3SignInput(query: string): string {
	const characters = [...query];
	return characters.length <= 20
		? query
		: `${characters.slice(0, 10).join("")}${characters.length}${characters.slice(-10).join("")}`;
}

async function sha256(value: string): Promise<string> {
	const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildYoudaoV3Body(options: {
	appKey: string;
	appSecret: string;
	query: string;
	from: string;
	to: string;
}): Promise<string> {
	const salt = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const curtime = Math.floor(Date.now() / 1000).toString();
	const sign = await sha256(
		`${options.appKey}${youdaoV3SignInput(options.query)}${salt}${curtime}${options.appSecret}`,
	);
	return new URLSearchParams({
		appKey: options.appKey,
		curtime,
		from: options.from,
		q: options.query,
		salt,
		sign,
		signType: "v3",
		to: options.to,
	}).toString();
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

function parseResponse(response: AiHttpResponse): { text: string; usage: null } {
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
	let data: unknown;
	try {
		data = JSON.parse(response.text);
	} catch {
		throw new AiError("invalid-response");
	}
	if (!data || typeof data !== "object" || Array.isArray(data))
		throw new AiError("invalid-response");
	const result = data as Record<string, unknown>;
	if (typeof result.errorCode !== "string" && typeof result.errorCode !== "number")
		throw new AiError("invalid-response");
	const code = String(result.errorCode);
	if (code !== "0") {
		throw new AiError(
			["108", "111", "202", "203"].includes(code)
				? "unauthorized"
				: ["411", "412"].includes(code)
					? "rate-limited"
					: ["302", "303", "304"].includes(code)
						? "provider-error"
						: "provider-error",
		);
	}
	if (!Array.isArray(result.translation)) throw new AiError("invalid-response");
	const translations = result.translation.filter(
		(value): value is string => typeof value === "string" && Boolean(value.trim()),
	);
	if (!translations.length) throw new AiError("invalid-response");
	return { text: translations.join("\n"), usage: null };
}

function run<T>(
	signal: AbortSignal | undefined,
	work: (check: () => void) => Promise<T>,
): Promise<T> {
	if (signal?.aborted) return Promise.reject(new AiError("cancelled"));
	return new Promise<T>((resolve, reject) => {
		let done = false;
		const finish = (failure?: unknown, result?: T) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", cancel);
			if (failure) reject(failure instanceof AiError ? failure : new AiError("network"));
			else resolve(result as T);
		};
		const cancel = () => finish(new AiError("cancelled"));
		const timer = setTimeout(() => finish(new AiError("timeout")), 120_000);
		signal?.addEventListener("abort", cancel, { once: true });
		const check = () => {
			if (done) throw new AiError("cancelled");
		};
		void Promise.resolve()
			.then(() => work(check))
			.then(
				(result) => finish(undefined, result),
				(failure: unknown) => finish(failure),
			);
	});
}

export async function translateYoudao(
	connection: YoudaoConnection,
	text: string,
	direction: "zh-en" | "en-zh",
	deps: Pick<AiDependencies, "request" | "readSecret">,
	signal?: AbortSignal,
): Promise<{ text: string; usage: null }> {
	const endpoint = validateConnection(connection, text);
	return run(signal, async (check) => {
		let appKey: string | null;
		let appSecret: string | null;
		try {
			appKey = await deps.readSecret(connection.appKeySecretId.trim());
			check();
			appSecret = await deps.readSecret(connection.appSecretSecretId.trim());
			check();
		} catch (error) {
			if (error instanceof AiError) throw error;
			throw new AiError("missing-key");
		}
		if (!appKey?.trim() || !appSecret?.trim()) throw new AiError("missing-key");
		const body = await buildYoudaoV3Body({
			appKey: appKey.trim(),
			appSecret: appSecret.trim(),
			query: text.trim(),
			...(direction === "zh-en"
				? { from: "zh-CHS", to: "en" }
				: { from: "en", to: "zh-CHS" }),
		});
		check();
		let response: AiHttpResponse;
		try {
			response = await deps.request({
				url: endpoint,
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body,
			});
		} catch {
			throw new AiError("network");
		}
		check();
		return parseResponse(response);
	});
}
