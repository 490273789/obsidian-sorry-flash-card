import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import type { FlashCard, SpellingCardProgress } from "../../shared/types";
import {
	planIncorrectSpellingSession,
	planRangeSpellingSession,
	planSmartSpellingSession,
} from "../spellingSessionPlanner";

function card(id: string, indexInFile: number): FlashCard {
	return {
		id,
		front: id,
		back: `meaning ${id}`,
		fsrsCard: createEmptyCard(),
		sourceFile: "deck.md",
		indexInFile,
	};
}

describe("spelling session planner", () => {
	it("prioritizes last-wrong, unseen, then weaker and older cards", () => {
		const cards = ["wrong", "new", "weak", "strong"].map(card);
		const progress: Record<string, SpellingCardProgress> = {
			wrong: {
				attempts: 2,
				correctAttempts: 1,
				correctStreak: 0,
				lastAttemptAt: 40,
				lastIncorrectAt: 40,
			},
			weak: {
				attempts: 4,
				correctAttempts: 2,
				correctStreak: 1,
				lastAttemptAt: 20,
			},
			strong: {
				attempts: 4,
				correctAttempts: 4,
				correctStreak: 3,
				lastAttemptAt: 10,
			},
		};

		const plan = planSmartSpellingSession({
			deckId: "deck.md",
			cards,
			progress,
			questionCount: 4,
			random: () => 0,
		});

		expect(plan.cardIds).toEqual(["wrong", "new", "weak", "strong"]);
	});

	it("normalizes ranges, shuffles, and deduplicates retry cards", () => {
		const cards = ["one", "two", "three"].map(card);
		expect(
			planRangeSpellingSession({
				deckId: "deck.md",
				cards,
				startIndex: 2,
				endIndex: 3,
				shuffle: (ids) => ids.reverse(),
			}).cardIds,
		).toEqual(["three", "two"]);
		expect(
			planIncorrectSpellingSession({
				deckId: "deck.md",
				cardIds: ["one", "one", "two"],
				shuffle: (ids) => ids,
			}).cardIds,
		).toEqual(["one", "two"]);
	});
});
