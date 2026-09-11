import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
import { dictionaryText } from "./messages";
import { prepareDictionarySandboxDocument, type SandboxDocument } from "./sandbox-document";
import {
	DictionaryError,
	dictionaryErrorCodeMessage,
	type DictionaryErrorCode,
	type DictionaryQuery,
	type DictionaryResult,
	type Pronunciation,
} from "./types";

export const ONLINE_DICTIONARY_TIMEOUT_MS = 12_000;
export const MAX_ONLINE_DICTIONARY_RESPONSE_BYTES = 2_000_000;

/**
 * Maps an HTTP status onto the dictionary error taxonomy. Ported from the
 * source project's `core/ai-client` so the shared HTML lookup skeleton keeps
 * classifying transport failures identically without importing that project.
 */
export function statusErrorCode(status: number): DictionaryErrorCode {
	if (status === 401 || status === 403) return "unauthorized";
	if (status === 404) return "not-found";
	if (status === 429) return "rate-limit";
	if (status >= 500) return "server";
	return "request";
}

export type OnlineRequestExecutor = (request: RequestUrlParam) => Promise<RequestUrlResponse>;
export type OnlineTextRequestExecutor = (request: RequestUrlParam) => Promise<string>;

export function cleanOnlineText(value: string, limit = 1_000): string {
	return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function escapeDictionaryHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function parseOnlineDocument(value: string): Document {
	return new DOMParser().parseFromString(value, "text/html");
}

export async function prepareOnlineDictionaryDocument(
	html: string,
	stylesheet: string,
): Promise<SandboxDocument> {
	return prepareDictionarySandboxDocument(html, async () => null, stylesheet);
}

export interface OnlineHtmlDictionaryParsed {
	html: string;
	pronunciations: Pronunciation[];
	suggestions: string[];
	word: string;
}

export interface OnlineHtmlDictionarySource {
	readonly attribution: string;
	readonly id: string;
	readonly label: string;
	readonly styles: string;
	parse(documentNode: Document, query: string): OnlineHtmlDictionaryParsed;
	request(query: string): Promise<string>;
}

/**
 * Runs the shared HTML dictionary lookup skeleton for an online source:
 * request, parse, empty-result handling, sanitization, and assembly. Each
 * source only provides request + parse + presentation details.
 */
export async function lookupOnlineHtmlDictionary(
	query: DictionaryQuery,
	source: OnlineHtmlDictionarySource,
): Promise<DictionaryResult> {
	const parsed = source.parse(parseOnlineDocument(await source.request(query.text)), query.text);
	if (!parsed.html && parsed.suggestions.length === 0) {
		throw new DictionaryError("not-found", dictionaryText().errors.notFound);
	}
	return {
		attribution: source.attribution,
		pronunciations: parsed.pronunciations,
		sections: parsed.html
			? [
					{
						content: {
							document: await prepareOnlineDictionaryDocument(
								parsed.html,
								source.styles,
							),
							kind: "document",
						},
						presentation: "stack",
						title: dictionaryText().sections.definitions,
					},
				]
			: [],
		sourceId: source.id,
		sourceLabel: source.label,
		suggestions: parsed.suggestions,
		word: parsed.word,
	};
}

function errorForStatus(status: number): DictionaryError {
	const code = statusErrorCode(status);
	return new DictionaryError(code, dictionaryErrorCodeMessage(code, dictionaryText()), status);
}

export async function requestOnlineResponse(
	request: RequestUrlParam,
	execute: OnlineRequestExecutor,
): Promise<RequestUrlResponse> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new DictionaryError("network", dictionaryText().errors.timeout)),
				ONLINE_DICTIONARY_TIMEOUT_MS,
			);
		});
		const response = await Promise.race([execute({ ...request, throw: false }), timeout]);
		if (response.status < 200 || response.status >= 400) throw errorForStatus(response.status);
		if (response.arrayBuffer.byteLength > MAX_ONLINE_DICTIONARY_RESPONSE_BYTES) {
			throw new DictionaryError("invalid-response", dictionaryText().errors.responseTooLarge);
		}
		return response;
	} catch (error) {
		if (error instanceof DictionaryError) throw error;
		throw new DictionaryError("network", dictionaryText().errors.network);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

export async function requestOnlineDictionary(
	url: string,
	execute: OnlineRequestExecutor,
	headers: Readonly<Record<string, string>> = {},
): Promise<string> {
	const response = await requestOnlineResponse(
		{
			headers: {
				Accept: "text/html,application/xhtml+xml",
				"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
				...headers,
			},
			method: "GET",
			url,
		},
		execute,
	);
	return response.text;
}

export async function requestOnlineText(
	request: RequestUrlParam,
	execute: OnlineTextRequestExecutor,
): Promise<string> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new DictionaryError("network", dictionaryText().errors.timeout)),
				ONLINE_DICTIONARY_TIMEOUT_MS,
			);
		});
		const text = await Promise.race([execute(request), timeout]);
		if (new TextEncoder().encode(text).byteLength > MAX_ONLINE_DICTIONARY_RESPONSE_BYTES) {
			throw new DictionaryError("invalid-response", dictionaryText().errors.responseTooLarge);
		}
		return text;
	} catch (error) {
		if (error instanceof DictionaryError) throw error;
		throw new DictionaryError("network", dictionaryText().errors.network);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}
