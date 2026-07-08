import { createEmptyCard, State, type Card } from "ts-fsrs";
import { describe, expect, it, vi } from "vitest";
import { createStudySessionRuntime, type StudySessionRuntimeStore } from "../studySessionRuntime";
import type { Deck, FlashCard, StudySession } from "../../shared/types";

function makeFsrsCard(overrides: Partial<Card> = {}): Card {
	return {
		...createEmptyCard(),
		due: new Date("2026-07-08T00:00:00.000Z"),
		...overrides,
	};
}

function makeCard(id: string, overrides: Partial<FlashCard> = {}): FlashCard {
	return {
		id,
		front: `front ${id}`,
		back: `back ${id}`,
		fsrsCard: makeFsrsCard(),
		sourceFile: "notes/deck.md",
		indexInFile: 0,
		...overrides,
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

function makeSession(overrides: Partial<StudySession> = {}): StudySession {
	return {
		deckId: "notes/deck.md",
		direction: "normal",
		cardQueue: ["card-1", "card-2"],
		currentIndex: 0,
		startTime: 1000,
		repeatQueue: [],
		history: [],
		answerEvents: [],
		...overrides,
	};
}

function makeStore(cards: FlashCard[]) {
	const deck = makeDeck(cards);
	const cardsById = new Map(cards.map((card) => [card.id, card]));
	const getDeck = vi.fn((id: string) => (id === deck.id ? deck : undefined));
	const getCard = vi.fn((_deckId: string, cardId: string) => cardsById.get(cardId));
	const updateCard = vi.fn().mockResolvedValue(undefined);
	const incrementStudyCount = vi.fn().mockResolvedValue(undefined);
	const recordStudySession = vi.fn().mockResolvedValue(undefined);
	const rateStudyCard = vi.fn((card: Card) => ({
		fsrsCard: {
			...card,
			reps: card.reps + 1,
			state: State.Review,
		},
		repeatInSession: false,
	}));
	const store: StudySessionRuntimeStore = {
		getDeck,
		getCard,
		updateCard,
		incrementStudyCount,
		recordStudySession,
		rateStudyCard,
	};

	return {
		store,
		getDeck,
		getCard,
		updateCard,
		incrementStudyCount,
		recordStudySession,
		rateStudyCard,
	};
}

describe("StudySessionRuntime", () => {
	it("reads the current card through the store", () => {
		const card = makeCard("card-1");
		const store = makeStore([card]);
		const runtime = createStudySessionRuntime(store.store);

		expect(runtime.getCurrentCard(makeSession())).toBe(card);
		expect(store.getCard).toHaveBeenCalledWith("notes/deck.md", "card-1");
	});

	it("answers a card, persists its FSRS update, and returns the next session", async () => {
		const card = makeCard("card-1");
		const store = makeStore([card, makeCard("card-2")]);
		const runtime = createStudySessionRuntime(store.store);

		const outcome = await runtime.answer(makeSession(), 3, 5000);

		expect(outcome?.type).toBe("continue");
		if (outcome?.type !== "continue") throw new Error("Expected continue outcome");
		expect(outcome.session.currentIndex).toBe(1);
		expect(outcome.session.history).toEqual(["card-1"]);
		expect(store.rateStudyCard).toHaveBeenCalledWith(card.fsrsCard, 3);
		expect(store.updateCard).toHaveBeenCalledWith(
			"notes/deck.md",
			"card-1",
			expect.objectContaining({
				reps: 1,
				state: State.Review,
			}),
		);
		expect(store.recordStudySession).not.toHaveBeenCalled();
	});

	it("persists completion inside the runtime when the final answer completes a session", async () => {
		const store = makeStore([makeCard("card-1")]);
		const runtime = createStudySessionRuntime(store.store);

		const outcome = await runtime.answer(
			makeSession({ cardQueue: ["card-1"], currentIndex: 0 }),
			4,
			61000,
		);

		expect(outcome?.type).toBe("complete");
		expect(store.updateCard).toHaveBeenCalledTimes(1);
		expect(store.incrementStudyCount).toHaveBeenCalledWith("notes/deck.md");
		expect(store.recordStudySession).toHaveBeenCalledWith(
			"notes/deck.md",
			"Deck",
			"study",
			1,
			60,
		);
	});

	it("undoes the last answer and restores the previous FSRS state through the store", async () => {
		const previousFsrsCard = makeFsrsCard({ reps: 0, state: State.New });
		const nextFsrsCard = makeFsrsCard({ reps: 1, state: State.Review });
		const store = makeStore([makeCard("card-1", { fsrsCard: nextFsrsCard })]);
		const runtime = createStudySessionRuntime(store.store);

		const outcome = await runtime.undo(
			makeSession({
				currentIndex: 1,
				history: ["card-1"],
				answerEvents: [
					{
						cardId: "card-1",
						rating: 3,
						previousFsrsCard,
						nextFsrsCard,
						repeatInSession: false,
						answeredAt: 5000,
						previousCurrentIndex: 0,
						previousCardQueueLength: 2,
						previousRepeatQueue: [],
					},
				],
			}),
		);

		expect(outcome?.session.currentIndex).toBe(0);
		expect(outcome?.session.answerEvents).toEqual([]);
		expect(store.updateCard).toHaveBeenCalledWith("notes/deck.md", "card-1", previousFsrsCard);
	});

	it("records abandoned sessions only when the session has answer events", async () => {
		const fsrsCard = makeFsrsCard();
		const store = makeStore([makeCard("card-1")]);
		const runtime = createStudySessionRuntime(store.store);

		await runtime.finish(makeSession(), "abandoned", 65000);
		expect(store.recordStudySession).not.toHaveBeenCalled();

		await runtime.finish(
			makeSession({
				answerEvents: [
					{
						cardId: "card-1",
						rating: 3,
						previousFsrsCard: fsrsCard,
						nextFsrsCard: fsrsCard,
						repeatInSession: false,
						answeredAt: 5000,
						previousCurrentIndex: 0,
						previousCardQueueLength: 2,
						previousRepeatQueue: [],
					},
				],
			}),
			"abandoned",
			65000,
		);

		expect(store.incrementStudyCount).not.toHaveBeenCalled();
		expect(store.recordStudySession).toHaveBeenCalledWith(
			"notes/deck.md",
			"Deck",
			"study",
			1,
			64,
		);
	});

	it("keeps study session card identity remapping behind the runtime interface", () => {
		const runtime = createStudySessionRuntime(makeStore([]).store);

		const remapped = runtime.remapSessionCards(makeSession(), {
			"card-1": null,
			"card-2": "card-1",
		});

		expect(remapped?.cardQueue).toEqual(["card-1"]);
		expect(remapped?.currentIndex).toBe(0);
	});
});
