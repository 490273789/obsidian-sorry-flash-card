import type {
	CardDirection,
	CardIdMap,
	PracticeResult,
	PracticeSession,
	StudySession,
} from "./types";

export type StudySessionStep =
	| {
			type: "continue";
			session: StudySession;
	  }
	| {
			type: "complete";
	  };

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

export function answerStudyCard(params: {
	session: StudySession;
	cardId: string;
	repeatInSession: boolean;
}): StudySessionStep {
	const session = params.session;
	const nextSession: StudySession = {
		...session,
		cardQueue: [...session.cardQueue],
		repeatQueue: [...session.repeatQueue],
		history: [...session.history, params.cardId],
	};

	if (params.repeatInSession) {
		nextSession.repeatQueue.push(params.cardId);
	}

	if (nextSession.currentIndex < nextSession.cardQueue.length - 1) {
		nextSession.currentIndex++;
		return {
			type: "continue",
			session: nextSession,
		};
	}

	if (nextSession.repeatQueue.length > 0) {
		nextSession.cardQueue = [...nextSession.cardQueue, ...nextSession.repeatQueue];
		nextSession.repeatQueue = [];
		nextSession.currentIndex++;
		return {
			type: "continue",
			session: nextSession,
		};
	}

	return { type: "complete" };
}

export function previousStudyCard(session: StudySession): StudySession | null {
	if (session.history.length === 0) return null;

	const history = [...session.history];
	const previousCardId = history.pop();
	if (!previousCardId) return null;

	return {
		...session,
		history,
		cardQueue: [
			...session.cardQueue.slice(0, session.currentIndex),
			previousCardId,
			...session.cardQueue.slice(session.currentIndex),
		],
	};
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

export function remapStudySessionCards(
	session: StudySession,
	idMap: CardIdMap,
): StudySession | null {
	const cardQueue = remapCardIds(session.cardQueue, idMap);
	if (cardQueue.length === 0) return null;

	return {
		...session,
		cardQueue,
		currentIndex: Math.min(session.currentIndex, cardQueue.length - 1),
		repeatQueue: remapCardIds(session.repeatQueue, idMap),
		history: remapCardIds(session.history, idMap),
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
