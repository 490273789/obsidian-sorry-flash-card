import { createEmptyCard, State } from "ts-fsrs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataStore, type StoredData } from "../dataStore";
import {
	DEFAULT_SETTINGS,
	type Deck,
	type FlashCard,
	type FlashcardSettings,
} from "../../shared/types";

vi.mock("obsidian", () => {
	class Plugin {}
	return { Plugin };
});

interface MockFile {
	path: string;
	basename: string;
}

interface MockVault {
	getMarkdownFiles: () => MockFile[];
	cachedRead: ReturnType<typeof vi.fn>;
	getAbstractFileByPath: ReturnType<typeof vi.fn>;
	modify: ReturnType<typeof vi.fn>;
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
				getAbstractFileByPath: vi.fn(),
				modify: vi.fn().mockResolvedValue(undefined),
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
		pronunciation: {
			...DEFAULT_SETTINGS.pronunciation,
			...overrides.pronunciation,
		},
		deckStudySettings: overrides.deckStudySettings ?? {},
		wordLearningDecks: overrides.wordLearningDecks ?? {},
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
		expect(settings.wordLearningDecks).toEqual({});
		expect(settings.pronunciation).toEqual(DEFAULT_SETTINGS.pronunciation);
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

	it("saves the word-learning deck marker with the unified settings payload", async () => {
		const plugin = makePlugin();
		const store = new DataStore(plugin as never);
		await store.loadSettings();
		const settings = makeSettings({
			wordLearningDecks: { "notes/deck.md": true },
		});

		await store.saveSettings(settings);

		expect(plugin.saveData).toHaveBeenLastCalledWith(
			expect.objectContaining({
				settings: expect.objectContaining({
					wordLearningDecks: { "notes/deck.md": true },
				}),
			}),
		);
	});

	it("persists pronunciation SecretStorage IDs without storing API keys", async () => {
		const plugin = makePlugin();
		const store = new DataStore(plugin as never);
		await store.loadSettings();
		const settings = makeSettings({
			pronunciation: {
				...DEFAULT_SETTINGS.pronunciation,
				spellingAutoPlay: true,
				onlineProvider: "openai",
				openaiSecretId: "openai-flashcard",
			},
		});

		await store.saveSettings(settings);

		const saved = plugin.saveData.mock.calls[
			plugin.saveData.mock.calls.length - 1
		]?.[0] as StoredData;
		if (!saved.settings) throw new Error("Expected saved settings");
		expect(saved.settings.pronunciation).toMatchObject({
			spellingAutoPlay: true,
			onlineProvider: "openai",
			openaiSecretId: "openai-flashcard",
		});
		expect(JSON.stringify(saved.settings.pronunciation)).not.toContain("sk-");
	});

	it("persists independent spelling progress without changing FSRS state", async () => {
		const card = makeCard(
			"550e8400-e29b-41d4-a716-446655440000",
			State.Review,
			new Date("2026-07-01T00:00:00.000Z"),
			0,
		);
		const deck: Deck = {
			id: "notes/deck.md",
			name: "deck",
			filePath: "notes/deck.md",
			tag: "#单词",
			cards: [card],
			studyCount: 0,
			lastStudied: null,
		};
		const plugin = makePlugin({
			decks: { [deck.id]: serializeDeck(deck) },
			lastSync: "2026-07-02T00:00:00.000Z",
			settings: makeSettings(),
		} satisfies StoredData);
		const store = new DataStore(plugin as never);
		await store.loadSettings();
		const before = store.getDeck(deck.id)?.cards[0]?.fsrsCard;

		await store.commitSessionTransition({
			cardUpdates: [],
			spellingAttempts: [
				{ cardId: card.id, correct: false, attemptedAt: 1000 },
				{ cardId: card.id, correct: true, attemptedAt: 2000 },
			],
			incrementStudyCountFor: [],
			historyEntries: [],
		});

		expect(store.getSpellingProgress()[card.id]).toEqual({
			attempts: 2,
			correctAttempts: 1,
			correctStreak: 1,
			lastAttemptAt: 2000,
			lastIncorrectAt: 1000,
		});
		expect(store.getDeck(deck.id)?.cards[0]?.fsrsCard).toEqual(before);
	});

	it("publishes a session transition only after the complete next state is durable", async () => {
		const card = makeCard(
			"550e8400-e29b-41d4-a716-446655440000",
			State.New,
			new Date("2026-08-01T00:00:00.000Z"),
			0,
		);
		const deck: Deck = {
			id: "notes/deck.md",
			name: "deck",
			filePath: "notes/deck.md",
			tag: "#单词",
			cards: [card],
			studyCount: 0,
			lastStudied: null,
		};
		const plugin = makePlugin({
			decks: { [deck.id]: serializeDeck(deck) },
			lastSync: "2026-08-01T00:00:00.000Z",
			settings: makeSettings(),
		} satisfies StoredData);
		const store = new DataStore(plugin as never);
		await store.loadSettings();
		const reviewedCard = {
			...card.fsrsCard,
			state: State.Review,
			reps: 1,
		};
		const transition = {
			cardUpdates: [{ deckId: deck.id, cardId: card.id, fsrsCard: reviewedCard }],
			spellingAttempts: [{ cardId: card.id, correct: false, attemptedAt: 2_000 }],
			incrementStudyCountFor: [deck.id],
			historyEntries: [
				{
					deckId: deck.id,
					deckName: deck.name,
					mode: "study" as const,
					cardCount: 1,
					duration: 60,
				},
			],
		};
		plugin.saveData.mockRejectedValueOnce(new Error("disk unavailable"));

		await expect(store.commitSessionTransition(transition)).rejects.toThrow("disk unavailable");
		expect(store.getDeck(deck.id)).toMatchObject({ studyCount: 0 });
		expect(store.getCard(deck.id, card.id)?.fsrsCard.state).toBe(State.New);
		expect(store.getSpellingProgress()).toEqual({});
		expect(store.getStudyHistory()).toEqual([]);

		await store.commitSessionTransition(transition);
		expect(store.getDeck(deck.id)).toMatchObject({ studyCount: 1 });
		expect(store.getCard(deck.id, card.id)?.fsrsCard.state).toBe(State.Review);
		expect(store.getSpellingProgress()[card.id]).toMatchObject({
			attempts: 1,
			correctAttempts: 0,
			correctStreak: 0,
		});
		expect(store.getStudyHistory()).toMatchObject([
			{ mode: "study", cardCount: 1, duration: 60 },
		]);
	});

	it("prunes progress for cards deleted from a retained deck", async () => {
		const retained = makeCard(
			"550e8400-e29b-41d4-a716-446655440000",
			State.New,
			new Date("2026-07-01T00:00:00.000Z"),
			0,
		);
		const deleted = makeCard(
			"7d444840-9dc0-11d1-b245-5ffdce74fad2",
			State.New,
			new Date("2026-07-01T00:00:00.000Z"),
			1,
		);
		const deck: Deck = {
			id: "notes/deck.md",
			name: "deck",
			filePath: "notes/deck.md",
			tag: "#单词",
			cards: [retained, deleted],
			studyCount: 0,
			lastStudied: null,
		};
		const progress = {
			attempts: 1,
			correctAttempts: 1,
			correctStreak: 1,
			lastAttemptAt: 1000,
		};
		const plugin = makePlugin({
			decks: { [deck.id]: serializeDeck(deck) },
			lastSync: "2026-07-02T00:00:00.000Z",
			settings: makeSettings(),
			spellingProgress: {
				[retained.id]: progress,
				[deleted.id]: progress,
			},
		} satisfies StoredData);
		const store = new DataStore(plugin as never);
		await store.loadSettings();

		const continuityStore = store.createContinuityStateStore();
		const state = await continuityStore.load();
		state.decks.set(deck.id, { ...deck, cards: [retained] });
		await continuityStore.commit(state);

		expect(store.getSpellingProgress()).toEqual({
			[retained.id]: progress,
		});
	});

	it("keeps spelling progress when a stable card identity moves between decks", async () => {
		const card = makeCard(
			"550e8400-e29b-41d4-a716-446655440000",
			State.New,
			new Date("2026-07-01T00:00:00.000Z"),
			0,
		);
		const sourceDeck: Deck = {
			id: "notes/source.md",
			name: "source",
			filePath: "notes/source.md",
			tag: "#单词",
			cards: [card],
			studyCount: 0,
			lastStudied: null,
		};
		const progress = {
			attempts: 2,
			correctAttempts: 1,
			correctStreak: 0,
			lastAttemptAt: 2000,
			lastIncorrectAt: 2000,
		};
		const plugin = makePlugin({
			decks: { [sourceDeck.id]: serializeDeck(sourceDeck) },
			lastSync: "2026-07-02T00:00:00.000Z",
			settings: makeSettings(),
			spellingProgress: { [card.id]: progress },
		} satisfies StoredData);
		const store = new DataStore(plugin as never);
		await store.loadSettings();

		const continuityStore = store.createContinuityStateStore();
		const state = await continuityStore.load();
		state.decks = new Map([
			[
				"notes/target.md",
				{
					...sourceDeck,
					id: "notes/target.md",
					name: "target",
					filePath: "notes/target.md",
					cards: [{ ...card, sourceFile: "notes/target.md" }],
				},
			],
		]);
		await continuityStore.commit(state);

		expect(store.getSpellingProgress()[card.id]).toEqual(progress);
	});
});

describe("DataStore deck scanning and study plans", () => {
	afterEach(() => {
		vi.useRealTimers();
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
		await store.recordWordListSession("notes/deck.md", "deck", 120);

		const dates = new Set(store.getStudyHistory().map((entry) => entry.date));
		expect(dates.size).toBe(20);
		expect(dates.has("2026-07-03")).toBe(true);
		expect(dates.has("2026-06-01")).toBe(false);
		expect(plugin.saveData).toHaveBeenCalledTimes(1);
	});
});
