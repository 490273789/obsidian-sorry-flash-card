import type {
	CardDirection,
	CardIdMap,
	FlashCard,
	PracticeResult,
	PracticeSession,
	StudySettings,
} from "./types";
import {
	planDayPracticeSession,
	planIncorrectPracticeSession,
	planRangePracticeSession,
	planRandomPracticeSession,
	type PracticeSessionPlan,
	type ShuffleCardIds,
} from "./practiceSessionPlanner";

export {
	answerStudyCard,
	canUndoStudyAnswer,
	createStudySession,
	finishStudySession,
	getCurrentStudyCardId,
	getStudyProgress,
	remapStudySessionCards,
	undoStudyAnswer,
} from "./studySessionEngine";
export type {
	StudyCardSchedule,
	StudyCardScheduler,
	StudyCardUpdateIntent,
	StudySessionFinishIntent,
} from "./studySessionEngine";
export {
	planDayPracticeSession,
	planIncorrectPracticeSession,
	planRangePracticeSession,
	planRandomPracticeSession,
} from "./practiceSessionPlanner";
export type {
	PracticeSessionPlan,
	PracticeSessionPlanSource,
	ShuffleCardIds,
} from "./practiceSessionPlanner";

export type PracticeSessionStep =
	| {
			type: "continue";
			session: PracticeSession;
	  }
	| {
			type: "complete";
			result: PracticeResult;
	  };

export function createPracticeSession(params: {
	deckId: string;
	direction: CardDirection;
	cardIds: string[];
	startTime: number;
}): PracticeSession {
	return {
		deckId: params.deckId,
		direction: params.direction,
		cardQueue: [...params.cardIds],
		currentIndex: 0,
		startTime: params.startTime,
		totalQuestions: params.cardIds.length,
		answers: {},
		history: [],
	};
}

export function createPracticeSessionFromPlan(params: {
	plan: PracticeSessionPlan;
	startTime: number;
}): PracticeSession {
	return createPracticeSession({
		deckId: params.plan.deckId,
		direction: params.plan.direction,
		cardIds: params.plan.cardIds,
		startTime: params.startTime,
	});
}

export function createDayPracticeSession(params: {
	deckId: string;
	direction: CardDirection;
	cards: FlashCard[];
	studyOrder: StudySettings["studyOrder"];
	startTime?: number;
	shuffle?: ShuffleCardIds;
}): PracticeSession {
	const plan = planDayPracticeSession({
		deckId: params.deckId,
		direction: params.direction,
		cards: params.cards,
		studyOrder: params.studyOrder,
		shuffle: params.shuffle,
	});

	return createPracticeSessionFromPlan({
		plan,
		startTime: params.startTime ?? Date.now(),
	});
}

export function createRandomPracticeSession(params: {
	deckId: string;
	direction: CardDirection;
	cards: FlashCard[];
	questionCount: number;
	startTime?: number;
	shuffle?: ShuffleCardIds;
}): PracticeSession {
	const plan = planRandomPracticeSession({
		deckId: params.deckId,
		direction: params.direction,
		cards: params.cards,
		questionCount: params.questionCount,
		shuffle: params.shuffle,
	});

	return createPracticeSessionFromPlan({
		plan,
		startTime: params.startTime ?? Date.now(),
	});
}

export function createRangePracticeSession(params: {
	deckId: string;
	direction: CardDirection;
	cards: FlashCard[];
	startIndex: number;
	endIndex: number;
	startTime?: number;
	shuffle?: ShuffleCardIds;
}): PracticeSession {
	const plan = planRangePracticeSession({
		deckId: params.deckId,
		direction: params.direction,
		cards: params.cards,
		startIndex: params.startIndex,
		endIndex: params.endIndex,
		shuffle: params.shuffle,
	});

	return createPracticeSessionFromPlan({
		plan,
		startTime: params.startTime ?? Date.now(),
	});
}

export function createIncorrectPracticeSession(params: {
	deckId: string;
	direction: CardDirection;
	cardIds: string[];
	startTime?: number;
	shuffle?: ShuffleCardIds;
}): PracticeSession {
	const plan = planIncorrectPracticeSession({
		deckId: params.deckId,
		direction: params.direction,
		cardIds: params.cardIds,
		shuffle: params.shuffle,
	});

	return createPracticeSessionFromPlan({
		plan,
		startTime: params.startTime ?? Date.now(),
	});
}

export function answerPracticeCard(params: {
	session: PracticeSession;
	cardId: string;
	isCorrect: boolean;
	now: number;
}): PracticeSessionStep {
	const session = normalizePracticeSession(params.session);
	const answers = {
		...session.answers,
		[params.cardId]: params.isCorrect,
	};
	const nextSession: PracticeSession = {
		...session,
		answers,
		history: [...session.history, params.cardId],
	};

	if (nextSession.currentIndex < nextSession.cardQueue.length - 1) {
		return {
			type: "continue",
			session: {
				...nextSession,
				currentIndex: nextSession.currentIndex + 1,
			},
		};
	}

	const incorrectCardIds = Object.entries(answers)
		.filter(([, correct]) => !correct)
		.map(([cardId]) => cardId);
	const correctCount = Object.values(answers).filter(Boolean).length;
	const incorrectCount = nextSession.totalQuestions - correctCount;
	const accuracy =
		nextSession.totalQuestions > 0 ? (correctCount / nextSession.totalQuestions) * 100 : 0;

	return {
		type: "complete",
		result: {
			direction: nextSession.direction,
			totalQuestions: nextSession.totalQuestions,
			correctCount,
			incorrectCount,
			accuracy,
			incorrectCardIds,
			timeSpent: Math.floor((params.now - nextSession.startTime) / 1000),
		},
	};
}

export function previousPracticeCard(session: PracticeSession): PracticeSession | null {
	if (session.currentIndex === 0) return null;

	const normalized = normalizePracticeSession(session);
	const previousIndex = normalized.currentIndex - 1;
	const previousCardId = normalized.cardQueue[previousIndex];
	const answers = { ...normalized.answers };
	if (previousCardId) {
		delete answers[previousCardId];
	}

	const history = normalized.history.slice();
	history.pop();

	return {
		...normalized,
		currentIndex: previousIndex,
		answers,
		history,
	};
}

export function remapPracticeSessionCards(
	session: PracticeSession,
	idMap: CardIdMap,
): PracticeSession | null {
	const cardQueue = remapCardIds(session.cardQueue, idMap);
	if (cardQueue.length === 0) return null;

	return {
		...session,
		cardQueue,
		currentIndex: Math.min(session.currentIndex, cardQueue.length - 1),
		totalQuestions: cardQueue.length,
		answers: remapAnswerMap(session.answers, idMap),
		history: remapCardIds(session.history, idMap),
	};
}

function normalizePracticeSession(session: PracticeSession): PracticeSession {
	return {
		...session,
		direction: session.direction === "reversed" ? "reversed" : "normal",
		cardQueue: normalizeStringArray(session.cardQueue),
		answers: normalizeAnswerMap(session.answers),
		history: normalizeStringArray(session.history),
	};
}

function normalizeStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function normalizeAnswerMap(value: unknown): Record<string, boolean> {
	if (!value || typeof value !== "object") return {};

	const answers: Record<string, boolean> = {};
	for (const [cardId, answer] of Object.entries(value)) {
		if (typeof answer === "boolean") {
			answers[cardId] = answer;
		}
	}
	return answers;
}

function remapCardIds(cardIds: string[], idMap: CardIdMap): string[] {
	return cardIds.flatMap((cardId) => {
		const nextCardId = idMap[cardId];
		if (nextCardId === null) return [];
		return [nextCardId ?? cardId];
	});
}

function remapAnswerMap(
	answers: Record<string, boolean>,
	idMap: CardIdMap,
): Record<string, boolean> {
	const nextAnswers: Record<string, boolean> = {};
	for (const [cardId, answer] of Object.entries(answers)) {
		const nextCardId = idMap[cardId];
		if (nextCardId !== null) {
			nextAnswers[nextCardId ?? cardId] = answer;
		}
	}
	return nextAnswers;
}
