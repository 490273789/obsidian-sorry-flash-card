import type { RequestUrlResponse } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	cleanOnlineText,
	escapeDictionaryHtml,
	MAX_ONLINE_DICTIONARY_RESPONSE_BYTES,
	ONLINE_DICTIONARY_TIMEOUT_MS,
	requestOnlineResponse,
	statusErrorCode,
} from "../online";

vi.mock("obsidian", () => ({ request: vi.fn(), requestUrl: vi.fn() }));

afterEach(() => {
	vi.useRealTimers();
});

function response(text = "", status = 200): RequestUrlResponse {
	return {
		arrayBuffer: new TextEncoder().encode(text).buffer,
		headers: {},
		json: {},
		status,
		text,
	};
}

describe("statusErrorCode", () => {
	it.each([
		[401, "unauthorized"],
		[403, "unauthorized"],
		[404, "not-found"],
		[429, "rate-limit"],
		[500, "server"],
		[502, "server"],
		[599, "server"],
		[400, "request"],
		[418, "request"],
		[301, "request"],
		[0, "request"],
	])("maps the status %i to %s", (status, code) => {
		expect(statusErrorCode(status)).toBe(code);
	});
});

describe("cleanOnlineText", () => {
	it("collapses whitespace and trims", () => {
		expect(cleanOnlineText("  a \n\t b   c  ")).toBe("a b c");
		expect(cleanOnlineText("\u00a0padded\u00a0")).toBe("padded");
	});

	it("caps the text at the default and a custom limit", () => {
		expect(cleanOnlineText("x".repeat(1_500))).toHaveLength(1_000);
		expect(cleanOnlineText("abcdef", 3)).toBe("abc");
		expect(cleanOnlineText("", 3)).toBe("");
	});
});

describe("escapeDictionaryHtml", () => {
	it("escapes all five HTML metacharacters", () => {
		expect(escapeDictionaryHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
	});

	it("escapes ampersands before the other entities", () => {
		expect(escapeDictionaryHtml("&amp;")).toBe("&amp;amp;");
		expect(escapeDictionaryHtml("&lt;")).toBe("&amp;lt;");
	});

	it("leaves plain text untouched and escapes a mixed string", () => {
		expect(escapeDictionaryHtml("plain 文本")).toBe("plain 文本");
		expect(escapeDictionaryHtml(`<a href="x">it's & more</a>`)).toBe(
			"&lt;a href=&quot;x&quot;&gt;it&#39;s &amp; more&lt;/a&gt;",
		);
	});
});

describe("online dictionary limits", () => {
	it("exports the documented timeout and byte cap", () => {
		expect(ONLINE_DICTIONARY_TIMEOUT_MS).toBe(12_000);
		expect(MAX_ONLINE_DICTIONARY_RESPONSE_BYTES).toBe(2_000_000);
	});
});

describe("requestOnlineResponse", () => {
	it("disables automatic throwing and returns a 2xx response", async () => {
		const execute = vi.fn(async () => response("ok"));
		await expect(
			requestOnlineResponse({ url: "https://example.test" }, execute),
		).resolves.toMatchObject({ status: 200, text: "ok" });
		expect(execute).toHaveBeenCalledWith({ throw: false, url: "https://example.test" });
	});

	it.each([
		[401, "unauthorized"],
		[404, "not-found"],
		[429, "rate-limit"],
		[502, "server"],
		[400, "request"],
	])("rejects the status %i with the %s code", async (status, code) => {
		await expect(
			requestOnlineResponse({ url: "https://example.test" }, async () =>
				response("", status),
			),
		).rejects.toMatchObject({ code, status });
	});

	it("rejects an oversized response before parsing it", async () => {
		await expect(
			requestOnlineResponse({ url: "https://example.test" }, async () => ({
				...response(),
				arrayBuffer: new ArrayBuffer(MAX_ONLINE_DICTIONARY_RESPONSE_BYTES + 1),
			})),
		).rejects.toMatchObject({ code: "invalid-response" });
	});

	it("maps an executor failure onto the network code", async () => {
		await expect(
			requestOnlineResponse({ url: "https://example.test" }, async () => {
				throw new Error("offline");
			}),
		).rejects.toMatchObject({ code: "network" });
	});

	it("times out a stalled executor after the documented timeout", async () => {
		vi.useFakeTimers();
		const pending = requestOnlineResponse(
			{ url: "https://example.test" },
			() => new Promise<RequestUrlResponse>(() => undefined),
		);
		const settled = pending.catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(ONLINE_DICTIONARY_TIMEOUT_MS);
		await expect(settled).resolves.toMatchObject({ code: "network" });
	});

	it("accepts a response exactly at the byte cap", async () => {
		await expect(
			requestOnlineResponse({ url: "https://example.test" }, async () => ({
				...response(),
				arrayBuffer: new ArrayBuffer(MAX_ONLINE_DICTIONARY_RESPONSE_BYTES),
			})),
		).resolves.toMatchObject({ status: 200 });
	});
});
