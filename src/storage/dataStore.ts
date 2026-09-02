import { Plugin } from "obsidian";
import { Card, State } from "ts-fsrs";
import {
	Deck,
	FlashCard,
	DeckStats,
	FlashcardSettings,
	StudySettings,
	StudyHistoryEntry,
	SpellingCardProgress,
	DEFAULT_SETTINGS,
	StudyRating,
} from "../shared/types";
import { FSRSScheduler, toFSRSRating } from "../sessions/scheduler";
import { DEFAULT_PRACTICE_MESSAGES, getDefaultPracticeMessages, normalizeLanguage } from "../i18n";
import type { StudyCardSchedule } from "../sessions/sessionEngine";
import type {
	CardIdentityContinuityState,
	ContinuityStateStore,
	PersistedCardIdentityContinuityState,
} from "../identity/cardIdentityContinuity";
import type { SessionPersistenceTransition } from "../sessions/sessionLifecycle";
import { normalizePronunciationSettings } from "../pronunciation/pronunciationSettings";
import { formatLocalDateKey, pruneStudyHistory } from "../history/studyHistory";

/**
 * Stored data structure - unified storage for both settings and decks
 */
export interface StoredData {
	decks: Record<string, SerializedDeck>;
	lastSync: string;
	availableTags?: string[];
	settings?: FlashcardSettings;
	studyHistory?: StudyHistoryEntry[];
	spellingProgress?: Record<string, SpellingCardProgress>;
	continuity?: PersistedCardIdentityContinuityState;
}

/**
 * Serialized deck for storage (with JSON-compatible dates)
 */
interface SerializedDeck {
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
interface SerializedCard {
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
interface SerializedFSRSCard {
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
	/** Sorted non-new due times per deck, used by DeckHome's next-wake timer. */
	private deckDueTimes = new Map<string, number[]>();
	private deckDueTimesValid = false;

	constructor(plugin: Plugin, settings?: FlashcardSettings) {
		this.plugin = plugin;
		this.settings = cloneFlashcardSettings(settings ?? DEFAULT_SETTINGS);
		this.scheduler = new FSRSScheduler(this.settings);
	}

	/**
	 * Load settings AND all deck data from disk in a single read.
	 * After this call, load() becomes a no-op.
	 */
	async loadSettings(): Promise<FlashcardSettings> {
		const data = (await this.plugin.loadData()) as
			| (StoredData & { flashcardTag?: string })
			| null;

		// ── Settings with legacy migration ──────────────────────────────────
		if (data?.settings) {
			const s = data.settings as FlashcardSettings & {
				flashcardTag?: string;
			};
			if (s.flashcardTag && !s.flashcardTags?.length) {
				s.flashcardTags = [s.flashcardTag];
				delete s.flashcardTag;
			}
			this.settings = this.normalizeSettings(s);
		} else if (data && ("flashcardTags" in data || "flashcardTag" in data)) {
			const legacy = data as unknown as Partial<FlashcardSettings> & {
				flashcardTag?: string;
			};
			if (legacy.flashcardTag && !legacy.flashcardTags?.length) {
				legacy.flashcardTags = [legacy.flashcardTag];
				delete legacy.flashcardTag;
			}
			this.settings = this.normalizeSettings(legacy);
		} else {
			this.settings = this.normalizeSettings({});
		}

		// ── Decks ────────────────────────────────────────────────────────────
		if (data?.decks) {
			for (const [id, serializedDeck] of Object.entries(data.decks)) {
				this.decks.set(id, this.deserializeDeck(serializedDeck));
			}
		}

		// ── Study history ─────────────────────────────────────────────────────
		if (data?.studyHistory) {
			this.studyHistory = data.studyHistory;
		}
		this.spellingProgress = normalizeSpellingProgress(data?.spellingProgress);
		this.continuity = cloneContinuityState(data?.continuity ?? createEmptyContinuityState());
		this.restoreAvailableTags(data?.availableTags);
		this.refreshDerivedState();

		this.scheduler = new FSRSScheduler(this.settings);
		this.dataLoaded = true;
		this.publishRevision();
		return cloneFlashcardSettings(this.settings);
	}

	/**
	 * Save settings to disk
	 */
	async saveSettings(newSettings?: FlashcardSettings): Promise<void> {
		const nextSettings = cloneFlashcardSettings(newSettings ?? this.settings);
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
	}

	/**
	 * Get current settings
	 */
	getSettings(): FlashcardSettings {
		return cloneFlashcardSettings(this.settings);
	}

	getRevision(): number {
		return this.revision;
	}

	subscribe(listener: () => void): () => void {
		this.revisionListeners.add(listener);
		return () => this.revisionListeners.delete(listener);
	}

	/**
	 * Merge persisted settings with defaults while preserving old-data compatibility.
	 */
	private normalizeSettings(
		settings: Partial<FlashcardSettings> & { flashcardTag?: string },
	): FlashcardSettings {
		const language = normalizeLanguage(settings.language);
		const defaultMessages = getDefaultPracticeMessages(language);
		const messagesCustomized =
			settings.practiceMessagesCustomized ?? this.hasCustomPracticeMessages(settings);

		return {
			...DEFAULT_SETTINGS,
			...settings,
			language,
			deckStudySettings: settings.deckStudySettings ?? {},
			wordLearningDecks: settings.wordLearningDecks ?? {},
			deckOrder: normalizeDeckOrder(settings.deckOrder),
			fsrsParameters: {
				...DEFAULT_SETTINGS.fsrsParameters,
				...settings.fsrsParameters,
			},
			pronunciation: normalizePronunciationSettings(settings.pronunciation),
			practiceMessagesCustomized: messagesCustomized,
			practicePerfectMessages: messagesCustomized
				? [...(settings.practicePerfectMessages ?? defaultMessages.perfect)]
				: defaultMessages.perfect,
			practiceErrorMessages: messagesCustomized
				? [...(settings.practiceErrorMessages ?? defaultMessages.error)]
				: defaultMessages.error,
		};
	}

	private hasCustomPracticeMessages(settings: Partial<FlashcardSettings>): boolean {
		if (
			settings.practicePerfectMessages === undefined &&
			settings.practiceErrorMessages === undefined
		) {
			return false;
		}

		const defaultZh = DEFAULT_PRACTICE_MESSAGES.zh;
		return (
			!this.areStringArraysEqual(
				settings.practicePerfectMessages ?? defaultZh.perfect,
				defaultZh.perfect,
			) ||
			!this.areStringArraysEqual(
				settings.practiceErrorMessages ?? defaultZh.error,
				defaultZh.error,
			)
		);
	}

	private areStringArraysEqual(left: string[], right: string[]): boolean {
		return left.length === right.length && left.every((value, index) => value === right[index]);
	}

	/**
	 * Load deck data from disk.
	 * No-op if loadSettings() was already called (it loads everything in one read).
	 */
	async load(): Promise<void> {
		if (this.dataLoaded) return;
		const data = (await this.plugin.loadData()) as StoredData | null;
		if (data?.decks) {
			for (const [id, serializedDeck] of Object.entries(data.decks)) {
				this.decks.set(id, this.deserializeDeck(serializedDeck));
			}
		}
		if (data?.studyHistory) {
			this.studyHistory = data.studyHistory;
		}
		this.spellingProgress = normalizeSpellingProgress(data?.spellingProgress);
		this.continuity = cloneContinuityState(data?.continuity ?? createEmptyContinuityState());
		this.restoreAvailableTags(data?.availableTags);
		this.refreshDerivedState();
		this.dataLoaded = true;
		this.publishRevision();
	}

	/**
	 * Save data to disk (includes both decks and settings)
	 */
	async save(): Promise<void> {
		await this.plugin.saveData(
			this.buildStoredData(this.decks, this.studyHistory, this.spellingProgress),
		);
	}

	/**
	 * Atomically applies every persisted effect produced by one session lifecycle transition.
	 * The visible in-memory state changes only after the complete next state is durable.
	 *
	 * Only the decks touched by the transition are cloned; untouched decks keep
	 * their object identity so their cached serialized form stays reusable.
	 */
	async commitSessionTransition(transition: SessionPersistenceTransition): Promise<void> {
		const nextDecks = cloneDecksForTransition(this.decks, transition, this.cardIndex);
		const nextHistory = [...this.studyHistory];
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

		for (const entry of transition.historyEntries) {
			nextHistory.push({
				...entry,
				date: formatLocalDateKey(now),
				timestamp: now.getTime(),
			});
		}
		const prunedHistory = pruneStudyHistory(nextHistory);

		await this.plugin.saveData(
			this.buildStoredData(nextDecks, prunedHistory, nextSpellingProgress),
		);
		this.decks = nextDecks;
		this.studyHistory = prunedHistory;
		this.spellingProgress = nextSpellingProgress;
		// Card positions are unchanged by a session transition, so the card index
		// stays valid; only the touched decks need their derived caches refreshed.
		for (const deckId of updatedDeckIds) {
			this.refreshDeckDueTimes(deckId, nextDecks);
		}
		this.publishRevision();
	}

	private buildStoredData(
		decks: ReadonlyMap<string, Deck>,
		studyHistory: StudyHistoryEntry[],
		spellingProgress: Record<string, SpellingCardProgress>,
		settings: FlashcardSettings = this.settings,
		continuity: PersistedCardIdentityContinuityState = this.continuity,
		availableTags: string[] | undefined = this.hasAvailableTagsSnapshotValue
			? this.availableTags
			: undefined,
	): StoredData {
		const data: StoredData = {
			decks: {},
			lastSync: new Date().toISOString(),
			settings,
			studyHistory,
			spellingProgress,
			continuity,
		};
		if (availableTags) {
			data.availableTags = [...availableTags];
		}

		for (const [id, deck] of decks) {
			data.decks[id] = this.getSerializedDeck(deck);
		}
		return data;
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
			load: async (): Promise<CardIdentityContinuityState> => ({
				configuredTags: [...this.settings.flashcardTags],
				...(this.hasAvailableTagsSnapshotValue
					? { availableTags: [...this.availableTags] }
					: {}),
				decks: new Map(this.decks),
				continuity: cloneContinuityState(this.continuity),
			}),
			commit: async (state: CardIdentityContinuityState): Promise<void> => {
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
						nextAvailableTags,
					),
				);
				this.decks = nextDecks;
				this.spellingProgress = nextSpellingProgress;
				this.availableTags = nextAvailableTags;
				this.hasAvailableTagsSnapshotValue = true;
				this.continuity = nextContinuity;
				this.refreshDerivedState();
				this.publishRevision();
			},
		};
	}

	/**
	 * Serialize a deck for storage
	 */
	private serializeDeck(deck: Deck): SerializedDeck {
		return {
			...deck,
			cards: deck.cards.map((card) => this.serializeCard(card)),
		};
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
	async recordWordListSession(deckId: string, deckName: string, duration: number): Promise<void> {
		const now = new Date();
		const date = formatLocalDateKey(now);

		const nextHistory = [...this.studyHistory];
		nextHistory.push({
			date,
			deckId,
			deckName,
			mode: "word-list",
			cardCount: 0,
			duration,
			timestamp: now.getTime(),
		});

		const prunedHistory = pruneStudyHistory(nextHistory);

		await this.plugin.saveData(
			this.buildStoredData(this.decks, prunedHistory, this.spellingProgress),
		);
		this.studyHistory = prunedHistory;
		this.publishRevision();
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

function cloneFlashcardSettings(settings: FlashcardSettings): FlashcardSettings {
	return {
		...settings,
		flashcardTags: [...settings.flashcardTags],
		wordLearningDecks: { ...settings.wordLearningDecks },
		deckOrder: [...settings.deckOrder],
		practicePerfectMessages: [...settings.practicePerfectMessages],
		practiceErrorMessages: [...settings.practiceErrorMessages],
		fsrsParameters: { ...settings.fsrsParameters },
		deckStudySettings: Object.fromEntries(
			Object.entries(settings.deckStudySettings).map(([deckId, overrides]) => [
				deckId,
				{
					...overrides,
					fsrsParameters: overrides.fsrsParameters && {
						...overrides.fsrsParameters,
					},
				},
			]),
		),
		pronunciation: { ...settings.pronunciation },
	};
}

function normalizeDeckOrder(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((deckId): deckId is string => typeof deckId === "string"))];
}

function createEmptyContinuityState(): PersistedCardIdentityContinuityState {
	return {
		sources: {},
		issues: [],
		journal: null,
	};
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
			cards: deck.cards.map((card) => ({ ...card })),
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
