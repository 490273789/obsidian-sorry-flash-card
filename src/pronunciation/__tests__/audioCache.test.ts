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

interface FakeAudioRecord {
	key: string;
	data: ArrayBuffer;
	mimeType: string;
	size: number;
	lastAccess: number;
}

class FakeIndexedDbFactory {
	private readonly databases = new Map<
		string,
		{ hasAudioStore: boolean; records: Map<string, FakeAudioRecord> }
	>();

	open(name: string): IDBOpenDBRequest {
		const state = this.databases.get(name) ?? {
			hasAudioStore: false,
			records: new Map<string, FakeAudioRecord>(),
		};
		this.databases.set(name, state);
		const request = {} as IDBOpenDBRequest;
		const database = {
			objectStoreNames: {
				contains: (storeName: string) => storeName === "audio" && state.hasAudioStore,
			},
			createObjectStore: () => {
				state.hasAudioStore = true;
			},
			transaction: () => {
				const transaction = {} as IDBTransaction;
				const objectStore = {
					get: (key: string) =>
						makeFakeRequest(() => cloneFakeRecord(state.records.get(key))),
					getAll: () =>
						makeFakeRequest(() =>
							Array.from(state.records.values()).map((record) =>
								cloneFakeRecord(record),
							),
						),
					put: (record: FakeAudioRecord) =>
						makeFakeRequest(() => {
							state.records.set(record.key, cloneFakeRecord(record)!);
							return record.key;
						}),
					delete: (key: string) =>
						makeFakeRequest(() => {
							state.records.delete(key);
							return undefined;
						}),
					clear: () =>
						makeFakeRequest(() => {
							state.records.clear();
							return undefined;
						}),
				} as unknown as IDBObjectStore;
				transaction.objectStore = () => objectStore;
				return transaction;
			},
		} as unknown as IDBDatabase;

		queueMicrotask(() => {
			Object.defineProperty(request, "result", { value: database, configurable: true });
			if (!state.hasAudioStore) request.onupgradeneeded?.({} as IDBVersionChangeEvent);
			request.onsuccess?.({} as Event);
		});
		return request;
	}
}

function makeFakeRequest<T>(read: () => T): IDBRequest<T> {
	const request = {} as IDBRequest<T>;
	queueMicrotask(() => {
		Object.defineProperty(request, "result", { value: read(), configurable: true });
		request.onsuccess?.({} as Event);
	});
	return request;
}

function cloneFakeRecord(record: FakeAudioRecord | undefined): FakeAudioRecord | undefined {
	return record
		? {
				...record,
				data: record.data.slice(0),
			}
		: undefined;
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

	it("replaces an in-memory entry without inflating cache usage", async () => {
		const cache = new MemoryPronunciationAudioCache(5);
		const audio = {
			data: new Uint8Array([1, 2, 3]).buffer,
			mimeType: "audio/mpeg",
		};

		await cache.put("same", audio);
		await cache.put("same", audio);

		expect(await cache.get("same")).not.toBeNull();
		expect(await cache.getUsageBytes()).toBe(3);
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

	it("enforces the cache limit against IndexedDB records from a previous instance", async () => {
		const indexedDb = new FakeIndexedDbFactory() as unknown as IDBFactory;
		const firstInstance = new IndexedDbPronunciationAudioCache("persisted", 5, indexedDb);
		await firstInstance.put("older", {
			data: new Uint8Array([1, 2, 3, 4]).buffer,
			mimeType: "audio/mpeg",
		});

		const secondInstance = new IndexedDbPronunciationAudioCache("persisted", 5, indexedDb);
		await secondInstance.put("newer", {
			data: new Uint8Array([5, 6, 7]).buffer,
			mimeType: "audio/mpeg",
		});

		expect(await secondInstance.getUsageBytes()).toBe(3);
	});
});
