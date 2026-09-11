import { normalizePath, type Plugin } from "obsidian";
import { Card, State } from "ts-fsrs";
import {
	Deck,
	FlashCard,
	DeckStats,
	FlashcardSettings,
	StudySettings,
	StudyHistoryEntry,
	SpellingCardProgress,
	StudyRating,
} from "../shared/types";
import { DEFAULT_SETTINGS } from "../host/settingsSlices";
import { FSRSScheduler, toFSRSRating } from "../../features/flashcards/domain/sessions/scheduler";
import type { StudyCardSchedule } from "../../features/flashcards/domain/sessions/sessionEngine";
import type {
	CardIdentityContinuityState,
	ContinuityStateStore,
	PersistedCardIdentityContinuityState,
} from "../../features/flashcards/domain/identity/cardIdentityContinuity";
import type { SessionPersistenceTransition } from "../../features/flashcards/domain/sessions/sessionLifecycle";
import {
	appendStudyHistory,
	createWordListHistoryEntry,
} from "../../features/flashcards/domain/history/studyHistory";
import { cloneSettingsDocument, normalizeSettingsDocument } from "../host/settingsSlices";
import {
	DECK_INDEX_CACHE_VERSION,
	createDeckIndexCacheStore,
	type DeckIndexCache,
	type DeckIndexCacheStore,
} from "./deckIndexCache";

/**
 * Legacy persisted document. It is accepted on read only and migrated to the
 * compact, Sync-safe V2 document after successful loading.
 */
export interface StoredData {
	schemaVersion?: number;
	decks?: Record<string, SerializedDeck>;
	lastSync?: string;
	availableTags?: string[];
	settings?: FlashcardSettings;
	studyHistory?: StudyHistoryEntry[];
	spellingProgress?: Record<string, SpellingCardProgress>;
	continuity?: PersistedCardIdentityContinuityState;
	learning?: LearningStateDocument;
	cache?: { deckIndexVersion: number };
}

/** Versioned data.json document; this is the only learner state that Sync requires. */
export interface PluginDataV2 {
	schemaVersion: 2;
	settings: FlashcardSettings;
	learning: LearningStateDocument;
	cache: { deckIndexVersion: typeof DECK_INDEX_CACHE_VERSION };
}

/** Durable learning state indexed by stable card identity, without Markdown-derived content. */
export interface LearningStateDocument {
	cards: Record<string, PersistedCardLearningState>;
	decks: Record<string, PersistedDeckLearningState>;
	studyHistory: StudyHistoryEntry[];
	spellingProgress: Record<string, SpellingCardProgress>;
	continuity: PersistedCardIdentityContinuityState;
}

export interface PersistedCardLearningState {
	fsrsCard: SerializedFSRSCard;
	/** V2.0 compatibility only; card placement is Markdown-derived and never newly written. */
	sourceFile?: string;
}

export interface PersistedDeckLearningState {
	studyCount: number;
	lastStudied: string | null;
}

/**
 * Serialized deck for storage (with JSON-compatible dates)
 */
export interface SerializedDeck {
	id: string;
	name: string;
	filePath: string;
	tag: string;
	cards: SerializedCard[];
	studyCount: number;
	lastStudied: string | null;
}

/**
 * Serialized card for storage
 */
export interface SerializedCard {
	id: string;
	front: string;
	back: string;
	explanation?: string;
	fsrsCard: SerializedFSRSCard;
	sourceFile: string;
	indexInFile: number;
}

/**
 * Serialized FSRS card
 */
export interface SerializedFSRSCard {
	due: string;
	stability: number;
	difficulty: number;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	state: State;
	last_review: string | null | undefined;
	learning_steps: number;
}

/** Quick lookup for a card's deck + position, keyed by stable card identity. */
interface CardIndexLocation {
	deckId: string;
	cardIndex: number;
}

/**
 * DataStore - handles persistence and management of flashcard data
 */
export class DataStore {
	private plugin: Plugin;
	private readonly deckIndexCache: DeckIndexCacheStore<SerializedDeck> | null;
	/** One writer for data.json. Every state transition is calculated after prior writes settle. */
	private writeTail: Promise<void> = Promise.resolve();
	private decks: Map<string, Deck> = new Map();
	private scheduler: FSRSScheduler;
	private settings: FlashcardSettings;
	private studyHistory: StudyHistoryEntry[] = [];
	private spellingProgress: Record<string, SpellingCardProgress> = {};
	private availableTags: string[] = [];
	private hasAvailableTagsSnapshotValue = false;
	private continuity: PersistedCardIdentityContinuityState = createEmptyContinuityState();
	/** Set to true after loadSettings() has already populated decks/history */
	private dataLoaded = false;
	private revision = 0;
	private readonly revisionListeners = new Set<() => void>();
	/** Card identity -> { deckId, cardIndex } lookup, rebuilt whenever decks are replaced. */
	private cardIndex = new Map<string, CardIndexLocation>();
	/**
	 * Serialization cache keyed by deck object identity. Decks are replaced with
	 * fresh objects whenever their content changes, so a cached entry is valid as
	 * long as the deck reference is unchanged. Avoids re-serializing every deck on
	 * every answer commit.
	 */
	private serializedDeckCache = new WeakMap<Deck, SerializedDeck>();
	/**
	 * Serialization cache keyed by card object identity. Untouched cards retain
	 * their object identity across session transitions, so their serialized form
	 * can be reused without recreating ISO date strings and objects.
	 */
	private serializedCardCache = new WeakMap<FlashCard, SerializedCard>();
	/** Sorted non-new due times per deck, used by DeckHome's next-wake timer. */
	private deckDueTimes = new Map<string, number[]>();
	private deckDueTimesValid = false;

	constructor(plugin: Plugin, settings?: FlashcardSettings) {
		this.plugin = plugin;
		this.deckIndexCache = createDeckIndexCacheStore<SerializedDeck>(
			plugin.app?.vault?.adapter,
			plugin.manifest?.dir,
		);
		this.settings = cloneSettingsDocument(settings ?? DEFAULT_SETTINGS);
		this.scheduler = new FSRSScheduler(this.settings);
	}

	/**
	 * Load settings AND all deck data from disk in a single read.
	 * After this call, load() becomes a no-op.
	 */
	async loadSettings(): Promise<FlashcardSettings> {
		return this.enqueueWrite(async () => {
			const data = (await this.plugin.loadData()) as
				| (StoredData & { flashcardTag?: string })
				| null;
			await this.restoreDocument(data);
			return cloneSettingsDocument(this.settings);
		});
	}

	/**
	 * Save settings to disk
	 */
	async saveSettings(newSettings?: FlashcardSettings): Promise<void> {
		await this.enqueueWrite(async () => {
			const nextSettings = cloneSettingsDocument(newSettings ?? this.settings);
			await this.plugin.saveData(
				this.buildStoredData(
					this.decks,
					this.studyHistory,
					this.spellingProgress,
					nextSettings,
				),
			);
			if (newSettings) {
				this.settings = nextSettings;
				this.scheduler = new FSRSScheduler(this.settings);
				this.publishRevision();
			}
		});
	}

	/**
	 * Get current settings
	 */
	getSettings(): FlashcardSettings {
		return cloneSettingsDocument(this.settings);
	}

	getRevision(): number {
		return this.revision;
	}

	subscribe(listener: () => void): () => void {
		this.revisionListeners.add(listener);
		return () => this.revisionListeners.delete(listener);
	}

	private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
		const pending = this.writeTail.then(operation, operation);
		this.writeTail = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	}

	/**
	 * Load deck data from disk.
	 * No-op if loadSettings() was already called (it loads everything in one read).
	 */
	async load(): Promise<void> {
		if (this.dataLoaded) return;
		await this.loadSettings();
	}

	/**
	 * Save data to disk (includes both decks and settings)
	 */
	async save(): Promise<void> {
		await this.enqueueWrite(async () => {
			await this.plugin.saveData(
				this.buildStoredData(this.decks, this.studyHistory, this.spellingProgress),
			);
		});
	}

	/** Reload the Sync-tracked data.json document after Obsidian reports an external change. */
	async reloadExternalSettings(): Promise<void> {
		await this.enqueueWrite(async () => {
			const data = (await this.plugin.loadData()) as StoredData | null;
			await this.restoreDocument(data, false);
		});
	}

	/**
	 * Atomically applies every persisted effect produced by one session lifecycle transition.
	 * The visible in-memory state changes only after the complete next state is durable.
	 *
	 * Only the decks touched by the transition are cloned; untouched decks keep
	 * their object identity so their cached serialized form stays reusable.
	 */
	async commitSessionTransition(transition: SessionPersistenceTransition): Promise<void> {
		await this.enqueueWrite(async () => {
			const nextDecks = cloneDecksForTransition(this.decks, transition, this.cardIndex);
			const nextSpellingProgress = cloneSpellingProgress(this.spellingProgress);
			const updatedDeckIds = new Set<string>();
			const now = new Date();

			for (const update of transition.cardUpdates) {
				const location = findCardLocation(
					nextDecks,
					update.deckId,
					update.cardId,
					this.cardIndex,
				);
				if (!location) continue;
				updatedDeckIds.add(location.deckId);
				location.deck.cards[location.cardIndex] = {
					...location.deck.cards[location.cardIndex]!,
					fsrsCard: update.fsrsCard,
				};
			}

			for (const deckId of transition.incrementStudyCountFor) {
				const deck = nextDecks.get(deckId);
				if (!deck) continue;
				deck.studyCount++;
				deck.lastStudied = now.toISOString();
			}

			for (const attempt of transition.spellingAttempts) {
				applySpellingAttempt(
					nextSpellingProgress,
					attempt.cardId,
					attempt.correct,
					attempt.attemptedAt,
				);
			}

			const nextHistory = appendStudyHistory(
				this.studyHistory,
				transition.historyEntries,
				now,
			);

			await this.plugin.saveData(
				this.buildStoredData(nextDecks, nextHistory, nextSpellingProgress),
			);
			this.decks = nextDecks;
			this.studyHistory = nextHistory;
			this.spellingProgress = nextSpellingProgress;
			// Card positions are unchanged by a session transition, so the card index
			// stays valid; only the touched decks need their derived caches refreshed.
			for (const deckId of updatedDeckIds) {
				this.refreshDeckDueTimes(deckId, nextDecks);
			}
			this.publishRevision();
		});
	}

	private buildStoredData(
		decks: ReadonlyMap<string, Deck>,
		studyHistory: StudyHistoryEntry[],
		spellingProgress: Record<string, SpellingCardProgress>,
		settings: FlashcardSettings = this.settings,
		continuity: PersistedCardIdentityContinuityState = this.continuity,
	): PluginDataV2 {
		return {
			schemaVersion: 2,
			settings: cloneSettingsDocument(settings),
			learning: this.buildLearningState(decks, studyHistory, spellingProgress, continuity),
			cache: { deckIndexVersion: DECK_INDEX_CACHE_VERSION },
		};
	}

	private buildLearningState(
		decks: ReadonlyMap<string, Deck>,
		studyHistory: StudyHistoryEntry[],
		spellingProgress: Record<string, SpellingCardProgress>,
		continuity: PersistedCardIdentityContinuityState,
	): LearningStateDocument {
		const cards: Record<string, PersistedCardLearningState> = {};
		const persistedDecks: Record<string, PersistedDeckLearningState> = {};
		for (const [deckId, deck] of decks) {
			persistedDecks[deckId] = {
				studyCount: deck.studyCount,
				lastStudied: deck.lastStudied,
			};
			for (const card of deck.cards) {
				cards[card.id] = {
					fsrsCard: this.serializeFSRSCard(card.fsrsCard),
				};
			}
		}
		return {
			cards,
			decks: persistedDecks,
			studyHistory: [...studyHistory],
			spellingProgress: cloneSpellingProgress(spellingProgress),
			continuity: cloneContinuityState(continuity),
		};
	}

	private async restoreDocument(
		data: (StoredData & { flashcardTag?: string }) | null,
		migrateLegacy = true,
	): Promise<void> {
		let rawSettings: unknown = {};
		if (data?.settings) rawSettings = data.settings;
		else if (data && ("flashcardTags" in data || "flashcardTag" in data)) rawSettings = data;
		this.settings = normalizeSettingsDocument(rawSettings);
		this.decks.clear();
		this.availableTags = [];
		this.hasAvailableTagsSnapshotValue = false;

		if (isPluginDataV2(data)) {
			const cache = await this.deckIndexCache?.load();
			if (cache) {
				this.restoreDeckIndexCache(cache, data.learning);
			} else {
				this.restoreLearningPlaceholders(data.learning);
			}
			this.studyHistory = [...data.learning.studyHistory];
			this.spellingProgress = normalizeSpellingProgress(data.learning.spellingProgress);
			this.continuity = cloneContinuityState(data.learning.continuity);
		} else {
			for (const [id, serializedDeck] of Object.entries(data?.decks ?? {})) {
				this.decks.set(id, this.deserializeDeck(serializedDeck));
			}
			this.studyHistory = [...(data?.studyHistory ?? [])];
			this.spellingProgress = normalizeSpellingProgress(data?.spellingProgress);
			this.continuity = cloneContinuityState(
				data?.continuity ?? createEmptyContinuityState(),
			);
			this.restoreAvailableTags(data?.availableTags);
		}

		this.refreshDerivedState();
		this.scheduler = new FSRSScheduler(this.settings);
		this.dataLoaded = true;
		this.publishRevision();

		if (migrateLegacy && data) {
			if (!isPluginDataV2(data)) await this.migrateLegacyDocument(data);
			else if (hasDeprecatedCardPlacement(data.learning)) {
				await this.plugin.saveData(
					this.buildStoredData(this.decks, this.studyHistory, this.spellingProgress),
				);
			}
		}
	}

	private restoreDeckIndexCache(
		cache: DeckIndexCache<SerializedDeck>,
		learning: LearningStateDocument,
	): void {
		for (const [deckId, serializedDeck] of Object.entries(cache.decks)) {
			const deck = this.deserializeDeck(serializedDeck);
			const persistedDeck = learning.decks[deckId];
			if (persistedDeck) {
				deck.studyCount = persistedDeck.studyCount;
				deck.lastStudied = persistedDeck.lastStudied;
			}
			for (const card of deck.cards) {
				const persistedCard = learning.cards[card.id];
				if (persistedCard) card.fsrsCard = this.deserializeFSRSCard(persistedCard.fsrsCard);
			}
			this.decks.set(deckId, deck);
		}
		this.availableTags = [...cache.availableTags];
		this.hasAvailableTagsSnapshotValue = true;
	}

	private restoreLearningPlaceholders(learning: LearningStateDocument): void {
		const decks = new Map<string, Deck>();
		for (const [cardId, state] of Object.entries(learning.cards)) {
			const deckId = state.sourceFile ?? "__markdown-rebuild__";
			let deck = decks.get(deckId);
			if (!deck) {
				const persistedDeck = learning.decks[deckId];
				deck = {
					id: deckId,
					name: deckId.split("/").pop()?.replace(/\.md$/i, "") ?? deckId,
					filePath: deckId,
					tag: "",
					cards: [],
					studyCount: persistedDeck?.studyCount ?? 0,
					lastStudied: persistedDeck?.lastStudied ?? null,
				};
				decks.set(deckId, deck);
			}
			deck.cards.push({
				id: cardId,
				front: "",
				back: "",
				fsrsCard: this.deserializeFSRSCard(state.fsrsCard),
				sourceFile: state.sourceFile ?? "",
				indexInFile: deck.cards.length,
			});
		}
		this.decks = decks;
	}

	private async migrateLegacyDocument(legacy: StoredData): Promise<void> {
		await this.backupLegacyDocument(legacy);
		await this.writeDeckIndexCache(this.decks, this.availableTags);
		await this.plugin.saveData(
			this.buildStoredData(this.decks, this.studyHistory, this.spellingProgress),
		);
	}

	private async backupLegacyDocument(legacy: StoredData): Promise<void> {
		const adapter = this.plugin.app?.vault?.adapter;
		const pluginDirectory = this.plugin.manifest?.dir;
		if (!adapter || !pluginDirectory) return;
		const path = normalizePath(`${pluginDirectory}/data.backup-v1.json`);
		try {
			if (!(await adapter.exists(path))) await adapter.write(path, JSON.stringify(legacy));
		} catch (error) {
			// A backup is defensive only; migration remains safe because data.json is not
			// replaced until the compact document itself has been fully constructed.
			console.warn("Failed to preserve the local legacy data backup:", error);
		}
	}

	private async writeDeckIndexCache(
		decks: ReadonlyMap<string, Deck>,
		availableTags: readonly string[],
	): Promise<void> {
		if (!this.deckIndexCache) return;
		const serializedDecks: Record<string, SerializedDeck> = {};
		for (const [id, deck] of decks) serializedDecks[id] = this.getSerializedDeck(deck);
		try {
			await this.deckIndexCache.save({
				version: DECK_INDEX_CACHE_VERSION,
				updatedAt: new Date().toISOString(),
				availableTags: [...availableTags],
				decks: serializedDecks,
			});
		} catch (error) {
			console.warn("Failed to update the rebuildable deck-index cache:", error);
		}
	}

	private restoreAvailableTags(value: unknown): void {
		if (!Array.isArray(value)) return;
		this.availableTags = Array.from(
			new Set(value.filter((tag): tag is string => typeof tag === "string")),
		);
		this.hasAvailableTagsSnapshotValue = true;
	}

	/**
	 * Returns the serialized form of a deck, reusing the cached copy when the
	 * deck object reference has not changed since the last serialization.
	 */
	private getSerializedDeck(deck: Deck): SerializedDeck {
		const cached = this.serializedDeckCache.get(deck);
		if (cached) return cached;
		const serialized = this.serializeDeck(deck);
		this.serializedDeckCache.set(deck, serialized);
		return serialized;
	}

	/**
	 * Rebuilds every derived cache that depends on the deck collection after the
	 * decks map has been replaced wholesale (load, continuity commit).
	 */
	private refreshDerivedState(): void {
		this.rebuildCardIndex();
		this.deckDueTimesValid = false;
	}

	private rebuildCardIndex(): void {
		this.cardIndex.clear();
		for (const [deckId, deck] of this.decks) {
			for (let index = 0; index < deck.cards.length; index++) {
				const card = deck.cards[index]!;
				if (!this.cardIndex.has(card.id)) {
					this.cardIndex.set(card.id, { deckId, cardIndex: index });
				}
			}
		}
	}

	/** Minimum future due time (epoch ms) among all non-new cards, or null when nothing is due later. */
	getNextDueTime(now: Date): number | null {
		if (!this.deckDueTimesValid) this.rebuildDeckDueTimes();
		const nowMs = now.getTime();
		let min = Infinity;
		for (const dueTimes of this.deckDueTimes.values()) {
			const due = findFirstDueAfter(dueTimes, nowMs);
			if (due !== null && due < min) min = due;
		}
		return min === Infinity ? null : min;
	}

	private rebuildDeckDueTimes(decks: ReadonlyMap<string, Deck> = this.decks): void {
		this.deckDueTimes.clear();
		for (const [deckId, deck] of decks) {
			const dueTimes = collectDeckDueTimes(deck);
			if (dueTimes.length > 0) this.deckDueTimes.set(deckId, dueTimes);
		}
		this.deckDueTimesValid = true;
	}

	private refreshDeckDueTimes(deckId: string, decks: ReadonlyMap<string, Deck>): void {
		if (!this.deckDueTimesValid) return;
		const deck = decks.get(deckId);
		if (!deck) {
			this.deckDueTimes.delete(deckId);
			return;
		}
		const dueTimes = collectDeckDueTimes(deck);
		if (dueTimes.length === 0) this.deckDueTimes.delete(deckId);
		else this.deckDueTimes.set(deckId, dueTimes);
	}

	createContinuityStateStore(): ContinuityStateStore {
		return {
			load: async (): Promise<CardIdentityContinuityState> => {
				await this.writeTail;
				return {
					configuredTags: [...this.settings.flashcardTags],
					...(this.hasAvailableTagsSnapshotValue
						? { availableTags: [...this.availableTags] }
						: {}),
					decks: new Map(this.decks),
					continuity: cloneContinuityState(this.continuity),
				};
			},
			commit: async (state: CardIdentityContinuityState): Promise<void> => {
				await this.enqueueWrite(async () => {
					const nextAvailableTags = [...(state.availableTags ?? this.availableTags)];
					const nextDecks = new Map(state.decks);
					const nextSpellingProgress = cloneSpellingProgress(this.spellingProgress);
					this.pruneSpellingProgress(this.decks, nextDecks, nextSpellingProgress);
					const nextContinuity = cloneContinuityState(state.continuity);
					await this.plugin.saveData(
						this.buildStoredData(
							nextDecks,
							this.studyHistory,
							nextSpellingProgress,
							this.settings,
							nextContinuity,
						),
					);
					this.decks = nextDecks;
					this.spellingProgress = nextSpellingProgress;
					this.availableTags = nextAvailableTags;
					this.hasAvailableTagsSnapshotValue = true;
					this.continuity = nextContinuity;
					this.refreshDerivedState();
					await this.writeDeckIndexCache(nextDecks, nextAvailableTags);
					this.publishRevision();
				});
			},
		};
	}

	/**
	 * Serialize a deck for storage
	 */
	private serializeDeck(deck: Deck): SerializedDeck {
		return {
			...deck,
			cards: deck.cards.map((card) => this.getSerializedCard(card)),
		};
	}

	/**
	 * Returns the serialized form of a card, reusing the cached copy when the
	 * card object reference has not changed since the last serialization.
	 */
	private getSerializedCard(card: FlashCard): SerializedCard {
		const cached = this.serializedCardCache.get(card);
		if (cached) return cached;
		const serialized = this.serializeCard(card);
		this.serializedCardCache.set(card, serialized);
		return serialized;
	}

	/**
	 * Serialize a card for storage
	 */
	private serializeCard(card: FlashCard): SerializedCard {
		return {
			...card,
			fsrsCard: this.serializeFSRSCard(card.fsrsCard),
		};
	}

	/**
	 * Serialize FSRS card
	 */
	private serializeFSRSCard(card: Card): SerializedFSRSCard {
		const { due, last_review, ...serializedCard } = card;

		return {
			...serializedCard,
			due: due instanceof Date ? due.toISOString() : due,
			last_review:
				last_review instanceof Date ? last_review.toISOString() : (last_review ?? null),
			learning_steps: serializedCard.learning_steps ?? 0,
		};
	}

	/**
	 * Deserialize a deck from storage
	 */
	private deserializeDeck(data: SerializedDeck): Deck {
		return {
			...data,
			cards: data.cards.map((card) => this.deserializeCard(card)),
		};
	}

	/**
	 * Deserialize a card from storage
	 */
	private deserializeCard(
		data: SerializedCard & {
			question?: string;
			answer?: string;
		},
	): FlashCard {
		return {
			...data,
			front: data.front ?? data.question ?? "",
			back: data.back ?? data.answer ?? "",
			explanation: data.explanation?.trim() || undefined,
			fsrsCard: this.deserializeFSRSCard(data.fsrsCard),
		};
	}

	/**
	 * Deserialize FSRS card
	 */
	private deserializeFSRSCard(data: SerializedFSRSCard): Card {
		return {
			due: new Date(data.due),
			stability: data.stability,
			difficulty: data.difficulty,
			elapsed_days: data.elapsed_days,
			scheduled_days: data.scheduled_days,
			reps: data.reps,
			lapses: data.lapses,
			state: data.state,
			last_review: data.last_review ? new Date(data.last_review) : undefined,
			learning_steps: data.learning_steps ?? 0,
		};
	}

	/**
	 * Get all decks
	 */
	getAllDecks(): Deck[] {
		return Array.from(this.decks.values());
	}

	/**
	 * Get all flashcard tags discovered during the last identity synchronization.
	 * Includes tags not yet added to settings (useful for the "add tag" UI).
	 */
	getAvailableTags(): string[] {
		return [...this.availableTags];
	}

	hasAvailableTagsSnapshot(): boolean {
		return this.hasAvailableTagsSnapshotValue;
	}

	/**
	 * Get a specific deck
	 */
	getDeck(id: string): Deck | undefined {
		return this.decks.get(id);
	}

	/**
	 * Get deck statistics
	 */
	getDeckStats(deck: Deck, now: Date = new Date()): DeckStats {
		let newCards = 0;
		let dueCards = 0;
		let learningCards = 0;
		let reviewCards = 0;
		let relearningCards = 0;

		for (const card of deck.cards) {
			switch (card.fsrsCard.state) {
				case State.New:
					newCards++;
					break;
				case State.Learning:
					learningCards++;
					if (card.fsrsCard.due <= now) dueCards++;
					break;
				case State.Review:
					reviewCards++;
					if (card.fsrsCard.due <= now) dueCards++;
					break;
				case State.Relearning:
					relearningCards++;
					if (card.fsrsCard.due <= now) dueCards++;
					break;
			}
		}

		return {
			totalCards: deck.cards.length,
			newCards,
			dueCards,
			learningCards,
			reviewCards,
			relearningCards,
		};
	}

	/**
	 * Get effective study settings for a deck (merges global defaults with per-deck overrides)
	 */
	getEffectiveStudySettings(deckId: string): StudySettings {
		const global: StudySettings = {
			dailyNewCards: this.settings.dailyNewCards,
			dailyReviewCards: this.settings.dailyReviewCards,
			studyOrder: this.settings.studyOrder,
			fsrsParameters: this.settings.fsrsParameters,
		};
		const overrides = this.settings.deckStudySettings?.[deckId] ?? {};
		return {
			...global,
			...overrides,
			fsrsParameters: {
				...global.fsrsParameters,
				...overrides.fsrsParameters,
			},
		};
	}

	rateStudyCard(card: Card, rating: StudyRating): StudyCardSchedule {
		if (rating === 5) {
			return {
				fsrsCard: this.scheduler.rateAsGarbage(card),
				repeatInSession: false,
			};
		}

		const result = this.scheduler.rateCard(card, toFSRSRating(rating));
		return {
			fsrsCard: result.card,
			repeatInSession: result.repeatInSession,
		};
	}

	/**
	 * Get a card by ID from a deck.
	 * Prefers the origin deck, then falls back to the card index for cross-deck
	 * lookups (used by sessions whose source deck changed while active).
	 */
	getCard(deckId: string, cardId: string): FlashCard | undefined {
		const deck = this.decks.get(deckId);
		const cardInOriginDeck = deck?.cards.find((card) => card.id === cardId);
		if (cardInOriginDeck) return cardInOriginDeck;
		const location = this.cardIndex.get(cardId);
		if (location && location.deckId !== deckId) {
			const candidateDeck = this.decks.get(location.deckId);
			const card = candidateDeck?.cards[location.cardIndex];
			if (card && card.id === cardId) return card;
		}
		for (const candidateDeck of this.decks.values()) {
			const card = candidateDeck.cards.find((candidate) => candidate.id === cardId);
			if (card) return card;
		}
		return undefined;
	}

	/** Record a word-list visit, which is outside SessionLifecycle. */
	async recordWordListVisit(
		deckId: string,
		deckName: string,
		startTimeMs: number,
		endTimeMs: number,
	): Promise<void> {
		const entry = createWordListHistoryEntry(deckId, deckName, startTimeMs, endTimeMs);
		if (!entry) return;

		await this.enqueueWrite(async () => {
			const nextHistory = appendStudyHistory(this.studyHistory, [entry]);
			await this.plugin.saveData(
				this.buildStoredData(this.decks, nextHistory, this.spellingProgress),
			);
			this.studyHistory = nextHistory;
			this.publishRevision();
		});
	}

	async recordWordListSession(deckId: string, deckName: string, duration: number): Promise<void> {
		const now = Date.now();
		return this.recordWordListVisit(deckId, deckName, now - duration * 1000, now);
	}

	/**
	 * Get all study history entries (copy)
	 */
	getStudyHistory(): StudyHistoryEntry[] {
		return [...this.studyHistory];
	}

	getSpellingProgress(): Record<string, SpellingCardProgress> {
		return Object.fromEntries(
			Object.entries(this.spellingProgress).map(([cardId, progress]) => [
				cardId,
				{ ...progress },
			]),
		);
	}

	/**
	 * Get scheduler instance
	 */
	getScheduler(): FSRSScheduler {
		return this.scheduler;
	}

	private pruneSpellingProgress(
		previousDecks: ReadonlyMap<string, Deck>,
		nextDecks: ReadonlyMap<string, Deck>,
		progress: Record<string, SpellingCardProgress>,
	): void {
		const availableIdentities = new Set(
			Array.from(nextDecks.values()).flatMap((deck) => deck.cards.map((card) => card.id)),
		);
		const previousIdentities = new Set(
			Array.from(previousDecks.values()).flatMap((deck) => deck.cards.map((card) => card.id)),
		);
		for (const cardId of previousIdentities) {
			if (!availableIdentities.has(cardId)) {
				delete progress[cardId];
			}
		}
	}

	private publishRevision(): void {
		this.revision++;
		for (const listener of this.revisionListeners) {
			try {
				listener();
			} catch (error) {
				console.error("Failed to publish a committed flashcard data revision:", error);
			}
		}
	}
}

function createEmptyContinuityState(): PersistedCardIdentityContinuityState {
	return {
		sources: {},
		issues: [],
		journal: null,
	};
}

function isPluginDataV2(value: StoredData | null): value is PluginDataV2 {
	return value?.schemaVersion === 2 && value.learning !== undefined && value.cache !== undefined;
}

function hasDeprecatedCardPlacement(learning: LearningStateDocument): boolean {
	return Object.values(learning.cards).some((card) => card.sourceFile !== undefined);
}

function cloneContinuityState(
	state: PersistedCardIdentityContinuityState,
): PersistedCardIdentityContinuityState {
	return JSON.parse(JSON.stringify(state)) as PersistedCardIdentityContinuityState;
}

function normalizeSpellingProgress(
	value: Record<string, SpellingCardProgress> | undefined,
): Record<string, SpellingCardProgress> {
	if (!value || typeof value !== "object") return {};
	const normalized: Record<string, SpellingCardProgress> = {};
	for (const [cardId, progress] of Object.entries(value)) {
		if (
			!progress ||
			typeof progress.attempts !== "number" ||
			typeof progress.correctAttempts !== "number" ||
			typeof progress.correctStreak !== "number" ||
			typeof progress.lastAttemptAt !== "number"
		) {
			continue;
		}
		normalized[cardId] = {
			attempts: Math.max(0, progress.attempts),
			correctAttempts: Math.max(0, progress.correctAttempts),
			correctStreak: Math.max(0, progress.correctStreak),
			lastAttemptAt: progress.lastAttemptAt,
			...(typeof progress.lastIncorrectAt === "number"
				? { lastIncorrectAt: progress.lastIncorrectAt }
				: {}),
		};
	}
	return normalized;
}

/**
 * Clones only the decks touched by a session transition; untouched decks keep
 * their object identity so cached serialized forms remain valid.
 */
function cloneDecksForTransition(
	decks: ReadonlyMap<string, Deck>,
	transition: SessionPersistenceTransition,
	cardIndex: ReadonlyMap<string, CardIndexLocation>,
): Map<string, Deck> {
	const touched = new Set<string>();
	for (const update of transition.cardUpdates) {
		const location = findCardLocation(decks, update.deckId, update.cardId, cardIndex);
		if (location) touched.add(location.deckId);
	}
	for (const deckId of transition.incrementStudyCountFor) touched.add(deckId);

	const next = new Map<string, Deck>();
	for (const [deckId, deck] of decks) {
		if (!touched.has(deckId)) {
			next.set(deckId, deck);
			continue;
		}
		next.set(deckId, {
			...deck,
			cards: [...deck.cards],
		});
	}
	return next;
}

function collectDeckDueTimes(deck: Deck): number[] {
	return deck.cards
		.filter((card) => card.fsrsCard.state !== State.New)
		.map((card) => card.fsrsCard.due.getTime())
		.sort((left, right) => left - right);
}

function findFirstDueAfter(sortedDueTimes: readonly number[], now: number): number | null {
	let low = 0;
	let high = sortedDueTimes.length;
	while (low < high) {
		const middle = low + Math.floor((high - low) / 2);
		if (sortedDueTimes[middle]! <= now) low = middle + 1;
		else high = middle;
	}
	return sortedDueTimes[low] ?? null;
}

function cloneSpellingProgress(
	progress: Readonly<Record<string, SpellingCardProgress>>,
): Record<string, SpellingCardProgress> {
	return Object.fromEntries(
		Object.entries(progress).map(([cardId, value]) => [cardId, { ...value }]),
	);
}

function findCardLocation(
	decks: ReadonlyMap<string, Deck>,
	deckId: string,
	cardId: string,
	cardIndex?: ReadonlyMap<string, CardIndexLocation>,
): { deckId: string; deck: Deck; cardIndex: number } | null {
	const originDeck = decks.get(deckId);
	const originIndex = originDeck?.cards.findIndex((card) => card.id === cardId) ?? -1;
	if (originDeck && originIndex !== -1) {
		return { deckId, deck: originDeck, cardIndex: originIndex };
	}
	if (cardIndex) {
		const location = cardIndex.get(cardId);
		if (location) {
			const candidateDeck = decks.get(location.deckId);
			const card = candidateDeck?.cards[location.cardIndex];
			if (card && card.id === cardId) {
				return {
					deckId: location.deckId,
					deck: candidateDeck!,
					cardIndex: location.cardIndex,
				};
			}
		}
	}
	for (const [candidateDeckId, deck] of decks) {
		const cardIndexInDeck = deck.cards.findIndex((card) => card.id === cardId);
		if (cardIndexInDeck !== -1) {
			return {
				deckId: candidateDeckId,
				deck,
				cardIndex: cardIndexInDeck,
			};
		}
	}
	return null;
}

function applySpellingAttempt(
	progress: Record<string, SpellingCardProgress>,
	cardId: string,
	correct: boolean,
	attemptedAt: number,
): void {
	const current = progress[cardId] ?? {
		attempts: 0,
		correctAttempts: 0,
		correctStreak: 0,
		lastAttemptAt: attemptedAt,
	};
	progress[cardId] = {
		...current,
		attempts: current.attempts + 1,
		correctAttempts: current.correctAttempts + (correct ? 1 : 0),
		correctStreak: correct ? current.correctStreak + 1 : 0,
		lastAttemptAt: attemptedAt,
		...(correct ? {} : { lastIncorrectAt: attemptedAt }),
	};
}
