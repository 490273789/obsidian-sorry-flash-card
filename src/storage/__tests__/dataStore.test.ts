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
		expect(settings.deckOrder).toEqual([]);
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

	it("restores a persisted available-tag snapshot, including an empty snapshot", async () => {
		const populatedStore = new DataStore(
			makePlugin({
				decks: {},
				lastSync: "2026-07-02T00:00:00.000Z",
				availableTags: ["#单词", "#短语", "#单词"],
			}) as never,
		);
		await populatedStore.loadSettings();

		expect(populatedStore.hasAvailableTagsSnapshot()).toBe(true);
		expect(populatedStore.getAvailableTags()).toEqual(["#单词", "#短语"]);

		const emptyStore = new DataStore(
			makePlugin({
				decks: {},
				lastSync: "2026-07-02T00:00:00.000Z",
				availableTags: [],
			}) as never,
		);
		await emptyStore.loadSettings();

		expect(emptyStore.hasAvailableTagsSnapshot()).toBe(true);
		expect(emptyStore.getAvailableTags()).toEqual([]);
	});

	it("persists available tags committed by identity synchronization", async () => {
		const plugin = makePlugin();
		const store = new DataStore(plugin as never);
		await store.loadSettings();
		const continuityStore = store.createContinuityStateStore();
		const state = await continuityStore.load();

		await continuityStore.commit({
			...state,
			availableTags: ["#单词", "#短语"],
		});

		expect(plugin.saveData).toHaveBeenLastCalledWith(
			expect.objectContaining({
				availableTags: ["#单词", "#短语"],
			}),
		);
		expect(store.hasAvailableTagsSnapshot()).toBe(true);
		expect(store.getAvailableTags()).toEqual(["#单词", "#短语"]);
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

	it("normalizes loaded pronunciation settings through the pronunciation module", async () => {
		const plugin = makePlugin({
			settings: makeSettings({
				pronunciation: {
					...DEFAULT_SETTINGS.pronunciation,
					azureCloud: "global",
					azureRegion: " ChinaEast2 ",
					azureSecretId: " secret-id ",
				},
			}),
		});
		const store = new DataStore(plugin as never);

		const settings = await store.loadSettings();

		expect(settings.pronunciation).toMatchObject({
			azureCloud: "global",
			azureRegion: "eastus",
			azureSecretId: " secret-id ",
		});
	});

	it("does not publish new settings in memory when durable saving fails", async () => {
		const plugin = makePlugin();
		const store = new DataStore(plugin as never);
		const previous = await store.loadSettings();
		const revision = store.getRevision();
		const listener = vi.fn();
		store.subscribe(listener);
		plugin.saveData.mockRejectedValueOnce(new Error("disk unavailable"));

		await expect(
			store.saveSettings(makeSettings({ dailyNewCards: previous.dailyNewCards + 1 })),
		).rejects.toThrow("disk unavailable");
		expect(store.getSettings().dailyNewCards).toBe(previous.dailyNewCards);
		expect(store.getRevision()).toBe(revision);
		expect(listener).not.toHaveBeenCalled();

		await store.saveSettings(makeSettings({ dailyNewCards: previous.dailyNewCards + 1 }));
		expect(store.getRevision()).toBe(revision + 1);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("keeps externally edited settings detached until they are durably saved", async () => {
		const plugin = makePlugin();
		const store = new DataStore(plugin as never);
		const editable = await store.loadSettings();
		const revision = store.getRevision();

		editable.dailyNewCards += 7;
		editable.wordLearningDecks["notes/deck.md"] = true;

		expect(store.getSettings()).toMatchObject({
			dailyNewCards: DEFAULT_SETTINGS.dailyNewCards,
			wordLearningDecks: {},
		});
		expect(store.getRevision()).toBe(revision);

		await store.saveSettings(editable);
		expect(store.getSettings()).toMatchObject({
			dailyNewCards: DEFAULT_SETTINGS.dailyNewCards + 7,
			wordLearningDecks: { "notes/deck.md": true },
		});
		expect(store.getRevision()).toBe(revision + 1);
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
		const revision = store.getRevision();
		const listener = vi.fn();
		store.subscribe(listener);
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
		expect(store.getRevision()).toBe(revision);
		expect(listener).not.toHaveBeenCalled();

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
		expect(store.getRevision()).toBe(revision + 1);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("atomically persists a study update after its card moves to another deck", async () => {
		const card = makeCard(
			"550e8400-e29b-41d4-a716-446655440000",
			State.New,
			new Date("2026-08-01T00:00:00.000Z"),
			0,
			{ sourceFile: "notes/source.md" },
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
		const plugin = makePlugin({
			decks: { [sourceDeck.id]: serializeDeck(sourceDeck) },
			lastSync: "2026-08-01T00:00:00.000Z",
			settings: makeSettings(),
		} satisfies StoredData);
		const store = new DataStore(plugin as never);
		await store.loadSettings();

		const targetDeckId = "notes/target.md";
		const continuityStore = store.createContinuityStateStore();
		const state = await continuityStore.load();
		state.decks = new Map([
			[
				targetDeckId,
				{
					...sourceDeck,
					id: targetDeckId,
					name: "target",
					filePath: targetDeckId,
					cards: [{ ...card, sourceFile: targetDeckId }],
				},
			],
		]);
		await continuityStore.commit(state);

		const reviewedCard = {
			...card.fsrsCard,
			state: State.Review,
			reps: 1,
		};
		const transition = {
			cardUpdates: [{ deckId: sourceDeck.id, cardId: card.id, fsrsCard: reviewedCard }],
			spellingAttempts: [],
			incrementStudyCountFor: [],
			historyEntries: [],
		};
		const revision = store.getRevision();
		plugin.saveData.mockRejectedValueOnce(new Error("disk unavailable"));

		await expect(store.commitSessionTransition(transition)).rejects.toThrow("disk unavailable");
		expect(store.getCard(sourceDeck.id, card.id)?.fsrsCard.state).toBe(State.New);
		expect(store.getRevision()).toBe(revision);

		await store.commitSessionTransition(transition);
		expect(store.getCard(sourceDeck.id, card.id)?.fsrsCard.state).toBe(State.Review);
		const saved = plugin.saveData.mock.calls[
			plugin.saveData.mock.calls.length - 1
		]?.[0] as StoredData;
		expect(saved.decks[targetDeckId]?.cards[0]?.fsrsCard.state).toBe(State.Review);
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

	it("does not publish continuity changes before their complete state is durable", async () => {
		const card = makeCard(
			"550e8400-e29b-41d4-a716-446655440000",
			State.New,
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
		const revision = store.getRevision();
		const listener = vi.fn();
		store.subscribe(listener);
		const continuityStore = store.createContinuityStateStore();
		const state = await continuityStore.load();
		state.decks = new Map();
		plugin.saveData.mockRejectedValueOnce(new Error("disk unavailable"));

		await expect(continuityStore.commit(state)).rejects.toThrow("disk unavailable");
		expect(store.getAllDecks()).toHaveLength(1);
		expect(store.getRevision()).toBe(revision);
		expect(listener).not.toHaveBeenCalled();

		await continuityStore.commit(state);
		expect(store.getAllDecks()).toHaveLength(0);
		expect(store.getRevision()).toBe(revision + 1);
		expect(listener).toHaveBeenCalledTimes(1);
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
	});

	it("returns the earliest future due time when another card is already overdue", async () => {
		const now = new Date("2026-08-02T12:00:00.000Z");
		const futureDue = new Date("2026-08-02T12:30:00.000Z");
		const deck: Deck = {
			id: "notes/deck.md",
			name: "deck",
			filePath: "notes/deck.md",
			tag: "#单词",
			cards: [
				makeCard("overdue", State.Review, new Date("2026-08-02T11:00:00.000Z"), 0),
				makeCard("future", State.Review, futureDue, 1),
			],
			studyCount: 0,
			lastStudied: null,
		};
		const plugin = makePlugin({
			decks: { [deck.id]: serializeDeck(deck) },
			lastSync: "2026-08-02T10:00:00.000Z",
			settings: makeSettings(),
		} satisfies StoredData);
		const store = new DataStore(plugin as never);
		await store.loadSettings();

		expect(store.getNextDueTime(now)).toBe(futureDue.getTime());
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

	it("preserves card object identities and reuses serialized card cache for untouched cards", async () => {
		const card1 = makeCard("card-1", State.New, new Date("2026-08-01T00:00:00.000Z"), 0);
		const card2 = makeCard("card-2", State.New, new Date("2026-08-01T00:00:00.000Z"), 1);
		const card3 = makeCard("card-3", State.New, new Date("2026-08-01T00:00:00.000Z"), 2);
		const deck: Deck = {
			id: "notes/deck.md",
			name: "deck",
			filePath: "notes/deck.md",
			tag: "#单词",
			cards: [card1, card2, card3],
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

		const initialDeck = store.getDeck(deck.id)!;
		const initialCard1 = initialDeck.cards[0]!;
		const initialCard2 = initialDeck.cards[1]!;
		const initialCard3 = initialDeck.cards[2]!;

		// Commit transition updating only card-1
		const updatedFsrs1 = { ...initialCard1.fsrsCard, state: State.Review, reps: 1 };
		await store.commitSessionTransition({
			cardUpdates: [{ deckId: deck.id, cardId: initialCard1.id, fsrsCard: updatedFsrs1 }],
			incrementStudyCountFor: [deck.id],
			spellingAttempts: [],
			historyEntries: [],
		});

		const nextDeck = store.getDeck(deck.id)!;
		// Updated card has a new object reference
		expect(nextDeck.cards[0]).not.toBe(initialCard1);
		expect(nextDeck.cards[0]!.fsrsCard.state).toBe(State.Review);
		// Untouched cards preserve their object references (structural sharing)
		expect(nextDeck.cards[1]).toBe(initialCard2);
		expect(nextDeck.cards[2]).toBe(initialCard3);

		// Verify serialized cards for untouched cards were cached and reused
		const firstSavedData = plugin.saveData.mock.calls[0]![0] as StoredData;
		const savedCard2First = firstSavedData.decks[deck.id]!.cards[1]!;
		const savedCard3First = firstSavedData.decks[deck.id]!.cards[2]!;

		// Second transition updating only card-1 again
		const updatedFsrs2 = { ...nextDeck.cards[0]!.fsrsCard, reps: 2 };
		await store.commitSessionTransition({
			cardUpdates: [{ deckId: deck.id, cardId: initialCard1.id, fsrsCard: updatedFsrs2 }],
			incrementStudyCountFor: [deck.id],
			spellingAttempts: [],
			historyEntries: [],
		});

		const secondSavedData = plugin.saveData.mock.calls[1]![0] as StoredData;
		const savedCard2Second = secondSavedData.decks[deck.id]!.cards[1]!;
		const savedCard3Second = secondSavedData.decks[deck.id]!.cards[2]!;

		// SerializedCard for untouched cards must be the identical cached object instance
		expect(savedCard2Second).toBe(savedCard2First);
		expect(savedCard3Second).toBe(savedCard3First);
	});
});
