import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it, vi } from "vitest";
import type { Deck, FlashCard, SpellingSession } from "../../shared/types";
import {
	createSpellingSessionRuntime,
	type SpellingSessionRuntimeStore,
} from "../spellingSessionRuntime";
import { createSpellingSession } from "../spellingSessionEngine";

function makeCard(id: string, front: string, indexInFile: number): FlashCard {
	return {
		id,
		front,
		back: `meaning ${front}`,
		fsrsCard: createEmptyCard(),
		sourceFile: "notes/deck.md",
		indexInFile,
	};
}

function makeStore(cards: FlashCard[]) {
	const deck: Deck = {
		id: "notes/deck.md",
		name: "Deck",
		filePath: "notes/deck.md",
		tag: "#word",
		cards,
		studyCount: 0,
		lastStudied: null,
	};
	const progress = {
		[cards[0]!.id]: {
			attempts: 2,
			correctAttempts: 2,
			correctStreak: 2,
			lastAttemptAt: 100,
		},
	};
	const recordSpellingAttempt = vi.fn().mockResolvedValue(undefined);
	const recordStudySession = vi.fn().mockResolvedValue(undefined);
	const store: SpellingSessionRuntimeStore = {
		getDeck: (id) => (id === deck.id ? deck : undefined),
		getCard: (_deckId, cardId) => cards.find((card) => card.id === cardId),
		getCardsForDay: () => cards,
		getSpellingProgress: () => progress,
		recordSpellingAttempt,
		recordStudySession,
	};
	return { store, recordSpellingAttempt, recordStudySession };
}

describe("SpellingSessionRuntime", () => {
	it("reports deck mastery buckets", () => {
		const cards = [
			makeCard("stable", "science", 0),
			makeCard("new", "apple", 1),
			makeCard("ignored", "science / fair", 2),
		];
		const runtime = createSpellingSessionRuntime(makeStore(cards).store);

		expect(runtime.getDeckProgressStats("notes/deck.md")).toEqual({
			total: 2,
			unpracticed: 1,
			reinforcement: 0,
			stable: 1,
		});
	});

	it("selects only eligible cards from a mixed-content deck", () => {
		const cards = [
			makeCard("phrase", "make an impression", 0),
			makeCard("ignored", "science / fair", 1),
			makeCard("last", "at last", 2),
		];
		const runtime = createSpellingSessionRuntime(makeStore(cards).store);

		const smartSession = runtime.createSession(
			"notes/deck.md",
			{ mode: "smart", questionCount: 20 },
			1000,
		);
		const rangeSession = runtime.createSession(
			"notes/deck.md",
			{ mode: "range", startIndex: 2, endIndex: 2 },
			1000,
		);

		expect(smartSession?.selectedCardIds.sort()).toEqual(["last", "phrase"]);
		expect(smartSession?.cardQueue).not.toContain("ignored");
		expect(rangeSession?.selectedCardIds).toEqual(["last"]);
	});

	it("creates a spelling session from only the eligible cards in one study day", () => {
		const cards = [
			makeCard("day-word", "science", 0),
			makeCard("day-ignored", "science / fair", 1),
			makeCard("other-day", "apple", 2),
		];
		const mock = makeStore(cards);
		mock.store.getCardsForDay = (_deckId, dayIndex) =>
			dayIndex === 0 ? cards.slice(0, 2) : dayIndex === 1 ? cards.slice(2) : [];
		const runtime = createSpellingSessionRuntime(mock.store);

		const session = runtime.createDaySession("notes/deck.md", 0, 1000);

		expect(session?.selectedCardIds).toEqual(["day-word"]);
		expect(session?.startTime).toBe(1000);
		expect(runtime.createDaySession("notes/deck.md", 99, 1000)).toBeNull();
	});

	it("persists retrievals but excludes forced corrections and records history on completion", async () => {
		const card = makeCard("science", "## science", 0);
		const mock = makeStore([card]);
		const runtime = createSpellingSessionRuntime(mock.store);
		const session = {
			...createSpellingSession({
				deckId: "notes/deck.md",
				cardIds: [card.id],
				startTime: 1000,
			}),
			originDeck: { id: "notes/deck.md", name: "Original Deck" },
		};

		const wrong = await runtime.answer(session, "sciense", 2000);
		expect(wrong).toMatchObject({
			type: "continue",
			feedback: "retrieval-incorrect",
			answer: "science",
		});
		if (wrong?.type !== "continue") throw new Error("expected continuation");
		expect(mock.recordSpellingAttempt).toHaveBeenLastCalledWith(card.id, false, 2000);

		const corrected = await runtime.answer(wrong.session, "science", 3000);
		if (corrected?.type !== "continue") throw new Error("expected continuation");
		expect(mock.recordSpellingAttempt).toHaveBeenCalledTimes(1);

		const complete = await runtime.answer(corrected.session, "science", 5000);
		expect(complete?.type).toBe("complete");
		expect(mock.recordSpellingAttempt).toHaveBeenLastCalledWith(card.id, true, 5000);
		expect(mock.recordStudySession).toHaveBeenCalledWith(
			"notes/deck.md",
			"Original Deck",
			"spelling",
			1,
			4,
		);
	});

	it("records partial history on explicit finish", async () => {
		const card = makeCard("science", "science", 0);
		const mock = makeStore([card]);
		const runtime = createSpellingSessionRuntime(mock.store);
		const session: SpellingSession = {
			...createSpellingSession({
				deckId: "notes/deck.md",
				cardIds: [card.id],
				startTime: 1000,
			}),
			firstAttempts: {
				[card.id]: { input: "science", correct: true, answeredAt: 2000 },
			},
		};

		await runtime.finish(session, 61000);

		expect(mock.recordStudySession).toHaveBeenCalledWith(
			"notes/deck.md",
			"Deck",
			"spelling",
			1,
			60,
		);
	});
});
