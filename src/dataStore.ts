import { Plugin } from "obsidian";
import { Card, State } from "ts-fsrs";
import {
	Deck,
	FlashCard,
	DeckStats,
	StudySession,
	FlashcardSettings,
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
	}

	/**
	 * Save data to disk (includes both decks and settings)
	 */
	async save(): Promise<void> {
		const data: StoredData = {
			decks: {},
			lastSync: new Date().toISOString(),
			settings: this.settings,
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
		return {
			due: card.due instanceof Date ? card.due.toISOString() : card.due,
			stability: card.stability,
			difficulty: card.difficulty,
			// eslint-disable-next-line @typescript-eslint/no-deprecated
			elapsed_days: card.elapsed_days,
			scheduled_days: card.scheduled_days,
			reps: card.reps,
			lapses: card.lapses,
			state: card.state,
			last_review:
				card.last_review instanceof Date
					? card.last_review.toISOString()
					: (card.last_review ?? null),
			learning_steps: card.learning_steps ?? 0,
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
	 * Create a study session for a deck
	 */
	createStudySession(deckId: string): StudySession | null {
		const deck = this.decks.get(deckId);
		if (!deck) return null;

		const now = new Date();
		const { dailyNewCards, dailyReviewCards, studyOrder } = this.settings;

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
