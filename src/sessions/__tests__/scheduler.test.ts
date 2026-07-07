import { createEmptyCard, Rating, State } from "ts-fsrs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FSRSScheduler, getRatingButtons, toFSRSRating } from "../scheduler";
import { DEFAULT_SETTINGS } from "../../shared/types";

function makeScheduler(): FSRSScheduler {
	return new FSRSScheduler(DEFAULT_SETTINGS);
}

describe("toFSRSRating", () => {
	it("maps UI rating numbers to FSRS ratings", () => {
		expect(toFSRSRating(1)).toBe(Rating.Again);
		expect(toFSRSRating(2)).toBe(Rating.Hard);
		expect(toFSRSRating(3)).toBe(Rating.Good);
		expect(toFSRSRating(4)).toBe(Rating.Easy);
	});
});

describe("FSRSScheduler", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("creates new cards and reports new/due state", () => {
		const scheduler = makeScheduler();
		const card = scheduler.createNewCard();

		expect(scheduler.isNew(card)).toBe(true);
		expect(scheduler.getState(card)).toBe(State.New);
		expect(scheduler.isDue({ ...card, due: new Date("2000-01-01T00:00:00.000Z") })).toBe(true);
		expect(scheduler.isDue({ ...card, due: new Date("2999-01-01T00:00:00.000Z") })).toBe(false);
	});

	it("marks Again ratings for in-session repetition", () => {
		const scheduler = makeScheduler();
		const card = createEmptyCard();

		const again = scheduler.rateCard(card, Rating.Again);
		const good = scheduler.rateCard(card, Rating.Good);

		expect(again.repeatInSession).toBe(true);
		expect(again.card.reps).toBe(card.reps + 1);
		expect(good.repeatInSession).toBe(false);
		expect(good.card.reps).toBe(card.reps + 1);
	});

	it("schedules custom garbage ratings exactly 21 days later", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-03T00:00:00.000Z"));
		const scheduler = makeScheduler();
		const card = createEmptyCard();

		const rated = scheduler.rateAsGarbage(card);

		expect(rated.scheduled_days).toBe(21);
		expect(rated.due.toISOString()).toBe("2026-07-24T00:00:00.000Z");
		expect(rated.last_review?.toISOString()).toBe("2026-07-03T00:00:00.000Z");
		expect(rated.reps).toBe(card.reps + 1);
		expect(rated.state).toBe(State.Review);
		expect(rated.learning_steps).toBe(0);
	});

	it("returns localized rating button configuration through scheduler facade", () => {
		expect(getRatingButtons("en").map((button) => button.label)).toEqual([
			"Again",
			"Hard",
			"Good",
			"Easy",
			"Trash",
		]);
	});
});
