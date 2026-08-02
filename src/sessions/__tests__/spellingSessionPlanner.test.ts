import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import type { FlashCard, SpellingCardProgress } from "../../shared/types";
import {
	evaluateSpellingDeckEligibility,
	getSpellingDeckProgressStats,
	planIncorrectSpellingSession,
	planRangeSpellingSession,
	planSmartSpellingSession,
} from "../spellingSessionPlanner";

const STABLE_ONE = "550e8400-e29b-41d4-a716-446655440000";
const STABLE_TWO = "7d444840-9dc0-11d1-b245-5ffdce74fad2";

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
	it("derives complete deck eligibility from enablement, identity, and content", () => {
		const eligible = { ...card(STABLE_ONE, 0), front: "hello world" };
		const invalid = { ...card(STABLE_TWO, 1), front: "science / fair" };

		expect(evaluateSpellingDeckEligibility({ cards: [eligible, invalid] }, true)).toEqual({
			enabled: true,
			hasStableIdentities: true,
			canStart: true,
			valid: false,
			ready: true,
			issueCount: 1,
			eligibleCardIds: [STABLE_ONE],
			invalidCards: [
				{
					cardId: STABLE_TWO,
					indexInFile: 1,
					front: "science / fair",
				},
			],
		});

		expect(
			evaluateSpellingDeckEligibility(
				{ cards: [{ ...eligible, id: "notes/deck.md::0" }] },
				true,
			),
		).toMatchObject({
			hasStableIdentities: false,
			canStart: true,
			ready: false,
			issueCount: 1,
		});
		expect(evaluateSpellingDeckEligibility({ cards: [eligible] }, false).ready).toBe(false);
	});

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

	it("derives setup mastery buckets without a session runtime", () => {
		const cards = ["new", "weak", "stable"].map(card);
		cards.push({ ...card("ignored", 3), front: "science / fair" });
		expect(
			getSpellingDeckProgressStats(cards, {
				weak: {
					attempts: 2,
					correctAttempts: 1,
					correctStreak: 1,
					lastAttemptAt: 10,
				},
				stable: {
					attempts: 2,
					correctAttempts: 2,
					correctStreak: 2,
					lastAttemptAt: 20,
				},
			}),
		).toEqual({ total: 3, unpracticed: 1, reinforcement: 1, stable: 1 });
	});
});
