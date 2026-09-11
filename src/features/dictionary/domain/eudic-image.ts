import { dictionaryText } from "./messages";
import { DictionaryError } from "./types";

export const EUDIC_IMAGE_RESOURCE_KIND = "eudic-word-card-en-v2" as const;
export const MAX_EUDIC_DICTIONARY_BYTES = 512 * 1_048_576;

const EUDIC_RESOURCE_PREFIX = `${EUDIC_IMAGE_RESOURCE_KIND}/`;
const EUDIC_REMOTE_ORIGIN = "https://fs-gateway.frdic.com";
const EUDIC_REMOTE_PATH = "/buckets/main/store_main/word_card/v2/en/";
const MAX_REMOTE_IMAGE_BYTES = 4_194_304;
const REMOTE_TIMEOUT_MS = 12_000;

export type EudicFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function eudicResourceUrl(path: string): string | null {
	if (!path.startsWith(EUDIC_RESOURCE_PREFIX)) return null;
	const fileName = path.slice(EUDIC_RESOURCE_PREFIX.length);
	if (!/^[a-z\d][a-z\d._'-]{0,240}\.jpg$/i.test(fileName)) return null;
	const url = new URL(`${EUDIC_REMOTE_PATH}${fileName}`, EUDIC_REMOTE_ORIGIN);
	return url.origin === EUDIC_REMOTE_ORIGIN && url.pathname.startsWith(EUDIC_REMOTE_PATH)
		? url.href
		: null;
}

async function readBoundedImage(response: Response): Promise<Uint8Array> {
	const declaredLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_IMAGE_BYTES) {
		throw new DictionaryError("invalid-response", dictionaryText().errors.responseTooLarge);
	}
	if (!response.body) {
		const data = new Uint8Array(await response.arrayBuffer());
		if (data.byteLength > MAX_REMOTE_IMAGE_BYTES) {
			throw new DictionaryError("invalid-response", dictionaryText().errors.responseTooLarge);
		}
		return data;
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	let completed = false;
	try {
		while (true) {
			// oxlint-disable-next-line no-await-in-loop -- the response stream must be consumed in order.
			const item = await reader.read();
			if (item.done) {
				completed = true;
				break;
			}
			totalBytes += item.value.byteLength;
			if (totalBytes > MAX_REMOTE_IMAGE_BYTES) {
				throw new DictionaryError(
					"invalid-response",
					dictionaryText().errors.responseTooLarge,
				);
			}
			chunks.push(item.value);
		}
	} finally {
		if (!completed) await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
	if (totalBytes === 0) {
		throw new DictionaryError("empty-response", dictionaryText().errors.emptyResponse);
	}
	const data = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		data.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return data;
}

function toBase64(data: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < data.byteLength; offset += 0x8000) {
		binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}

/**
 * Deliberate exception to the "use Obsidian request APIs" rule: this loader
 * keeps the raw `fetch` because it must pass `redirect: 'error'`.
 *
 * Refusing redirects is a security invariant here: host pinning and the JPEG
 * MIME check only constrain the requested URL, so a redirect could silently
 * send the request to an arbitrary origin. Obsidian's `requestUrl` follows
 * redirects and exposes no way to disable that, so it cannot express this
 * policy; `credentials: 'omit'` additionally guarantees no ambient cookies are
 * sent to the image host.
 */
export class EudicImageResourceLoader {
	private readonly controllers = new Set<AbortController>();

	constructor(
		private readonly fetcher: EudicFetch = (input, init) => globalThis.fetch(input, init),
	) {}

	close(): void {
		for (const controller of this.controllers) controller.abort();
		this.controllers.clear();
	}

	async resolve(path: string): Promise<string | null> {
		const url = eudicResourceUrl(path);
		if (!url) return null;
		const controller = new AbortController();
		const timeout = globalThis.setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
		this.controllers.add(controller);
		try {
			const response = await this.fetcher(url, {
				credentials: "omit",
				redirect: "error",
				referrerPolicy: "no-referrer",
				signal: controller.signal,
			});
			if (!response.ok) {
				const code = response.status === 429 ? "rate-limit" : "server";
				throw new DictionaryError(
					code,
					dictionaryText().eudicImageUnavailable,
					response.status,
				);
			}
			if (response.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "image/jpeg") {
				throw new DictionaryError(
					"invalid-response",
					dictionaryText().errors.invalidResponse,
				);
			}
			const data = await readBoundedImage(response);
			return `data:image/jpeg;base64,${toBase64(data)}`;
		} catch (error) {
			if (error instanceof DictionaryError) throw error;
			throw new DictionaryError(
				"network",
				controller.signal.aborted
					? dictionaryText().errors.timeout
					: dictionaryText().eudicImageUnavailable,
			);
		} finally {
			globalThis.clearTimeout(timeout);
			this.controllers.delete(controller);
		}
	}
}
