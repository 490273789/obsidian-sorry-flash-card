import { describe, expect, it } from "vitest";
import {
	applyDailyNewCardsToDeckSettingsDraft,
	applyDaysToCompleteToDeckSettingsDraft,
	buildDeckSettingsSavePayload,
	calculateDaysToComplete,
	createDeckSettingsDraft,
	type DeckSettingsDraft,
} from "../deckSettingsViewModel";
import type { StudySettings } from "../../shared/types";

const globalSettings: StudySettings = {
	dailyNewCards: 20,
	dailyReviewCards: 100,
	studyOrder: "random",
	fsrsParameters: {
		requestRetention: 0.9,
		maximumInterval: 365,
	},
};

function makeDraft(overrides: Partial<DeckSettingsDraft> = {}): DeckSettingsDraft {
	return {
		useCustom: true,
		dailyNewCards: 20,
		dailyReviewCards: 100,
		studyOrder: "random",
		requestRetention: 0.9,
		maximumInterval: "365",
		daysToComplete: "5",
		...overrides,
	};
}

describe("deck settings view model", () => {
	it("creates a global-mode draft from global settings when no deck override exists", () => {
		expect(
			createDeckSettingsDraft({
				totalCards: 95,
				globalSettings,
				deckOverrides: undefined,
			}),
		).toEqual({
			useCustom: false,
			dailyNewCards: 20,
			dailyReviewCards: 100,
			studyOrder: "random",
			requestRetention: 0.9,
			maximumInterval: "365",
			daysToComplete: "5",
		});
	});

	it("creates a custom draft by overlaying deck overrides on global settings", () => {
		expect(
			createDeckSettingsDraft({
				totalCards: 100,
				globalSettings,
				deckOverrides: {
					dailyNewCards: 25,
					studyOrder: "sequential",
					fsrsParameters: {
						requestRetention: 0.85,
						maximumInterval: 730,
					},
				},
			}),
		).toEqual({
			useCustom: true,
			dailyNewCards: 25,
			dailyReviewCards: 100,
			studyOrder: "sequential",
			requestRetention: 0.85,
			maximumInterval: "730",
			daysToComplete: "4",
		});
	});

	it("keeps daily new cards and completion days in sync", () => {
		const draft = makeDraft();

		expect(applyDailyNewCardsToDeckSettingsDraft(draft, 120, 30)).toMatchObject({
			dailyNewCards: 30,
			daysToComplete: "4",
		});

		expect(applyDaysToCompleteToDeckSettingsDraft(draft, 120, "6")).toMatchObject({
			dailyNewCards: 20,
			daysToComplete: "6",
		});
	});

	it("preserves invalid completion-day input without changing daily new cards", () => {
		expect(applyDaysToCompleteToDeckSettingsDraft(makeDraft(), 120, "")).toMatchObject({
			dailyNewCards: 20,
			daysToComplete: "",
		});
	});

	it("builds null save payload when the deck should use global settings", () => {
		expect(
			buildDeckSettingsSavePayload(makeDraft({ useCustom: false }), globalSettings),
		).toBeNull();
	});

	it("builds custom save payload and falls back invalid maximum interval to global settings", () => {
		expect(
			buildDeckSettingsSavePayload(
				makeDraft({
					dailyNewCards: 12,
					dailyReviewCards: 80,
					studyOrder: "sequential",
					requestRetention: 0.88,
					maximumInterval: "12",
				}),
				globalSettings,
			),
		).toEqual({
			dailyNewCards: 12,
			dailyReviewCards: 80,
			studyOrder: "sequential",
			fsrsParameters: {
				requestRetention: 0.88,
				maximumInterval: 365,
			},
		});
	});

	it("calculates zero completion days for empty decks", () => {
		expect(calculateDaysToComplete(0, 20)).toBe(0);
	});
});
