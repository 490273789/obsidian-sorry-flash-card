import { Plugin, TFile } from "obsidian";
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
} from "./types";
import { FSRSScheduler } from "./scheduler";
import { extractFirstTag, parseFileIntoDeck } from "./parser";
import { shuffleArray } from "./utils";
import {
	CARD_END_SEPARATOR,
	FIRST_TAG_LINE_PATTERN,
	FRONT_BACK_SEPARATOR,
	formatCardBlock,
	hasFlashcardSyntax,
	isMarkerLine,
} from "./cardFormat";
import {
	DEFAULT_PRACTICE_MESSAGES,
	getDefaultPracticeMessages,
	normalizeLanguage,
} from "./i18n";

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
		} else if (
			data &&
			("flashcardTags" in data || "flashcardTag" in data)
		) {
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
			settings.practiceMessagesCustomized ??
			this.hasCustomPracticeMessages(settings);

		return {
			...DEFAULT_SETTINGS,
			...settings,
			language,
			deckStudySettings: settings.deckStudySettings ?? {},
			fsrsParameters: {
				...DEFAULT_SETTINGS.fsrsParameters,
				...(settings.fsrsParameters ?? {}),
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

	private hasCustomPracticeMessages(
		settings: Partial<FlashcardSettings>,
	): boolean {
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
		return (
			left.length === right.length &&
			left.every((value, index) => value === right[index])
		);
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
			last_review: data.last_review
				? new Date(data.last_review)
				: undefined,
			learning_steps: data.learning_steps ?? 0,
		};
	}

	/**
	 * Sync decks from vault files in a single pass.
	 * Also caches all discovered flashcard tags (retrievable via getAvailableTags()).
	 */
	async syncFromVault(): Promise<void> {
		const vault = this.plugin.app.vault;
		const newDecksMap = new Map<string, Deck>();
		const allFoundTags = new Set<string>();
		const configuredTagsLower = new Set(
			this.settings.flashcardTags.map((t) => t.toLowerCase()),
		);

		for (const file of vault.getMarkdownFiles()) {
			try {
				// Read each file only once
				const content = await vault.cachedRead(file);
				const tag = extractFirstTag(content);
				if (!tag) continue;

				// Track every tag that has flashcard content
				if (hasFlashcardSyntax(content)) {
					allFoundTags.add(tag);
				}

				// Build a deck only for configured tags
				if (configuredTagsLower.has(tag.toLowerCase())) {
					const existingDeck = this.decks.get(file.path);
					// Pass pre-read content to avoid reading the file again
					const deck = await parseFileIntoDeck(
						file,
						vault,
						existingDeck,
						content,
					);
					if (deck) newDecksMap.set(deck.id, deck);
				}
			} catch (error) {
				console.error(`Error parsing file ${file.path}:`, error);
			}
		}

		this.decks = newDecksMap;
		this.availableTags = Array.from(allFoundTags);
		await this.save();
	}

	/**
	 * Get all decks
	 */
	getAllDecks(): Deck[] {
		return Array.from(this.decks.values());
	}

	/**
	 * Get all flashcard tags discovered during the last syncFromVault() call.
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
		direction: CardDirection = "normal",
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
			cardQueue = shuffleArray(cardQueue);
		}

		return {
			deckId,
			direction,
			cardQueue,
			currentIndex: 0,
			startTime: Date.now(),
			repeatQueue: [],
			history: [],
		};
	}

	/**
	 * Get a card by ID from a deck
	 */
	getCard(deckId: string, cardId: string): FlashCard | undefined {
		const deck = this.decks.get(deckId);
		return deck?.cards.find((c) => c.id === cardId);
	}

	/**
	 * Update a card's front/back/explanation in the source Markdown file.
	 */
	async updateCardContent(
		deckId: string,
		cardId: string,
		front: string,
		back: string,
		explanation?: string,
	): Promise<Deck> {
		const deck = this.decks.get(deckId);
		if (!deck) throw new Error("Deck not found");

		const card = deck.cards.find((c) => c.id === cardId);
		if (!card) throw new Error("Card not found");

		const file = this.getDeckSourceFile(deck);
		const content = await this.plugin.app.vault.cachedRead(file);
		const nextContent = this.replaceCardBlock(
			content,
			card.indexInFile,
			front,
			back,
			explanation,
		);
		if (nextContent === null) {
			throw new Error("Card block not found in source file");
		}

		await this.plugin.app.vault.modify(file, nextContent);
		return this.refreshDeckFromSource(file, deck, nextContent);
	}

	/**
	 * Append a new card to an existing deck's source Markdown file.
	 */
	async addCardToDeck(
		deckId: string,
		front: string,
		back: string,
		explanation?: string,
	): Promise<Deck> {
		const deck = this.decks.get(deckId);
		if (!deck) throw new Error("Deck not found");

		const file = this.getDeckSourceFile(deck);
		const content = await this.plugin.app.vault.cachedRead(file);
		const nextContent = this.appendCardBlock(
			content,
			front,
			back,
			explanation,
		);

		await this.plugin.app.vault.modify(file, nextContent);
		return this.refreshDeckFromSource(file, deck, nextContent);
	}

	private getDeckSourceFile(deck: Deck): TFile {
		const file = this.plugin.app.vault.getAbstractFileByPath(
			deck.filePath,
		);
		if (!(file instanceof TFile)) {
			throw new Error("Source file not found");
		}
		return file;
	}

	private replaceCardBlock(
		content: string,
		indexInFile: number,
		front: string,
		back: string,
		explanation?: string,
	): string | null {
		const lines = content.split(/\r?\n/);
		const ranges = this.findCardBlockRanges(lines);
		const currentRange = ranges[indexInFile];
		if (
			indexInFile < 0 ||
			currentRange === undefined
		) {
			return null;
		}

		const currentBlock = lines
			.slice(currentRange.start, currentRange.end)
			.join("\n");
		if (!currentBlock.split(/\r?\n/).some((line) =>
			isMarkerLine(line, FRONT_BACK_SEPARATOR)
		)) {
			return null;
		}

		const nextBlock = this.mergePreservedPrefixWithCardBlock(
			currentBlock,
			indexInFile,
			front,
			back,
			explanation,
		);
		const nextLines = [
			...lines.slice(0, currentRange.start),
			...nextBlock.split("\n"),
			CARD_END_SEPARATOR,
			...lines.slice(currentRange.end + 1),
		];
		return nextLines.join("\n");
	}

	private findCardBlockRanges(lines: string[]): Array<{
		start: number;
		end: number;
	}> {
		const ranges: Array<{ start: number; end: number }> = [];
		let start = 0;

		lines.forEach((line, index) => {
			if (!isMarkerLine(line, CARD_END_SEPARATOR)) return;
			ranges.push({ start, end: index });
			start = index + 1;
		});

		return ranges;
	}

	private mergePreservedPrefixWithCardBlock(
		currentBlock: string,
		indexInFile: number,
		front: string,
		back: string,
		explanation?: string,
	): string {
		const cardBlock = formatCardBlock(front, back, explanation);
		if (indexInFile !== 0) return cardBlock;

		const tagMatch = currentBlock.match(FIRST_TAG_LINE_PATTERN);
		if (!tagMatch || tagMatch.index === undefined) return cardBlock;

		const prefix = currentBlock.slice(
			0,
			tagMatch.index + tagMatch[0].length,
		);
		const separator = prefix.endsWith("\n") ? "" : "\n";
		return `${prefix}${separator}${cardBlock}`;
	}

	private appendCardBlock(
		content: string,
		front: string,
		back: string,
		explanation?: string,
	): string {
		const base = content.trimEnd();
		const separator = base.length > 0 ? "\n\n" : "";
		return `${base}${separator}${formatCardBlock(
			front,
			back,
			explanation,
		)}\n${CARD_END_SEPARATOR}\n`;
	}

	private async refreshDeckFromSource(
		file: TFile,
		existingDeck: Deck,
		content: string,
	): Promise<Deck> {
		const deck = await parseFileIntoDeck(
			file,
			this.plugin.app.vault,
			existingDeck,
			content,
		);
		if (!deck) throw new Error("Updated source has no valid cards");

		this.decks.set(deck.id, deck);
		const tag = extractFirstTag(content);
		if (tag && hasFlashcardSyntax(content)) {
			this.availableTags = Array.from(new Set([...this.availableTags, tag]));
		}
		await this.save();
		return deck;
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
