import { describe, expect, it } from "vitest";
import {
	IndexedDbPronunciationAudioCache,
	MemoryPronunciationAudioCache,
	createPronunciationCacheKey,
} from "../audioCache";
import type { PronunciationRequestDescriptor } from "../types";
import { PRONUNCIATION_CACHE_LIMIT_BYTES } from "../types";

function makeDescriptor(
	overrides: Partial<PronunciationRequestDescriptor> = {},
): PronunciationRequestDescriptor {
	return {
		provider: "azure",
		text: "hello",
		accent: "en-US",
		rate: "normal",
		variant: "china:chinaeast2:en-US-JennyNeural:normal",
		...overrides,
	};
}

describe("pronunciation audio cache", () => {
	it("uses a 100 MB device cache limit", () => {
		expect(PRONUNCIATION_CACHE_LIMIT_BYTES).toBe(100 * 1024 * 1024);
	});

	it("evicts the least recently used audio at the configured limit", async () => {
		let now = 1;
		const cache = new MemoryPronunciationAudioCache(5, () => now++);
		await cache.put("first", {
			data: new Uint8Array([1, 2, 3]).buffer,
			mimeType: "audio/mpeg",
		});
		await cache.put("second", {
			data: new Uint8Array([4, 5]).buffer,
			mimeType: "audio/mpeg",
		});
		await cache.get("first");
		await cache.put("third", {
			data: new Uint8Array([6, 7]).buffer,
			mimeType: "audio/mpeg",
		});

		expect(await cache.get("first")).not.toBeNull();
		expect(await cache.get("second")).toBeNull();
		expect(await cache.get("third")).not.toBeNull();
		expect(await cache.getUsageBytes()).toBe(5);
	});

	it("isolates cache keys by provider, voice variant, accent, rate, and text", async () => {
		const base = await createPronunciationCacheKey(makeDescriptor());
		const variants = await Promise.all([
			createPronunciationCacheKey(makeDescriptor({ provider: "openai" })),
			createPronunciationCacheKey(makeDescriptor({ variant: "different-voice" })),
			createPronunciationCacheKey(makeDescriptor({ accent: "en-GB" })),
			createPronunciationCacheKey(makeDescriptor({ rate: "slow" })),
			createPronunciationCacheKey(makeDescriptor({ text: "hello world" })),
		]);

		expect(new Set([base, ...variants])).toHaveLength(6);
		expect(base).toMatch(/^[a-f0-9]{64}$/);
	});

	it("falls back to memory when IndexedDB is unavailable", async () => {
		const cache = new IndexedDbPronunciationAudioCache("test", 100, null);
		await cache.put("hello", {
			data: new Uint8Array([1, 2, 3]).buffer,
			mimeType: "audio/mpeg",
		});

		expect(await cache.get("hello")).toMatchObject({ mimeType: "audio/mpeg" });
		expect(await cache.getUsageBytes()).toBe(3);
		await cache.clear();
		expect(await cache.getUsageBytes()).toBe(0);
	});
});
