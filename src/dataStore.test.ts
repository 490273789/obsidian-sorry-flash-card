import { createEmptyCard, State } from "ts-fsrs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataStore, type StoredData } from "./dataStore";
import { DEFAULT_SETTINGS, type Deck, type FlashCard, type FlashcardSettings } from "./types";

vi.mock("obsidian", () => {
	class TFile {}
	class Plugin {}
	return { TFile, Plugin };
});

interface MockFile {
	path: string;
	basename: string;
}

interface MockVault {
	getMarkdownFiles: () => MockFile[];
	cachedRead: ReturnType<typeof vi.fn>;
}

interface MockPlugin {
	app: {
		vault: MockVault;
	};
	loadData: ReturnType<typeof vi.fn>;
	saveData: ReturnType<typeof vi.fn>;
}

function makePlugin(data: unknown = null, vault?: Partial<MockVault>): MockPlugin {
	return {
		app: {
			vault: {
				getMarkdownFiles: () => [],
				cachedRead: vi.fn(),
				...vault,
			},
		},
		loadData: vi.fn().mockResolvedValue(data),
		saveData: vi.fn().mockResolvedValue(undefined),
	};
}

function makeSettings(overrides: Partial<FlashcardSettings> = {}): FlashcardSettings {
	return {
		...DEFAULT_SETTINGS,
		...overrides,
		fsrsParameters: {
			...DEFAULT_SETTINGS.fsrsParameters,
			...overrides.fsrsParameters,
		},
		deckStudySettings: overrides.deckStudySettings ?? {},
	};
}

function makeCard(
	id: string,
	state: State,
	due: Date,
	indexInFile: number,
	overrides: Partial<FlashCard> = {},
): FlashCard {
	return {
		id,
		front: `front ${indexInFile}`,
		back: `back ${indexInFile}`,
		fsrsCard: {
			...createEmptyCard(),
			due,
			state,
			reps: state === State.New ? 0 : 1,
		},
		sourceFile: "notes/deck.md",
		indexInFile,
		...overrides,
	};
}

function serializeDeck(deck: Deck): StoredData["decks"][string] {
	return {
		...deck,
		cards: deck.cards.map((card) => ({
			...card,
			fsrsCard: {
				...card.fsrsCard,
				due: card.fsrsCard.due.toISOString(),
				last_review: card.fsrsCard.last_review?.toISOString() ?? null,
				learning_steps: card.fsrsCard.learning_steps ?? 0,
			},
		})),
	};
}

describe("DataStore settings", () => {
	it("migrates legacy flashcardTag and normalizes language/default messages", async () => {
		const plugin = makePlugin({
			flashcardTag: "#旧标签",
			language: "fr",
			fsrsParameters: {
				requestRetention: 0.8,
			},
		});
		const store = new DataStore(plugin as never);

		const settings = await store.loadSettings();

		expect(settings.flashcardTags).toEqual(["#旧标签"]);
		expect(settings.language).toBe("zh");
		expect(settings.fsrsParameters).toEqual({
			requestRetention: 0.8,
			maximumInterval: DEFAULT_SETTINGS.fsrsParameters.maximumInterval,
		});
		expect(settings.practiceMessagesCustomized).toBe(false);
		expect(settings.practicePerfectMessages).toEqual(DEFAULT_SETTINGS.practicePerfectMessages);
	});

	it("loads decks and history once when loadSettings has already populated data", async () => {
		const deck: Deck = {
			id: "notes/deck.md",
			name: "deck",
			filePath: "notes/deck.md",
			tag: "#单词",
			cards: [
				makeCard(
					"notes/deck.md::0",
					State.Review,
					new Date("2026-07-01T00:00:00.000Z"),
					0,
					{ explanation: "  note  " },
				),
			],
			studyCount: 2,
			lastStudied: "2026-07-02T00:00:00.000Z",
		};
		const plugin = makePlugin({
			decks: {
				[deck.id]: serializeDeck(deck),
			},
			lastSync: "2026-07-02T00:00:00.000Z",
			settings: makeSettings({ flashcardTags: ["#单词"] }),
			studyHistory: [
				{
					date: "2026-07-02",
					deckId: deck.id,
					deckName: deck.name,
					mode: "study",
					cardCount: 1,
					duration: 60,
					timestamp: 1,
				},
			],
		} satisfies StoredData);
		const store = new DataStore(plugin as never);

		await store.loadSettings();
		await store.load();

		expect(plugin.loadData).toHaveBeenCalledTimes(1);
		expect(store.getAllDecks()).toHaveLength(1);
		expect(store.getAllDecks()[0]?.cards[0]?.explanation).toBe("note");
		expect(store.getStudyHistory()).toHaveLength(1);
	});
});

describe("DataStore deck scanning and study plans", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("syncs only configured tags while caching all discovered flashcard tags", async () => {
		const files = [
			{ path: "notes/word.md", basename: "word" },
			{ path: "notes/phrase.md", basename: "phrase" },
			{ path: "notes/plain.md", basename: "plain" },
		];
		const contentByPath = new Map([
			[
				"notes/word.md",
				`#Word
front
??
back
;;`,
			],
			[
				"notes/phrase.md",
				`#短语
front
??
back
;;`,
			],
			["notes/plain.md", "#Word\n普通笔记"],
		]);
		const plugin = makePlugin(null, {
			getMarkdownFiles: () => files,
			cachedRead: vi.fn((file: MockFile) => Promise.resolve(contentByPath.get(file.path))),
		});
		const store = new DataStore(plugin as never, makeSettings({ flashcardTags: ["#word"] }));

		await store.syncFromVault();

		expect(store.getAllDecks().map((deck) => deck.id)).toEqual(["notes/word.md"]);
		expect(store.getAvailableTags()).toEqual(["#Word", "#短语"]);
		expect(plugin.saveData).toHaveBeenCalledTimes(1);
	});

	it("computes deck stats, day status, and today study caps", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-03T00:00:00.000Z"));
		const deck: Deck = {
			id: "notes/deck.md",
			name: "deck",
			filePath: "notes/deck.md",
			tag: "#单词",
			cards: [
				makeCard("notes/deck.md::0", State.Review, new Date("2026-07-01T00:00:00.000Z"), 0),
				makeCard("notes/deck.md::1", State.New, new Date("2026-07-03T00:00:00.000Z"), 1),
				makeCard("notes/deck.md::2", State.New, new Date("2026-07-03T00:00:00.000Z"), 2),
				makeCard(
					"notes/deck.md::3",
					State.Learning,
					new Date("2026-07-02T00:00:00.000Z"),
					3,
				),
				makeCard(
					"notes/deck.md::4",
					State.Relearning,
					new Date("2026-08-01T00:00:00.000Z"),
					4,
				),
			],
			studyCount: 0,
			lastStudied: null,
		};
		const plugin = makePlugin({
			decks: {
				[deck.id]: serializeDeck(deck),
			},
			lastSync: "2026-07-02T00:00:00.000Z",
			settings: makeSettings({
				dailyNewCards: 2,
				dailyReviewCards: 1,
				studyOrder: "sequential",
				flashcardTags: ["#单词"],
			}),
		} satisfies StoredData);
		const store = new DataStore(plugin as never);

		await store.loadSettings();

		expect(store.getDeckStats(deck)).toMatchObject({
			totalCards: 5,
			newCards: 2,
			dueCards: 2,
			learningCards: 1,
			reviewCards: 1,
			relearningCards: 1,
		});
		expect(store.getTodayStudyCounts(deck.id)).toEqual({ newCount: 2, reviewCount: 1 });
		expect(
			store
				.getDayList(deck.id)
				.map((day) => [day.dayIndex, day.isCompleted, day.isCurrent, day.isLocked]),
		).toEqual([
			[0, false, true, false],
			[1, false, false, true],
			[2, true, false, false],
		]);
		expect(store.getCardsForDay(deck.id, 1).map((card) => card.id)).toEqual([
			"notes/deck.md::2",
			"notes/deck.md::3",
		]);
	});

	it("creates sequential sessions with new cards followed by due reviews", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-03T00:00:00.000Z"));
		const deck: Deck = {
			id: "notes/deck.md",
			name: "deck",
			filePath: "notes/deck.md",
			tag: "#单词",
			cards: [
				makeCard("notes/deck.md::0", State.New, new Date("2026-07-03T00:00:00.000Z"), 0),
				makeCard("notes/deck.md::1", State.New, new Date("2026-07-03T00:00:00.000Z"), 1),
				makeCard("notes/deck.md::2", State.New, new Date("2026-07-03T00:00:00.000Z"), 2),
				makeCard("notes/deck.md::3", State.Review, new Date("2026-07-01T00:00:00.000Z"), 3),
				makeCard("notes/deck.md::4", State.Review, new Date("2026-08-01T00:00:00.000Z"), 4),
			],
			studyCount: 0,
			lastStudied: null,
		};
		const plugin = makePlugin({
			decks: {
				[deck.id]: serializeDeck(deck),
			},
			lastSync: "2026-07-02T00:00:00.000Z",
			settings: makeSettings({
				dailyNewCards: 2,
				dailyReviewCards: 1,
				studyOrder: "sequential",
			}),
		} satisfies StoredData);
		const store = new DataStore(plugin as never);

		await store.loadSettings();
		const session = store.createStudySession(deck.id, undefined, "reversed");

		expect(session).toMatchObject({
			deckId: deck.id,
			direction: "reversed",
			cardQueue: ["notes/deck.md::0", "notes/deck.md::1", "notes/deck.md::3"],
			currentIndex: 0,
			repeatQueue: [],
			history: [],
		});
	});

	it("records study history and keeps only the latest 20 distinct days", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-03T08:00:00.000Z"));
		const history = Array.from({ length: 20 }, (_, index) => {
			const day = String(index + 1).padStart(2, "0");
			return {
				date: `2026-06-${day}`,
				deckId: "notes/deck.md",
				deckName: "deck",
				mode: "study" as const,
				cardCount: 1,
				duration: 30,
				timestamp: index,
			};
		});
		const plugin = makePlugin({
			decks: {},
			lastSync: "2026-07-02T00:00:00.000Z",
			settings: makeSettings(),
			studyHistory: history,
		} satisfies StoredData);
		const store = new DataStore(plugin as never);

		await store.loadSettings();
		await store.recordStudySession("notes/deck.md", "deck", "practice", 5, 120);

		const dates = new Set(store.getStudyHistory().map((entry) => entry.date));
		expect(dates.size).toBe(20);
		expect(dates.has("2026-07-03")).toBe(true);
		expect(dates.has("2026-06-01")).toBe(false);
		expect(plugin.saveData).toHaveBeenCalledTimes(1);
	});
});
