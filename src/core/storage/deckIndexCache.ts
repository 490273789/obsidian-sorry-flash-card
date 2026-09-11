import { normalizePath, type DataAdapter } from "obsidian";

/** Local-only format for Markdown-derived deck content. */
export const DECK_INDEX_CACHE_VERSION = 1;

/**
 * The cache deliberately contains only derived data. It is never required to
 * restore a learner's scheduling state and can be discarded on any device.
 */
export interface DeckIndexCache<TDeck> {
	version: typeof DECK_INDEX_CACHE_VERSION;
	updatedAt: string;
	availableTags: string[];
	decks: Record<string, TDeck>;
}

/**
 * Storage seam for the local deck-index cache. `loadOrRebuild` gives callers
 * one recovery path instead of making every caller reason about missing or
 * malformed cache files.
 */
export interface DeckIndexCacheStore<TDeck> {
	load(): Promise<DeckIndexCache<TDeck> | null>;
	loadOrRebuild(build: () => Promise<DeckIndexCache<TDeck>>): Promise<DeckIndexCache<TDeck>>;
	save(cache: DeckIndexCache<TDeck>): Promise<void>;
	invalidateSource(path: string): Promise<void>;
	clear(): Promise<void>;
}

export function createDeckIndexCacheStore<TDeck>(
	adapter: DataAdapter | undefined,
	pluginDirectory: string | undefined,
): DeckIndexCacheStore<TDeck> | null {
	if (!adapter || !pluginDirectory) return null;
	return new ObsidianDeckIndexCacheStore(adapter, pluginDirectory);
}

class ObsidianDeckIndexCacheStore<TDeck> implements DeckIndexCacheStore<TDeck> {
	private readonly directory: string;
	private readonly path: string;

	constructor(
		private readonly adapter: DataAdapter,
		pluginDirectory: string,
	) {
		this.directory = normalizePath(`${pluginDirectory}/cache`);
		this.path = normalizePath(`${this.directory}/deck-index.json`);
	}

	async loadOrRebuild(
		build: () => Promise<DeckIndexCache<TDeck>>,
	): Promise<DeckIndexCache<TDeck>> {
		const cached = await this.load();
		if (cached) return cached;
		const rebuilt = await build();
		await this.save(rebuilt);
		return rebuilt;
	}

	async save(cache: DeckIndexCache<TDeck>): Promise<void> {
		if (!(await this.adapter.exists(this.directory))) {
			await this.adapter.mkdir(this.directory);
		}
		await this.adapter.write(this.path, JSON.stringify(cache));
	}

	async invalidateSource(path: string): Promise<void> {
		const cache = await this.load();
		if (!cache || !Object.prototype.hasOwnProperty.call(cache.decks, path)) return;
		delete cache.decks[path];
		await this.save(cache);
	}

	async clear(): Promise<void> {
		if (await this.adapter.exists(this.path)) await this.adapter.remove(this.path);
	}

	async load(): Promise<DeckIndexCache<TDeck> | null> {
		try {
			if (!(await this.adapter.exists(this.path))) return null;
			const parsed: unknown = JSON.parse(await this.adapter.read(this.path));
			if (!isDeckIndexCache<TDeck>(parsed)) return null;
			return parsed;
		} catch {
			// A cache corruption must never prevent Markdown-backed learning data from loading.
			return null;
		}
	}
}

function isDeckIndexCache<TDeck>(value: unknown): value is DeckIndexCache<TDeck> {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<DeckIndexCache<TDeck>>;
	return (
		candidate.version === DECK_INDEX_CACHE_VERSION &&
		typeof candidate.updatedAt === "string" &&
		Array.isArray(candidate.availableTags) &&
		Boolean(candidate.decks) &&
		typeof candidate.decks === "object"
	);
}
