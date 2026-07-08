import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it, vi } from "vitest";
import {
	createPracticeSessionRuntime,
	type PracticeSessionRuntimeStore,
} from "../practiceSessionRuntime";
import type { Deck, FlashCard, PracticeResult, PracticeSession } from "../../shared/types";

function makeCard(id: string, indexInFile: number): FlashCard {
	return {
		id,
		front: `front ${indexInFile}`,
		back: `back ${indexInFile}`,
		fsrsCard: createEmptyCard(),
		sourceFile: "notes/deck.md",
		indexInFile,
	};
}

function makeDeck(cards: FlashCard[]): Deck {
	return {
		id: "notes/deck.md",
		name: "Deck",
		filePath: "notes/deck.md",
		tag: "#word",
		cards,
		studyCount: 0,
		lastStudied: null,
	};
}

function makeSession(overrides: Partial<PracticeSession> = {}): PracticeSession {
	return {
		deckId: "notes/deck.md",
		direction: "normal",
		cardQueue: ["card-1", "card-2"],
		currentIndex: 0,
		startTime: 1000,
		totalQuestions: 2,
		answers: {},
		history: [],
		...overrides,
	};
}

function makeResult(overrides: Partial<PracticeResult> = {}): PracticeResult {
	return {
		direction: "normal",
		totalQuestions: 2,
		correctCount: 1,
		incorrectCount: 1,
		accuracy: 50,
		incorrectCardIds: ["card-2"],
		timeSpent: 90,
		...overrides,
	};
}

function makeStore(cards: FlashCard[], dayCards: FlashCard[] = cards) {
	const deck = makeDeck(cards);
	const cardsById = new Map(cards.map((card) => [card.id, card]));
	const getDeck = vi.fn((id: string) => (id === deck.id ? deck : undefined));
	const getCard = vi.fn((_deckId: string, cardId: string) => cardsById.get(cardId));
	const getCardsForDay = vi.fn((_deckId: string, _dayIndex: number) => dayCards);
	const recordStudySession = vi.fn().mockResolvedValue(undefined);
	const store: PracticeSessionRuntimeStore = {
		getDeck,
		getCard,
		getCardsForDay,
		recordStudySession,
	};

	return {
		store,
		getDeck,
		getCard,
		getCardsForDay,
		recordStudySession,
	};
}

describe("PracticeSessionRuntime", () => {
	it("creates sessions from a deck and setup options", () => {
		const cards = [makeCard("card-1", 0), makeCard("card-2", 1), makeCard("card-3", 2)];
		const runtime = createPracticeSessionRuntime(makeStore(cards).store);

		const session = runtime.createSession(
			"notes/deck.md",
			{
				mode: "random-count",
				questionCount: 2,
				direction: "reversed",
			},
			2000,
		);

		expect(session).toMatchObject({
			deckId: "notes/deck.md",
			direction: "reversed",
			startTime: 2000,
			totalQuestions: 2,
			currentIndex: 0,
			answers: {},
			history: [],
		});
		expect(session?.cardQueue).toHaveLength(2);
	});

	it("creates day sessions through the store and returns null for empty days", () => {
		const cards = [makeCard("card-1", 0), makeCard("card-2", 1)];
		const store = makeStore(cards);
		const runtime = createPracticeSessionRuntime(store.store);

		const session = runtime.createDaySession({
			deckId: "notes/deck.md",
			dayIndex: 1,
			studyOrder: "sequential",
			direction: "normal",
			now: 3000,
		});

		expect(store.getCardsForDay).toHaveBeenCalledWith("notes/deck.md", 1);
		expect(session).toEqual(makeSession({ startTime: 3000 }));

		const emptyRuntime = createPracticeSessionRuntime(makeStore(cards, []).store);
		expect(
			emptyRuntime.createDaySession({
				deckId: "notes/deck.md",
				dayIndex: 1,
				studyOrder: "sequential",
				direction: "normal",
			}),
		).toBeNull();
	});

	it("answers cards and records practice history when the session completes", async () => {
		const store = makeStore([makeCard("card-1", 0), makeCard("card-2", 1)]);
		const runtime = createPracticeSessionRuntime(store.store);

		const firstStep = await runtime.answer(makeSession(), true, 5000);
		expect(firstStep).toEqual({
			type: "continue",
			session: makeSession({
				currentIndex: 1,
				answers: { "card-1": true },
				history: ["card-1"],
			}),
		});
		expect(store.recordStudySession).not.toHaveBeenCalled();

		const finalStep = await runtime.answer(
			makeSession({
				currentIndex: 1,
				answers: { "card-1": true },
				history: ["card-1"],
			}),
			false,
			91000,
		);

		expect(finalStep?.type).toBe("complete");
		if (finalStep?.type !== "complete") throw new Error("Expected complete outcome");
		expect(finalStep.result).toMatchObject({
			totalQuestions: 2,
			correctCount: 1,
			incorrectCount: 1,
			incorrectCardIds: ["card-2"],
			timeSpent: 90,
		});
		expect(store.recordStudySession).toHaveBeenCalledWith(
			"notes/deck.md",
			"Deck",
			"practice",
			2,
			90,
		);
	});

	it("moves back to the previous card through the runtime interface", () => {
		const runtime = createPracticeSessionRuntime(makeStore([makeCard("card-1", 0)]).store);

		const previous = runtime.previous(
			makeSession({
				currentIndex: 1,
				answers: { "card-1": true },
				history: ["card-1"],
			}),
		);

		expect(previous).toEqual(makeSession());
	});

	it("creates incorrect-card sessions and exposes cards for summaries", () => {
		const cards = [makeCard("card-1", 0), makeCard("card-2", 1), makeCard("card-3", 2)];
		const runtime = createPracticeSessionRuntime(makeStore(cards).store);

		const session = runtime.createIncorrectSession(
			makeSession({ direction: "reversed" }),
			makeResult({ incorrectCardIds: ["card-2", "card-3"] }),
			7000,
		);

		expect(session).toMatchObject({
			deckId: "notes/deck.md",
			direction: "reversed",
			startTime: 7000,
			totalQuestions: 2,
		});
		expect(session?.cardQueue).toHaveLength(2);
		expect(runtime.getCards("notes/deck.md", ["card-3", "missing", "card-1"])).toEqual([
			cards[2],
			cards[0],
		]);
		expect(
			runtime.createIncorrectSession(
				makeSession(),
				makeResult({ incorrectCardIds: [], incorrectCount: 0 }),
			),
		).toBeNull();
	});

	it("keeps practice session card identity remapping behind the runtime interface", () => {
		const runtime = createPracticeSessionRuntime(makeStore([]).store);

		const remapped = runtime.remapSessionCards(
			makeSession({
				currentIndex: 1,
				answers: { "card-1": true, "card-2": false },
				history: ["card-1"],
			}),
			{
				"card-1": null,
				"card-2": "card-1",
			},
		);

		expect(remapped).toEqual(
			makeSession({
				cardQueue: ["card-1"],
				currentIndex: 0,
				totalQuestions: 1,
				answers: { "card-1": false },
				history: [],
			}),
		);
	});
});
