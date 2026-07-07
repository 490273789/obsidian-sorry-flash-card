import { createEmptyCard, State } from "ts-fsrs";
import { describe, expect, it, vi } from "vitest";
import {
	answerStudyCard,
	canUndoStudyAnswer,
	createStudySession,
	finishStudySession,
	getCurrentStudyCardId,
	getStudyProgress,
	remapStudySessionCards,
	undoStudyAnswer,
	type StudyCardScheduler,
} from "../studySessionEngine";
import type { FlashCard, StudySession } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";

function makeCard(id: string, state: State, due: Date, indexInFile: number): FlashCard {
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
	};
}

function makeSession(overrides: Partial<StudySession> = {}): StudySession {
	return {
		deckId: "notes/deck.md",
		direction: "normal",
		cardQueue: ["card-1", "card-2", "card-3"],
		currentIndex: 0,
		startTime: 1000,
		repeatQueue: [],
		history: [],
		answerEvents: [],
		...overrides,
	};
}

function makeScheduler(repeatInSession = false): StudyCardScheduler {
	return {
		rateStudyCard: vi.fn((card) => ({
			fsrsCard: {
				...card,
				reps: card.reps + 1,
				state: State.Review,
			},
			repeatInSession,
		})),
	};
}

describe("createStudySession", () => {
	it("selects new cards before due review cards and applies the study order", () => {
		const cards = [
			makeCard("new-1", State.New, new Date("2026-07-03T00:00:00.000Z"), 0),
			makeCard("new-2", State.New, new Date("2026-07-03T00:00:00.000Z"), 1),
			makeCard("new-3", State.New, new Date("2026-07-03T00:00:00.000Z"), 2),
			makeCard("due-1", State.Review, new Date("2026-07-01T00:00:00.000Z"), 3),
			makeCard("later", State.Review, new Date("2026-08-01T00:00:00.000Z"), 4),
		];

		const sequential = createStudySession({
			deckId: "notes/deck.md",
			cards,
			settings: {
				...DEFAULT_SETTINGS,
				dailyNewCards: 2,
				dailyReviewCards: 1,
				studyOrder: "sequential",
			},
			direction: "reversed",
			now: Date.parse("2026-07-03T00:00:00.000Z"),
		});
		const random = createStudySession({
			deckId: "notes/deck.md",
			cards,
			settings: {
				...DEFAULT_SETTINGS,
				dailyNewCards: 2,
				dailyReviewCards: 1,
				studyOrder: "random",
			},
			direction: "normal",
			now: Date.parse("2026-07-03T00:00:00.000Z"),
			shuffle: (ids) => [...ids].reverse(),
		});

		expect(sequential).toMatchObject({
			deckId: "notes/deck.md",
			direction: "reversed",
			cardQueue: ["new-1", "new-2", "due-1"],
			currentIndex: 0,
			startTime: Date.parse("2026-07-03T00:00:00.000Z"),
			repeatQueue: [],
			history: [],
			answerEvents: [],
		});
		expect(random?.cardQueue).toEqual(["due-1", "new-2", "new-1"]);
	});
});

describe("answerStudyCard", () => {
	it("returns a card update intent and advances the session", () => {
		const card = makeCard("card-1", State.New, new Date("2026-07-03T00:00:00.000Z"), 0);
		const scheduler = makeScheduler();

		const result = answerStudyCard({
			session: makeSession(),
			card,
			rating: 3,
			scheduler,
			now: 5000,
		});

		expect(result.type).toBe("continue");
		expect(result.cardUpdate).toMatchObject({
			deckId: "notes/deck.md",
			cardId: "card-1",
			fsrsCard: {
				reps: 1,
				state: State.Review,
			},
		});
		if (result.type !== "continue") throw new Error("Expected continue result");
		expect(result.session.currentIndex).toBe(1);
		expect(result.session.history).toEqual(["card-1"]);
		expect(result.session.answerEvents).toHaveLength(1);
		expect(result.session.answerEvents[0]).toMatchObject({
			cardId: "card-1",
			rating: 3,
			repeatInSession: false,
			answeredAt: 5000,
		});
	});

	it("queues Again cards for in-session repetition", () => {
		const card = makeCard("card-3", State.Review, new Date("2026-07-01T00:00:00.000Z"), 2);
		const scheduler = makeScheduler(true);

		const result = answerStudyCard({
			session: makeSession({
				currentIndex: 2,
				repeatQueue: ["card-1"],
				history: ["card-1", "card-2"],
			}),
			card,
			rating: 1,
			scheduler,
			now: 5000,
		});

		expect(result.type).toBe("continue");
		if (result.type !== "continue") throw new Error("Expected continue result");
		expect(result.session.cardQueue).toEqual([
			"card-1",
			"card-2",
			"card-3",
			"card-1",
			"card-3",
		]);
		expect(result.session.currentIndex).toBe(3);
		expect(result.session.repeatQueue).toEqual([]);
	});

	it("returns a completion intent without saving data itself", () => {
		const card = makeCard("card-3", State.Review, new Date("2026-07-01T00:00:00.000Z"), 2);
		const scheduler = makeScheduler();

		const result = answerStudyCard({
			session: makeSession({
				currentIndex: 2,
				history: ["card-1", "card-2"],
				answerEvents: [
					{
						cardId: "card-1",
						rating: 3,
						previousFsrsCard: createEmptyCard(),
						nextFsrsCard: createEmptyCard(),
						repeatInSession: false,
						answeredAt: 2000,
						previousCurrentIndex: 0,
						previousCardQueueLength: 3,
						previousRepeatQueue: [],
					},
					{
						cardId: "card-2",
						rating: 3,
						previousFsrsCard: createEmptyCard(),
						nextFsrsCard: createEmptyCard(),
						repeatInSession: false,
						answeredAt: 3000,
						previousCurrentIndex: 1,
						previousCardQueueLength: 3,
						previousRepeatQueue: [],
					},
				],
			}),
			card,
			rating: 4,
			scheduler,
			now: 61000,
		});

		expect(result.type).toBe("complete");
		if (result.type !== "complete") throw new Error("Expected complete result");
		expect(result.finishIntent).toEqual({
			reason: "completed",
			deckId: "notes/deck.md",
			mode: "study",
			cardCount: 3,
			duration: 60,
			incrementStudyCount: true,
		});
	});
});

describe("undoStudyAnswer", () => {
	it("restores the previous scheduling state and session position", () => {
		const previousCard = createEmptyCard();
		const nextCard = {
			...previousCard,
			reps: 1,
			state: State.Review,
		};
		const session = makeSession({
			currentIndex: 1,
			history: ["card-1"],
			answerEvents: [
				{
					cardId: "card-1",
					rating: 1,
					previousFsrsCard: previousCard,
					nextFsrsCard: nextCard,
					repeatInSession: true,
					answeredAt: 5000,
					previousCurrentIndex: 0,
					previousCardQueueLength: 3,
					previousRepeatQueue: [],
				},
			],
			repeatQueue: ["card-1"],
		});

		const result = undoStudyAnswer(session);

		expect(result).not.toBeNull();
		expect(result?.cardUpdate).toEqual({
			deckId: "notes/deck.md",
			cardId: "card-1",
			fsrsCard: previousCard,
		});
		expect(result?.session).toEqual(makeSession());
		expect(canUndoStudyAnswer(result!.session)).toBe(false);
	});
});

describe("finishStudySession", () => {
	it("records abandoned sessions only when answer events exist", () => {
		expect(finishStudySession(makeSession(), "abandoned", 5000)).toBeNull();
		expect(
			finishStudySession(
				makeSession({
					answerEvents: [
						{
							cardId: "card-1",
							rating: 3,
							previousFsrsCard: createEmptyCard(),
							nextFsrsCard: createEmptyCard(),
							repeatInSession: false,
							answeredAt: 2000,
							previousCurrentIndex: 0,
							previousCardQueueLength: 3,
							previousRepeatQueue: [],
						},
					],
				}),
				"abandoned",
				65000,
			),
		).toEqual({
			reason: "abandoned",
			deckId: "notes/deck.md",
			mode: "study",
			cardCount: 1,
			duration: 64,
			incrementStudyCount: false,
		});
	});
});

describe("study session selectors and remapping", () => {
	it("hides queue implementation behind selectors", () => {
		const session = makeSession({ currentIndex: 1 });

		expect(getCurrentStudyCardId(session)).toBe("card-2");
		expect(getStudyProgress(session)).toEqual({
			current: 2,
			total: 3,
			percent: 66.66666666666666,
			label: "2/3",
		});
	});

	it("remaps queues and answer events after card identity changes", () => {
		const eventCard = createEmptyCard();
		const remapped = remapStudySessionCards(
			makeSession({
				cardQueue: ["card-1", "card-2", "card-3"],
				currentIndex: 2,
				repeatQueue: ["card-3"],
				history: ["card-1", "card-2"],
				answerEvents: [
					{
						cardId: "card-1",
						rating: 3,
						previousFsrsCard: eventCard,
						nextFsrsCard: eventCard,
						repeatInSession: false,
						answeredAt: 2000,
						previousCurrentIndex: 0,
						previousCardQueueLength: 3,
						previousRepeatQueue: [],
					},
					{
						cardId: "card-2",
						rating: 3,
						previousFsrsCard: eventCard,
						nextFsrsCard: eventCard,
						repeatInSession: false,
						answeredAt: 3000,
						previousCurrentIndex: 1,
						previousCardQueueLength: 3,
						previousRepeatQueue: [],
					},
				],
			}),
			{
				"card-1": "card-1",
				"card-2": null,
				"card-3": "card-2",
			},
		);

		expect(remapped).toEqual(
			makeSession({
				cardQueue: ["card-1", "card-2"],
				currentIndex: 1,
				repeatQueue: ["card-2"],
				history: ["card-1"],
				answerEvents: [
					{
						cardId: "card-1",
						rating: 3,
						previousFsrsCard: eventCard,
						nextFsrsCard: eventCard,
						repeatInSession: false,
						answeredAt: 2000,
						previousCurrentIndex: 0,
						previousCardQueueLength: 3,
						previousRepeatQueue: [],
					},
				],
			}),
		);
	});
});
