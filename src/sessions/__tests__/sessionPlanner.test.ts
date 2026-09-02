import { describe, expect, it } from "vitest";
import { State } from "ts-fsrs";
import type { Deck, FlashCard, StudySettings } from "../../shared/types";
import {
	getDayList,
	getTodayStudyCounts,
	getCardsForDay,
	getStudySetupPlan,
	getPracticeSetupPlan,
	getSpellingSetupPlan,
	sortDeckCards,
} from "../sessionPlanner";

function makeCard(
	id: string,
	state: State = State.New,
	due: Date = new Date("2026-08-01T00:00:00.000Z"),
	indexInFile: number = 0,
	front = "Front",
	back = "Back",
): FlashCard {
	return {
		id,
		front,
		back,
		fsrsCard: {
			due,
			stability: 1,
			difficulty: 1,
			elapsed_days: 0,
			scheduled_days: 0,
			reps: 0,
			lapses: 0,
			state,
			learning_steps: 0,
		},
		sourceFile: "notes/deck.md",
		indexInFile,
	};
}

function makeDeck(cards: FlashCard[]): Deck {
	return {
		id: "notes/deck.md",
		name: "deck",
		filePath: "notes/deck.md",
		tag: "#flashcards",
		cards,
		studyCount: 0,
		lastStudied: null,
	};
}

const defaultSettings: StudySettings = {
	dailyNewCards: 2,
	dailyReviewCards: 5,
	studyOrder: "sequential",
	fsrsParameters: {
		requestRetention: 0.9,
		maximumInterval: 36500,
	},
};

describe("SessionPlanner", () => {
	describe("sortDeckCards", () => {
		it("sorts cards by indexInFile stably", () => {
			const cards = [
				makeCard("c3", State.New, new Date(), 3),
				makeCard("c1", State.New, new Date(), 1),
				makeCard("c2", State.New, new Date(), 2),
			];
			const sorted = sortDeckCards(cards);
			expect(sorted.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
		});
	});

	describe("getDayList", () => {
		it("returns empty array for empty deck", () => {
			const deck = makeDeck([]);
			expect(getDayList(deck, 10)).toEqual([]);
		});

		it("partitions cards into day slices with completed, current, locked states", () => {
			const cards = [
				makeCard("c0", State.Review, new Date(), 0), // Day 0
				makeCard("c1", State.Review, new Date(), 1), // Day 0 -> completed
				makeCard("c2", State.New, new Date(), 2), // Day 1
				makeCard("c3", State.Review, new Date(), 3), // Day 1 -> current
				makeCard("c4", State.New, new Date(), 4), // Day 2 -> locked
			];
			const deck = makeDeck(cards);
			const dayList = getDayList(deck, 2);

			expect(dayList).toHaveLength(3);

			// Day 0 (cards 0-2): all studied -> isCompleted
			expect(dayList[0]).toMatchObject({
				dayIndex: 0,
				startCardIndex: 0,
				endCardIndex: 2,
				totalCards: 2,
				studiedCards: 2,
				isCompleted: true,
				isCurrent: false,
				isLocked: false,
			});

			// Day 1 (cards 2-4): partially studied -> isCurrent
			expect(dayList[1]).toMatchObject({
				dayIndex: 1,
				startCardIndex: 2,
				endCardIndex: 4,
				totalCards: 2,
				studiedCards: 1,
				isCompleted: false,
				isCurrent: true,
				isLocked: false,
			});

			// Day 2 (cards 4-5): unstudied -> isLocked
			expect(dayList[2]).toMatchObject({
				dayIndex: 2,
				startCardIndex: 4,
				endCardIndex: 5,
				totalCards: 1,
				studiedCards: 0,
				isCompleted: false,
				isCurrent: false,
				isLocked: true,
			});
		});

		it("handles first day as current when nothing is studied", () => {
			const cards = [
				makeCard("c0", State.New, new Date(), 0),
				makeCard("c1", State.New, new Date(), 1),
			];
			const deck = makeDeck(cards);
			const dayList = getDayList(deck, 2);

			expect(dayList[0]?.isCurrent).toBe(true);
			expect(dayList[0]?.isCompleted).toBe(false);
			expect(dayList[0]?.isLocked).toBe(false);
		});

		it("handles dailyNewCards being 0 or negative safely", () => {
			const cards = [makeCard("c0", State.New, new Date(), 0)];
			const deck = makeDeck(cards);
			const dayList = getDayList(deck, 0);
			expect(dayList).toHaveLength(1);
			expect(dayList[0]?.totalCards).toBe(1);
		});
	});

	describe("getTodayStudyCounts", () => {
		it("clamps new and review cards by daily limits", () => {
			const now = new Date("2026-08-02T12:00:00.000Z");
			const overdue = new Date("2026-08-01T12:00:00.000Z");
			const future = new Date("2026-08-03T12:00:00.000Z");

			const cards = [
				makeCard("n1", State.New, overdue, 0),
				makeCard("n2", State.New, overdue, 1),
				makeCard("n3", State.New, overdue, 2),
				makeCard("r1", State.Review, overdue, 3),
				makeCard("r2", State.Review, overdue, 4),
				makeCard("r3", State.Review, future, 5), // Not due
				makeCard("l1", State.Learning, overdue, 6),
			];
			const deck = makeDeck(cards);

			// dailyNewCards: 2, dailyReviewCards: 1
			const counts = getTodayStudyCounts(
				deck,
				{ dailyNewCards: 2, dailyReviewCards: 1 },
				now,
			);

			// 3 new cards in deck -> clamped to 2
			expect(counts.newCount).toBe(2);
			// 2 due review/learning cards (r1, l1) -> clamped to 1
			expect(counts.reviewCount).toBe(1);
		});
	});

	describe("getCardsForDay", () => {
		it("returns slice of sorted cards for specified day index", () => {
			const cards = [
				makeCard("c3", State.New, new Date(), 3),
				makeCard("c1", State.New, new Date(), 1),
				makeCard("c0", State.New, new Date(), 0),
				makeCard("c2", State.New, new Date(), 2),
			];
			const deck = makeDeck(cards);

			// dailyNewCards = 2
			const day0 = getCardsForDay(deck, 0, 2);
			expect(day0.map((c) => c.id)).toEqual(["c0", "c1"]);

			const day1 = getCardsForDay(deck, 1, 2);
			expect(day1.map((c) => c.id)).toEqual(["c2", "c3"]);

			const day2 = getCardsForDay(deck, 2, 2);
			expect(day2).toEqual([]);
		});

		it("returns empty array for negative dayIndex", () => {
			const deck = makeDeck([makeCard("c0", State.New, new Date(), 0)]);
			expect(getCardsForDay(deck, -1, 2)).toEqual([]);
		});
	});

	describe("getStudySetupPlan", () => {
		it("creates a complete immutable study setup plan", () => {
			const now = new Date("2026-08-02T12:00:00.000Z");
			const overdue = new Date("2026-08-01T12:00:00.000Z");

			const cards = [
				makeCard("c0", State.Review, overdue, 0),
				makeCard("c1", State.Review, overdue, 1),
			];
			const deck = makeDeck(cards);

			const plan = getStudySetupPlan(deck, defaultSettings, now, "random");

			expect(plan.allCompleted).toBe(true);
			expect(plan.completedDays).toBe(1);
			expect(plan.todayNewCount).toBe(0);
			expect(plan.todayReviewCount).toBe(2);
			expect(plan.todayTotal).toBe(2);
			expect(plan.hasAnythingToStudy).toBe(true);
			expect(plan.defaultStudyOrder).toBe("random");
		});
	});

	describe("getPracticeSetupPlan", () => {
		it("normalizes initial selection for practice setup", () => {
			const cards = [
				makeCard("c0", State.New, new Date(), 0),
				makeCard("c1", State.New, new Date(), 1),
				makeCard("c2", State.New, new Date(), 2),
			];
			const deck = makeDeck(cards);

			const randomPlan = getPracticeSetupPlan(deck, { kind: "random", questionCount: 10 });
			expect(randomPlan.maxQuestions).toBe(3);
			expect(randomPlan.initialQuestionCount).toBe(3);
			expect(randomPlan.initialSelectionMode).toBe("random");

			const rangePlan = getPracticeSetupPlan(deck, {
				kind: "range",
				startIndex: 2,
				endIndex: 5,
			});
			expect(rangePlan.initialRangeStart).toBe(2);
			expect(rangePlan.initialRangeEnd).toBe(3);
			expect(rangePlan.initialSelectionMode).toBe("range");
		});
	});

	describe("getSpellingSetupPlan", () => {
		it("derives spelling stats and clamps range", () => {
			const cards = [
				makeCard("c0", State.New, new Date(), 0, "apple", "苹果"),
				makeCard("c1", State.New, new Date(), 1, "banana", "香蕉"),
			];
			const deck = makeDeck(cards);
			const progress = {
				c0: { attempts: 1, correctAttempts: 1, correctStreak: 1, lastAttemptAt: 1000 },
			};

			const plan = getSpellingSetupPlan(deck, progress);
			expect(plan.stats.total).toBe(2);
			expect(plan.stats.unpracticed).toBe(1);
			expect(plan.maxQuestions).toBe(2);
			expect(plan.initialSelectionMode).toBe("smart");
		});
	});
});
