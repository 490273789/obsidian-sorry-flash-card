import { describe, expect, it } from "vitest";
import {
	planDayPracticeSession,
	planIncorrectPracticeSession,
	planRangePracticeSession,
	planRandomPracticeSession,
} from "../practiceSessionPlanner";
import type { FlashCard } from "../../shared/types";

function makeCard(id: string, indexInFile: number): FlashCard {
	return {
		id,
		front: `front ${indexInFile}`,
		back: `back ${indexInFile}`,
		fsrsCard: {
			due: new Date("2026-07-03T00:00:00.000Z"),
			stability: 0,
			difficulty: 0,
			elapsed_days: 0,
			scheduled_days: 0,
			reps: 0,
			lapses: 0,
			state: 0,
			last_review: undefined,
			learning_steps: 0,
		},
		sourceFile: "notes/deck.md",
		indexInFile,
	};
}

describe("practice session planner", () => {
	it("plans study-day practice in supplied card order", () => {
		const plan = planDayPracticeSession({
			deckId: "notes/deck.md",
			direction: "normal",
			cards: [makeCard("card-1", 0), makeCard("card-2", 1), makeCard("card-3", 2)],
			studyOrder: "sequential",
			shuffle: (ids) => [...ids].reverse(),
		});

		expect(plan).toEqual({
			source: "study-day",
			deckId: "notes/deck.md",
			direction: "normal",
			cardIds: ["card-1", "card-2", "card-3"],
			studyOrder: "sequential",
		});
	});

	it("plans randomized study-day practice with injected shuffle", () => {
		const plan = planDayPracticeSession({
			deckId: "notes/deck.md",
			direction: "reversed",
			cards: [makeCard("card-1", 0), makeCard("card-2", 1), makeCard("card-3", 2)],
			studyOrder: "random",
			shuffle: (ids) => [...ids].reverse(),
		});

		expect(plan).toEqual({
			source: "study-day",
			deckId: "notes/deck.md",
			direction: "reversed",
			cardIds: ["card-3", "card-2", "card-1"],
			studyOrder: "random",
		});
	});

	it("plans random practice by shuffling and limiting supplied cards", () => {
		const plan = planRandomPracticeSession({
			deckId: "notes/deck.md",
			direction: "normal",
			cards: [
				makeCard("card-1", 0),
				makeCard("card-2", 1),
				makeCard("card-3", 2),
				makeCard("card-4", 3),
			],
			questionCount: 2,
			shuffle: (ids) => [...ids].reverse(),
		});

		expect(plan).toEqual({
			source: "random",
			deckId: "notes/deck.md",
			direction: "normal",
			cardIds: ["card-4", "card-3"],
			requestedQuestionCount: 2,
		});
	});

	it("normalizes negative random practice counts to an empty plan", () => {
		const plan = planRandomPracticeSession({
			deckId: "notes/deck.md",
			direction: "normal",
			cards: [makeCard("card-1", 0), makeCard("card-2", 1)],
			questionCount: -3,
			shuffle: (ids) => [...ids].reverse(),
		});

		expect(plan).toEqual({
			source: "random",
			deckId: "notes/deck.md",
			direction: "normal",
			cardIds: [],
			requestedQuestionCount: -3,
		});
	});

	it("plans range practice from 1-based inclusive indexes before shuffling", () => {
		const plan = planRangePracticeSession({
			deckId: "notes/deck.md",
			direction: "normal",
			cards: [
				makeCard("card-1", 0),
				makeCard("card-2", 1),
				makeCard("card-3", 2),
				makeCard("card-4", 3),
				makeCard("card-5", 4),
			],
			startIndex: 2,
			endIndex: 4,
			shuffle: (ids) => [...ids].reverse(),
		});

		expect(plan).toEqual({
			source: "range",
			deckId: "notes/deck.md",
			direction: "normal",
			cardIds: ["card-4", "card-3", "card-2"],
			requestedCardRange: {
				startIndex: 2,
				endIndex: 4,
			},
		});
	});

	it("clamps range practice to available cards", () => {
		const plan = planRangePracticeSession({
			deckId: "notes/deck.md",
			direction: "reversed",
			cards: [makeCard("card-1", 0), makeCard("card-2", 1), makeCard("card-3", 2)],
			startIndex: 0,
			endIndex: 99,
			shuffle: (ids) => [...ids],
		});

		expect(plan.cardIds).toEqual(["card-1", "card-2", "card-3"]);
		expect(plan.requestedCardRange).toEqual({
			startIndex: 0,
			endIndex: 99,
		});
	});

	it("returns an empty range practice plan when the normalized range is invalid", () => {
		const plan = planRangePracticeSession({
			deckId: "notes/deck.md",
			direction: "normal",
			cards: [makeCard("card-1", 0), makeCard("card-2", 1)],
			startIndex: 3,
			endIndex: 1,
			shuffle: (ids) => [...ids].reverse(),
		});

		expect(plan.cardIds).toEqual([]);
		expect(plan.requestedCardRange).toEqual({
			startIndex: 3,
			endIndex: 1,
		});
	});

	it("plans incorrect-card retries without deduplicating supplied identities", () => {
		const plan = planIncorrectPracticeSession({
			deckId: "notes/deck.md",
			direction: "reversed",
			cardIds: ["card-1", "card-2", "card-3", "card-1"],
			shuffle: (ids) => [...ids].reverse(),
		});

		expect(plan).toEqual({
			source: "incorrect-retry",
			deckId: "notes/deck.md",
			direction: "reversed",
			cardIds: ["card-1", "card-3", "card-2", "card-1"],
		});
	});

	it("does not mutate supplied incorrect-card identities when shuffling", () => {
		const cardIds = ["card-1", "card-2", "card-3"];
		const plan = planIncorrectPracticeSession({
			deckId: "notes/deck.md",
			direction: "normal",
			cardIds,
			shuffle: (ids) => ids.reverse(),
		});

		expect(cardIds).toEqual(["card-1", "card-2", "card-3"]);
		expect(plan.cardIds).toEqual(["card-3", "card-2", "card-1"]);
	});
});
