import type { StudyHistoryEntry } from "../shared/types";

export const MAX_STUDY_HISTORY_DAYS = 20;

/**
 * Format a Date into local calendar key "YYYY-MM-DD".
 */
export function formatLocalDateKey(date: Date): string {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

/**
 * Prune history to at most `maxDays` distinct calendar days (keeping the latest days).
 * Returns a new array without mutating the input.
 */
export function pruneStudyHistory(
	history: readonly StudyHistoryEntry[],
	maxDays = MAX_STUDY_HISTORY_DAYS,
): StudyHistoryEntry[] {
	const days = [...new Set(history.map((entry) => entry.date))].sort().reverse();
	if (days.length <= maxDays) {
		return [...history];
	}
	const keep = new Set(days.slice(0, maxDays));
	return history.filter((entry) => keep.has(entry.date));
}
