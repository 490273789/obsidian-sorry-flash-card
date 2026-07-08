import type { StudySettings } from "../shared/types";

export interface DeckSettingsDraft {
	useCustom: boolean;
	dailyNewCards: number;
	dailyReviewCards: number;
	studyOrder: StudySettings["studyOrder"];
	requestRetention: number;
	maximumInterval: string;
	daysToComplete: string;
}

export interface CreateDeckSettingsDraftInput {
	totalCards: number;
	globalSettings: StudySettings;
	deckOverrides: Partial<StudySettings> | undefined;
}

export function createDeckSettingsDraft({
	totalCards,
	globalSettings,
	deckOverrides,
}: CreateDeckSettingsDraftInput): DeckSettingsDraft {
	const dailyNewCards = deckOverrides?.dailyNewCards ?? globalSettings.dailyNewCards;

	return {
		useCustom: deckOverrides !== undefined,
		dailyNewCards,
		dailyReviewCards: deckOverrides?.dailyReviewCards ?? globalSettings.dailyReviewCards,
		studyOrder: deckOverrides?.studyOrder ?? globalSettings.studyOrder,
		requestRetention:
			deckOverrides?.fsrsParameters?.requestRetention ??
			globalSettings.fsrsParameters.requestRetention,
		maximumInterval: String(
			deckOverrides?.fsrsParameters?.maximumInterval ??
				globalSettings.fsrsParameters.maximumInterval,
		),
		daysToComplete: String(calculateDaysToComplete(totalCards, dailyNewCards)),
	};
}

export function calculateDaysToComplete(totalCards: number, dailyNewCards: number): number {
	if (totalCards <= 0) {
		return 0;
	}
	return Math.ceil(totalCards / dailyNewCards);
}

export function applyDailyNewCardsToDeckSettingsDraft(
	draft: DeckSettingsDraft,
	totalCards: number,
	dailyNewCards: number,
): DeckSettingsDraft {
	return {
		...draft,
		dailyNewCards,
		daysToComplete: String(calculateDaysToComplete(totalCards, dailyNewCards)),
	};
}

export function applyDaysToCompleteToDeckSettingsDraft(
	draft: DeckSettingsDraft,
	totalCards: number,
	daysToComplete: string,
): DeckSettingsDraft {
	const days = parseInt(daysToComplete, 10);
	if (Number.isNaN(days) || days < 1 || totalCards <= 0) {
		return {
			...draft,
			daysToComplete,
		};
	}

	const dailyNewCards = Math.max(1, Math.min(200, Math.ceil(totalCards / days)));
	return {
		...draft,
		daysToComplete,
		dailyNewCards,
	};
}

export function buildDeckSettingsSavePayload(
	draft: DeckSettingsDraft,
	globalSettings: StudySettings,
): Partial<StudySettings> | null {
	if (!draft.useCustom) {
		return null;
	}

	const maximumInterval = parseMaximumInterval(
		draft.maximumInterval,
		globalSettings.fsrsParameters.maximumInterval,
	);

	return {
		dailyNewCards: draft.dailyNewCards,
		dailyReviewCards: draft.dailyReviewCards,
		studyOrder: draft.studyOrder,
		fsrsParameters: {
			requestRetention: draft.requestRetention,
			maximumInterval,
		},
	};
}

function parseMaximumInterval(value: string, fallback: number): number {
	const parsed = parseInt(value, 10);
	return !Number.isNaN(parsed) && parsed >= 30 ? parsed : fallback;
}
