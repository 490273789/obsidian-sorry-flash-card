import type {
	CachedPronunciationAudio,
	PronunciationAudioCache,
	PronunciationRequestDescriptor,
} from "./types";
import { PRONUNCIATION_CACHE_LIMIT_BYTES } from "./types";

interface AudioCacheRecord extends CachedPronunciationAudio {
	key: string;
	size: number;
	lastAccess: number;
}

export class MemoryPronunciationAudioCache implements PronunciationAudioCache {
	private records = new Map<string, AudioCacheRecord>();

	constructor(
		private readonly limitBytes = PRONUNCIATION_CACHE_LIMIT_BYTES,
		private readonly now: () => number = Date.now,
	) {}

	async get(key: string): Promise<CachedPronunciationAudio | null> {
		const record = this.records.get(key);
		if (!record) return null;
		record.lastAccess = this.now();
		return {
			data: record.data.slice(0),
			mimeType: record.mimeType,
		};
	}

	async put(key: string, audio: CachedPronunciationAudio): Promise<void> {
		this.records.set(key, {
			key,
			data: audio.data.slice(0),
			mimeType: audio.mimeType,
			size: audio.data.byteLength,
			lastAccess: this.now(),
		});
		this.evict();
	}

	async getUsageBytes(): Promise<number> {
		return Array.from(this.records.values()).reduce((total, record) => total + record.size, 0);
	}

	async clear(): Promise<void> {
		this.records.clear();
	}

	private evict(): void {
		let usage = Array.from(this.records.values()).reduce(
			(total, record) => total + record.size,
			0,
		);
		if (usage <= this.limitBytes) return;
		const records = Array.from(this.records.values()).sort(
			(left, right) => left.lastAccess - right.lastAccess,
		);
		for (const record of records) {
			if (usage <= this.limitBytes) break;
			this.records.delete(record.key);
			usage -= record.size;
		}
	}
}

export class IndexedDbPronunciationAudioCache implements PronunciationAudioCache {
	private readonly memoryFallback: MemoryPronunciationAudioCache;
	private disabled = false;
	private databasePromise: Promise<IDBDatabase> | null = null;

	constructor(
		private readonly databaseName = "wsr-flash-card-pronunciation-cache",
		private readonly limitBytes = PRONUNCIATION_CACHE_LIMIT_BYTES,
		private readonly indexedDb: IDBFactory | null = typeof indexedDB === "undefined"
			? null
			: indexedDB,
	) {
		this.memoryFallback = new MemoryPronunciationAudioCache(limitBytes);
		if (!indexedDb) this.disabled = true;
	}

	async get(key: string): Promise<CachedPronunciationAudio | null> {
		if (this.disabled) return this.memoryFallback.get(key);
		try {
			const database = await this.open();
			const record = await getRecord(database, key);
			if (!record) return this.memoryFallback.get(key);
			record.lastAccess = Date.now();
			await putRecord(database, record);
			return {
				data: record.data.slice(0),
				mimeType: record.mimeType,
			};
		} catch {
			this.disabled = true;
			return this.memoryFallback.get(key);
		}
	}

	async put(key: string, audio: CachedPronunciationAudio): Promise<void> {
		if (this.disabled) {
			await this.memoryFallback.put(key, audio);
			return;
		}
		try {
			const database = await this.open();
			await putRecord(database, {
				key,
				data: audio.data.slice(0),
				mimeType: audio.mimeType,
				size: audio.data.byteLength,
				lastAccess: Date.now(),
			});
			await this.evict(database);
		} catch {
			this.disabled = true;
			await this.memoryFallback.put(key, audio);
		}
	}

	async getUsageBytes(): Promise<number> {
		if (this.disabled) return this.memoryFallback.getUsageBytes();
		try {
			const records = await getAllRecords(await this.open());
			return records.reduce((total, record) => total + record.size, 0);
		} catch {
			this.disabled = true;
			return this.memoryFallback.getUsageBytes();
		}
	}

	async clear(): Promise<void> {
		await this.memoryFallback.clear();
		if (this.disabled) return;
		try {
			await clearRecords(await this.open());
		} catch {
			this.disabled = true;
		}
	}

	private open(): Promise<IDBDatabase> {
		if (this.databasePromise) return this.databasePromise;
		if (!this.indexedDb) return Promise.reject(new Error("IndexedDB is unavailable"));
		this.databasePromise = new Promise((resolve, reject) => {
			const request = this.indexedDb!.open(this.databaseName, 1);
			request.onupgradeneeded = () => {
				const database = request.result;
				if (database.objectStoreNames.contains("audio")) return;
				database.createObjectStore("audio", { keyPath: "key" });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(request.error ?? new Error("Failed to open audio cache"));
		});
		return this.databasePromise;
	}

	private async evict(database: IDBDatabase): Promise<void> {
		const records = await getAllRecords(database);
		let usage = records.reduce((total, record) => total + record.size, 0);
		if (usage <= this.limitBytes) return;
		records.sort((left, right) => left.lastAccess - right.lastAccess);
		for (const record of records) {
			if (usage <= this.limitBytes) break;
			await deleteRecord(database, record.key);
			usage -= record.size;
		}
	}
}

export async function createPronunciationCacheKey(
	descriptor: PronunciationRequestDescriptor,
	cryptoProvider: Crypto | null = typeof crypto === "undefined" ? null : crypto,
): Promise<string> {
	if (!cryptoProvider?.subtle) {
		throw new Error("Web Crypto is unavailable");
	}
	const payload = JSON.stringify({
		version: 1,
		provider: descriptor.provider,
		variant: descriptor.variant,
		accent: descriptor.accent,
		rate: descriptor.rate,
		text: descriptor.text,
	});
	const digest = await cryptoProvider.subtle.digest("SHA-256", new TextEncoder().encode(payload));
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function getRecord(database: IDBDatabase, key: string): Promise<AudioCacheRecord | null> {
	return new Promise((resolve, reject) => {
		const request = database.transaction("audio", "readonly").objectStore("audio").get(key);
		request.onsuccess = () => resolve((request.result as AudioCacheRecord | undefined) ?? null);
		request.onerror = () => reject(request.error ?? new Error("Failed to read audio cache"));
	});
}

function getAllRecords(database: IDBDatabase): Promise<AudioCacheRecord[]> {
	return new Promise((resolve, reject) => {
		const request = database.transaction("audio", "readonly").objectStore("audio").getAll();
		request.onsuccess = () => resolve(request.result as AudioCacheRecord[]);
		request.onerror = () => reject(request.error ?? new Error("Failed to list audio cache"));
	});
}

function putRecord(database: IDBDatabase, record: AudioCacheRecord): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = database.transaction("audio", "readwrite").objectStore("audio").put(record);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error ?? new Error("Failed to write audio cache"));
	});
}

function deleteRecord(database: IDBDatabase, key: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = database.transaction("audio", "readwrite").objectStore("audio").delete(key);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error ?? new Error("Failed to evict audio cache"));
	});
}

function clearRecords(database: IDBDatabase): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = database.transaction("audio", "readwrite").objectStore("audio").clear();
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error ?? new Error("Failed to clear audio cache"));
	});
}
