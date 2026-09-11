import type { StudySettings } from "../../../core/shared/types";

/**
 * Bounds, steps, and defaults for study settings and FSRS parameters.
 */
export const STUDY_SETTINGS_LIMITS = {
	dailyNewCards: {
		min: 1,
		max: 200,
		step: 1,
		default: 20,
	},
	dailyReviewCards: {
		min: 1,
		max: 500,
		step: 10,
		default: 50,
	},
	requestRetention: {
		min: 0.7,
		max: 0.99,
		step: 0.01,
		default: 0.9,
	},
	maximumInterval: {
		min: 30,
		max: 3650,
		step: 1,
		default: 365,
	},
} as const;

export const STUDY_ORDER_OPTIONS: readonly StudySettings["studyOrder"][] = ["sequential", "random"];

/**
 * Estimate the number of days required to complete all new cards at the given pace.
 */
export function calculateEstimatedDays(totalCards: number, dailyNewCards: number): number {
	if (totalCards <= 0 || dailyNewCards <= 0) return 0;
	return Math.ceil(totalCards / dailyNewCards);
}

/**
 * Calculate the required daily new cards count given the total cards and desired days to complete,
 * clamped within the supported daily new cards range [1, 200].
 */
export function calculateDailyNewCardsFromDays(totalCards: number, daysToComplete: number): number {
	if (!Number.isFinite(daysToComplete) || daysToComplete < 1 || totalCards <= 0) {
		return STUDY_SETTINGS_LIMITS.dailyNewCards.min;
	}
	const computed = Math.ceil(totalCards / daysToComplete);
	return Math.max(
		STUDY_SETTINGS_LIMITS.dailyNewCards.min,
		Math.min(STUDY_SETTINGS_LIMITS.dailyNewCards.max, computed),
	);
}

/**
 * Clamps daily new cards to supported range [1, 200].
 */
export function clampDailyNewCards(value: number): number {
	if (!Number.isFinite(value)) return STUDY_SETTINGS_LIMITS.dailyNewCards.default;
	return Math.max(
		STUDY_SETTINGS_LIMITS.dailyNewCards.min,
		Math.min(STUDY_SETTINGS_LIMITS.dailyNewCards.max, Math.round(value)),
	);
}

/**
 * Clamps daily review cards to supported range [1, 500].
 */
export function clampDailyReviewCards(value: number): number {
	if (!Number.isFinite(value)) return STUDY_SETTINGS_LIMITS.dailyReviewCards.default;
	return Math.max(
		STUDY_SETTINGS_LIMITS.dailyReviewCards.min,
		Math.min(STUDY_SETTINGS_LIMITS.dailyReviewCards.max, Math.round(value)),
	);
}

/**
 * Clamps request retention to supported range [0.70, 0.99].
 */
export function clampRequestRetention(value: number): number {
	if (!Number.isFinite(value)) return STUDY_SETTINGS_LIMITS.requestRetention.default;
	return Math.max(
		STUDY_SETTINGS_LIMITS.requestRetention.min,
		Math.min(STUDY_SETTINGS_LIMITS.requestRetention.max, value),
	);
}

/**
 * Validates and clamps maximum interval to [30, 3650], falling back to fallback if invalid.
 */
export function clampMaximumInterval(
	value: number,
	fallback: number = STUDY_SETTINGS_LIMITS.maximumInterval.default,
): number {
	if (!Number.isFinite(value) || value < STUDY_SETTINGS_LIMITS.maximumInterval.min) {
		return fallback;
	}
	return Math.min(STUDY_SETTINGS_LIMITS.maximumInterval.max, Math.round(value));
}

/**
 * Parses raw input string into valid maximum interval integer, falling back if invalid.
 */
export function parseMaximumInterval(
	raw: string,
	fallback: number = STUDY_SETTINGS_LIMITS.maximumInterval.default,
): number {
	const parsed = Number.parseInt(raw, 10);
	return clampMaximumInterval(parsed, fallback);
}

/**
 * Parses unknown or string value into valid study order ("sequential" | "random").
 */
export function parseStudyOrder(value: unknown): StudySettings["studyOrder"] {
	return value === "random" ? "random" : "sequential";
}
