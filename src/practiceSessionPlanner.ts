import type { CardDirection, FlashCard, StudySettings } from "./types";
import { shuffleArray } from "./utils";

export type PracticeSessionPlanSource = "study-day" | "random" | "incorrect-retry";

export type ShuffleCardIds = (cardIds: string[]) => string[];

export interface PracticeSessionPlan {
	source: PracticeSessionPlanSource;
	deckId: string;
	direction: CardDirection;
	cardIds: string[];
	requestedQuestionCount?: number;
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
