import { Plugin } from "obsidian";
import { Card, State } from "ts-fsrs";
import {
	Deck,
	FlashCard,
	DeckStats,
	StudySession,
	StudyDayInfo,
	FlashcardSettings,
	StudySettings,
	StudyHistoryEntry,
	DEFAULT_SETTINGS,
	CardDirection,
	StudyRating,
} from "../shared/types";
import { FSRSScheduler, toFSRSRating } from "../sessions/scheduler";
import { DEFAULT_PRACTICE_MESSAGES, getDefaultPracticeMessages, normalizeLanguage } from "../i18n";
import {
	createStudySession as createStudySessionState,
	type StudyCardSchedule,
} from "../sessions/sessionEngine";
import type {
	CardIdentityContinuityState,
	ContinuityStateStore,
	PersistedCardIdentityContinuityState,
} from "../identity/cardIdentityContinuity";

/**
 * Stored data structure - unified storage for both settings and decks
 */
export interface StoredData {
	decks: Record<string, SerializedDeck>;
	lastSync: string;
	settings?: FlashcardSettings;
	studyHistory?: StudyHistoryEntry[];
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

/**
 * DataStore - handles persistence and management of flashcard data
 */
export class DataStore {
	private plugin: Plugin;
	private decks: Map<string, Deck> = new Map();
	private scheduler: FSRSScheduler;
	private settings: FlashcardSettings;
	private studyHistory: StudyHistoryEntry[] = [];
	private availableTags: string[] = [];
	private continuity: PersistedCardIdentityContinuityState = createEmptyContinuityState();
	/** Set to true after loadSettings() has already populated decks/history */
	private dataLoaded = false;

	constructor(plugin: Plugin, settings?: FlashcardSettings) {
		this.plugin = plugin;
		this.settings = settings ?? DEFAULT_SETTINGS;
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
		this.continuity = cloneContinuityState(data?.continuity ?? createEmptyContinuityState());

		this.scheduler = new FSRSScheduler(this.settings);
		this.dataLoaded = true;
		return this.settings;
	}

	/**
	 * Save settings to disk
	 */
	async saveSettings(newSettings?: FlashcardSettings): Promise<void> {
		if (newSettings) {
			this.settings = newSettings;
			this.scheduler = new FSRSScheduler(this.settings);
		}
		await this.save();
	}

	/**
	 * Get current settings
	 */
	getSettings(): FlashcardSettings {
		return this.settings;
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
			fsrsParameters: {
				...DEFAULT_SETTINGS.fsrsParameters,
				...settings.fsrsParameters,
			},
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
		this.continuity = cloneContinuityState(data?.continuity ?? createEmptyContinuityState());
		this.dataLoaded = true;
	}

	/**
	 * Save data to disk (includes both decks and settings)
	 */
	async save(): Promise<void> {
		const data: StoredData = {
			decks: {},
			lastSync: new Date().toISOString(),
			settings: this.settings,
			studyHistory: this.studyHistory,
			continuity: this.continuity,
		};

		for (const [id, deck] of this.decks) {
			data.decks[id] = this.serializeDeck(deck);
		}

		await this.plugin.saveData(data);
	}

	createContinuityStateStore(): ContinuityStateStore {
		return {
			load: async (): Promise<CardIdentityContinuityState> => ({
				configuredTags: [...this.settings.flashcardTags],
				availableTags: [...this.availableTags],
				decks: new Map(this.decks),
				continuity: cloneContinuityState(this.continuity),
			}),
			commit: async (state: CardIdentityContinuityState): Promise<void> => {
				this.decks = new Map(state.decks);
				this.availableTags = [...(state.availableTags ?? this.availableTags)];
				this.continuity = cloneContinuityState(state.continuity);
				await this.save();
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

	/**
	 * Get a specific deck
	 */
	getDeck(id: string): Deck | undefined {
		return this.decks.get(id);
	}

	/**
	 * Get deck statistics
	 */
	getDeckStats(deck: Deck): DeckStats {
		const now = new Date();
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

	/**
	 * Get the list of learning days for a deck with completion status
	 */
	getDayList(deckId: string): StudyDayInfo[] {
		const deck = this.decks.get(deckId);
		if (!deck) return [];

		const { dailyNewCards } = this.getEffectiveStudySettings(deckId);
		const sortedCards = [...deck.cards].sort((a, b) => a.indexInFile - b.indexInFile);
		const totalCards = sortedCards.length;
		if (totalCards === 0) return [];

		const numDays = Math.ceil(totalCards / dailyNewCards);
		const days: StudyDayInfo[] = [];
		let foundCurrent = false;

		for (let i = 0; i < numDays; i++) {
			const start = i * dailyNewCards;
			const end = Math.min(start + dailyNewCards, totalCards);
			const dayCards = sortedCards.slice(start, end);
			const studiedCards = dayCards.filter((c) => c.fsrsCard.state !== State.New).length;
			const isCompleted = studiedCards === dayCards.length;
			const isCurrent = !isCompleted && !foundCurrent;
			if (isCurrent) foundCurrent = true;

			days.push({
				dayIndex: i,
				startCardIndex: start,
				endCardIndex: end,
				totalCards: dayCards.length,
				studiedCards,
				isCompleted,
				isCurrent,
				isLocked: !isCompleted && !isCurrent,
			});
		}

		return days;
	}

	/**
	 * Get the count of new and due cards for today's session
	 */
	getTodayStudyCounts(deckId: string): {
		newCount: number;
		reviewCount: number;
	} {
		const deck = this.decks.get(deckId);
		if (!deck) return { newCount: 0, reviewCount: 0 };

		const { dailyNewCards, dailyReviewCards } = this.getEffectiveStudySettings(deckId);
		const now = new Date();
		let newCards = 0;
		let dueCards = 0;

		for (const card of deck.cards) {
			if (card.fsrsCard.state === State.New) {
				newCards++;
			} else if (card.fsrsCard.due <= now) {
				dueCards++;
			}
		}

		return {
			newCount: Math.min(dailyNewCards, newCards),
			reviewCount: Math.min(dailyReviewCards, dueCards),
		};
	}

	/**
	 * Get all cards for a specific day index (for review practice)
	 */
	getCardsForDay(deckId: string, dayIndex: number): FlashCard[] {
		const deck = this.decks.get(deckId);
		if (!deck) return [];

		const { dailyNewCards } = this.getEffectiveStudySettings(deckId);
		const sortedCards = [...deck.cards].sort((a, b) => a.indexInFile - b.indexInFile);
		const start = dayIndex * dailyNewCards;
		const end = Math.min(start + dailyNewCards, sortedCards.length);
		return sortedCards.slice(start, end);
	}

	/**
	 * Create a study session for a deck
	 */
	createStudySession(
		deckId: string,
		studyOrderOverride?: "sequential" | "random",
		direction: CardDirection = "normal",
	): StudySession | null {
		const deck = this.decks.get(deckId);
		if (!deck) return null;

		return createStudySessionState({
			deckId,
			cards: deck.cards,
			settings: this.getEffectiveStudySettings(deckId),
			studyOrderOverride,
			direction,
		});
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
	 * Get a card by ID from a deck
	 */
	getCard(deckId: string, cardId: string): FlashCard | undefined {
		const deck = this.decks.get(deckId);
		const cardInOriginDeck = deck?.cards.find((card) => card.id === cardId);
		if (cardInOriginDeck) return cardInOriginDeck;
		for (const candidateDeck of this.decks.values()) {
			const card = candidateDeck.cards.find((candidate) => candidate.id === cardId);
			if (card) return card;
		}
		return undefined;
	}

	/**
	 * Update a card after rating
	 */
	async updateCard(deckId: string, cardId: string, updatedCard: Card): Promise<void> {
		let deck = this.decks.get(deckId);
		let cardIndex = deck?.cards.findIndex((card) => card.id === cardId) ?? -1;
		if (!deck || cardIndex === -1) {
			for (const candidateDeck of this.decks.values()) {
				const candidateIndex = candidateDeck.cards.findIndex((card) => card.id === cardId);
				if (candidateIndex === -1) continue;
				deck = candidateDeck;
				cardIndex = candidateIndex;
				break;
			}
		}
		if (!deck || cardIndex === -1) return;

		deck.cards[cardIndex] = {
			...deck.cards[cardIndex]!,
			fsrsCard: updatedCard,
		};

		await this.save();
	}

	/**
	 * Increment study count for a deck
	 */
	async incrementStudyCount(deckId: string): Promise<void> {
		const deck = this.decks.get(deckId);
		if (!deck) return;

		deck.studyCount++;
		deck.lastStudied = new Date().toISOString();
		await this.save();
	}

	/**
	 * Record a completed study session and persist it.
	 * Keeps only the most recent 20 distinct days of history.
	 */
	async recordStudySession(
		deckId: string,
		deckName: string,
		mode: StudyHistoryEntry["mode"],
		cardCount: number,
		duration: number,
	): Promise<void> {
		const now = new Date();
		// Local YYYY-MM-DD
		const date = [
			now.getFullYear(),
			String(now.getMonth() + 1).padStart(2, "0"),
			String(now.getDate()).padStart(2, "0"),
		].join("-");

		this.studyHistory.push({
			date,
			deckId,
			deckName,
			mode,
			cardCount,
			duration,
			timestamp: Date.now(),
		});

		// Prune to last 20 distinct days
		const days = [...new Set(this.studyHistory.map((e) => e.date))].sort().reverse();
		if (days.length > 20) {
			const keep = new Set(days.slice(0, 20));
			this.studyHistory = this.studyHistory.filter((e) => keep.has(e.date));
		}

		await this.save();
	}

	/**
	 * Get all study history entries (copy)
	 */
	getStudyHistory(): StudyHistoryEntry[] {
		return [...this.studyHistory];
	}

	/**
	 * Update settings reference (does not save to disk)
	 */
	updateSettings(settings: FlashcardSettings): void {
		this.settings = settings;
		this.scheduler = new FSRSScheduler(settings);
	}

	/**
	 * Get scheduler instance
	 */
	getScheduler(): FSRSScheduler {
		return this.scheduler;
	}
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
