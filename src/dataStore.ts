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
} from "./types";
import { FSRSScheduler } from "./scheduler";
import { scanFilesWithTag } from "./parser";

/**
 * Stored data structure - unified storage for both settings and decks
 */
export interface StoredData {
	decks: Record<string, SerializedDeck>;
	lastSync: string;
	settings?: FlashcardSettings;
	studyHistory?: StudyHistoryEntry[];
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
	question: string;
	answer: string;
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

	constructor(plugin: Plugin, settings?: FlashcardSettings) {
		this.plugin = plugin;
		this.settings = settings ?? DEFAULT_SETTINGS;
		this.scheduler = new FSRSScheduler(this.settings);
	}

	/**
	 * Load settings from disk (call this first before load())
	 */
	async loadSettings(): Promise<FlashcardSettings> {
		const data = (await this.plugin.loadData()) as
			| (StoredData & { flashcardTag?: string })
			| null;

		// Handle legacy format and migration
		if (data?.settings) {
			// Migrate from old single tag format if needed
			if (
				"flashcardTag" in data.settings &&
				typeof (
					data.settings as FlashcardSettings & {
						flashcardTag?: string;
					}
				).flashcardTag === "string" &&
				!data.settings.flashcardTags
			) {
				data.settings.flashcardTags = [
					(
						data.settings as FlashcardSettings & {
							flashcardTag?: string;
						}
					).flashcardTag!,
				];
				delete (
					data.settings as FlashcardSettings & {
						flashcardTag?: string;
					}
				).flashcardTag;
			}
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
		} else if (data && "flashcardTags" in data) {
			// Legacy format: settings were stored at root level
			const legacySettings =
				data as unknown as Partial<FlashcardSettings> & {
					flashcardTag?: string;
				};
			if (legacySettings.flashcardTag && !legacySettings.flashcardTags) {
				legacySettings.flashcardTags = [legacySettings.flashcardTag];
				delete legacySettings.flashcardTag;
			}
			this.settings = Object.assign({}, DEFAULT_SETTINGS, legacySettings);
		} else {
			this.settings = DEFAULT_SETTINGS;
		}

		this.scheduler = new FSRSScheduler(this.settings);
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
	 * Load data from disk
	 */
	async load(): Promise<void> {
		const data = (await this.plugin.loadData()) as StoredData | null;
		if (data?.decks) {
			for (const [id, serializedDeck] of Object.entries(data.decks)) {
				this.decks.set(id, this.deserializeDeck(serializedDeck));
			}
		}
		if (data?.studyHistory) {
			this.studyHistory = data.studyHistory;
		}
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
		};

		for (const [id, deck] of this.decks) {
			data.decks[id] = this.serializeDeck(deck);
		}

		await this.plugin.saveData(data);
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
				last_review instanceof Date
					? last_review.toISOString()
					: (last_review ?? null),
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
	private deserializeCard(data: SerializedCard): FlashCard {
		return {
			...data,
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
			last_review: data.last_review
				? new Date(data.last_review)
				: undefined,
			learning_steps: data.learning_steps ?? 0,
		};
	}

	/**
	 * Sync decks from vault files
	 */
	async syncFromVault(): Promise<void> {
		const vault = this.plugin.app.vault;
		const newDecksMap = new Map<string, Deck>();

		// Scan for all configured tags
		for (const tag of this.settings.flashcardTags) {
			const scannedDecks = await scanFilesWithTag(vault, tag, this.decks);

			for (const deck of scannedDecks) {
				newDecksMap.set(deck.id, deck);
			}
		}

		this.decks = newDecksMap;
		await this.save();
	}

	/**
	 * Get all decks
	 */
	getAllDecks(): Deck[] {
		return Array.from(this.decks.values());
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
				...(overrides.fsrsParameters ?? {}),
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
		const sortedCards = [...deck.cards].sort(
			(a, b) => a.indexInFile - b.indexInFile,
		);
		const totalCards = sortedCards.length;
		if (totalCards === 0) return [];

		const numDays = Math.ceil(totalCards / dailyNewCards);
		const days: StudyDayInfo[] = [];
		let foundCurrent = false;

		for (let i = 0; i < numDays; i++) {
			const start = i * dailyNewCards;
			const end = Math.min(start + dailyNewCards, totalCards);
			const dayCards = sortedCards.slice(start, end);
			const studiedCards = dayCards.filter(
				(c) => c.fsrsCard.state !== State.New,
			).length;
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

		const { dailyNewCards, dailyReviewCards } =
			this.getEffectiveStudySettings(deckId);
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
		const sortedCards = [...deck.cards].sort(
			(a, b) => a.indexInFile - b.indexInFile,
		);
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
	): StudySession | null {
		const deck = this.decks.get(deckId);
		if (!deck) return null;

		const now = new Date();
		const {
			dailyNewCards,
			dailyReviewCards,
			studyOrder: defaultOrder,
		} = this.getEffectiveStudySettings(deckId);
		const studyOrder = studyOrderOverride ?? defaultOrder;

		// Separate new cards and due cards
		const newCards: FlashCard[] = [];
		const dueCards: FlashCard[] = [];

		for (const card of deck.cards) {
			if (card.fsrsCard.state === State.New) {
				newCards.push(card);
			} else if (card.fsrsCard.due <= now) {
				dueCards.push(card);
			}
		}

		// Limit by daily settings
		const selectedNew = newCards.slice(0, dailyNewCards);
		const selectedDue = dueCards.slice(0, dailyReviewCards);

		// Combine cards
		let cardQueue = [...selectedNew, ...selectedDue].map((c) => c.id);

		// Shuffle if random order
		if (studyOrder === "random") {
			cardQueue = this.shuffleArray(cardQueue);
		}

		return {
			deckId,
			cardQueue,
			currentIndex: 0,
			startTime: Date.now(),
			repeatQueue: [],
			history: [],
		};
	}

	/**
	 * Shuffle array using Fisher-Yates algorithm
	 */
	private shuffleArray<T>(array: T[]): T[] {
		const shuffled = [...array];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
		}
		return shuffled;
	}

	/**
	 * Get a card by ID from a deck
	 */
	getCard(deckId: string, cardId: string): FlashCard | undefined {
		const deck = this.decks.get(deckId);
		return deck?.cards.find((c) => c.id === cardId);
	}

	/**
	 * Update a card after rating
	 */
	async updateCard(
		deckId: string,
		cardId: string,
		updatedCard: Card,
	): Promise<void> {
		const deck = this.decks.get(deckId);
		if (!deck) return;

		const cardIndex = deck.cards.findIndex((c) => c.id === cardId);
		if (cardIndex === -1) return;

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
		const days = [...new Set(this.studyHistory.map((e) => e.date))]
			.sort()
			.reverse();
		if (days.length > 20) {
			const keep = new Set(days.slice(0, 20));
			this.studyHistory = this.studyHistory.filter((e) =>
				keep.has(e.date),
			);
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
