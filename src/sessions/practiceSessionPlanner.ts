import type { CardDirection, FlashCard, StudySettings } from "../shared/types";
import { shuffleArray } from "../shared/utils";

export type PracticeSessionPlanSource = "study-day" | "random" | "range" | "incorrect-retry";

export type ShuffleCardIds = (cardIds: string[]) => string[];

export interface PracticeSessionPlan {
	source: PracticeSessionPlanSource;
	deckId: string;
	direction: CardDirection;
	cardIds: string[];
	requestedQuestionCount?: number;
	requestedCardRange?: {
		startIndex: number;
		endIndex: number;
	};
	studyOrder?: StudySettings["studyOrder"];
}

export function planDayPracticeSession(params: {
	deckId: string;
	direction: CardDirection;
	cards: FlashCard[];
	studyOrder: StudySettings["studyOrder"];
	shuffle?: ShuffleCardIds;
}): PracticeSessionPlan {
	const cardIds = getCardIds(params.cards);

	return {
		source: "study-day",
		deckId: params.deckId,
		direction: params.direction,
		cardIds:
			params.studyOrder === "random" ? (params.shuffle ?? shuffleArray)(cardIds) : cardIds,
		studyOrder: params.studyOrder,
	};
}

export function planRandomPracticeSession(params: {
	deckId: string;
	direction: CardDirection;
	cards: FlashCard[];
	questionCount: number;
	shuffle?: ShuffleCardIds;
}): PracticeSessionPlan {
	const questionLimit = normalizeQuestionLimit(params.questionCount);
	const cardIds = (params.shuffle ?? shuffleArray)(getCardIds(params.cards)).slice(
		0,
		questionLimit,
	);

	return {
		source: "random",
		deckId: params.deckId,
		direction: params.direction,
		cardIds,
		requestedQuestionCount: params.questionCount,
	};
}

export function planRangePracticeSession(params: {
	deckId: string;
	direction: CardDirection;
	cards: FlashCard[];
	startIndex: number;
	endIndex: number;
	shuffle?: ShuffleCardIds;
}): PracticeSessionPlan {
	const range = normalizeCardRange(params.startIndex, params.endIndex, params.cards.length);
	const rangedCards = range ? params.cards.slice(range.startIndex - 1, range.endIndex) : [];
	const cardIds = (params.shuffle ?? shuffleArray)(getCardIds(rangedCards));

	return {
		source: "range",
		deckId: params.deckId,
		direction: params.direction,
		cardIds,
		requestedCardRange: {
			startIndex: params.startIndex,
			endIndex: params.endIndex,
		},
	};
}

export function planIncorrectPracticeSession(params: {
	deckId: string;
	direction: CardDirection;
	cardIds: string[];
	shuffle?: ShuffleCardIds;
}): PracticeSessionPlan {
	return {
		source: "incorrect-retry",
		deckId: params.deckId,
		direction: params.direction,
		cardIds: (params.shuffle ?? shuffleArray)([...params.cardIds]),
	};
}

function getCardIds(cards: FlashCard[]): string[] {
	return cards.map((card) => card.id);
}

function normalizeQuestionLimit(questionCount: number): number {
	if (!Number.isFinite(questionCount)) return 0;
	return Math.max(0, Math.floor(questionCount));
}

function normalizeCardRange(
	startIndex: number,
	endIndex: number,
	cardCount: number,
): { startIndex: number; endIndex: number } | null {
	if (
		!Number.isFinite(startIndex) ||
		!Number.isFinite(endIndex) ||
		!Number.isFinite(cardCount) ||
		cardCount < 1
	) {
		return null;
	}

	const normalizedStart = Math.max(1, Math.floor(startIndex));
	const normalizedEnd = Math.min(cardCount, Math.floor(endIndex));
	if (normalizedStart > normalizedEnd) return null;

	return {
		startIndex: normalizedStart,
		endIndex: normalizedEnd,
	};
}
