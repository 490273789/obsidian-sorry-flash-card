import type {
	CardDirection,
	CardIdMap,
	Deck,
	FlashCard,
	PracticeResult,
	PracticeSession,
	StudyHistoryEntry,
	StudySettings,
} from "../shared/types";
import {
	answerPracticeCard,
	createDayPracticeSession,
	createIncorrectPracticeSession,
	createRangePracticeSession,
	createRandomPracticeSession,
	previousPracticeCard,
	remapPracticeSessionCards,
} from "./sessionEngine";

export type PracticeSessionStartOptions =
	| {
			mode: "random-count";
			questionCount: number;
			direction: CardDirection;
	  }
	| {
			mode: "range";
			startIndex: number;
			endIndex: number;
			direction: CardDirection;
	  };

export interface PracticeSessionRuntimeStore {
	getDeck(id: string): Deck | undefined;
	getCard(deckId: string, cardId: string): FlashCard | undefined;
	getCardsForDay(deckId: string, dayIndex: number): FlashCard[];
	recordStudySession(
		deckId: string,
		deckName: string,
		mode: StudyHistoryEntry["mode"],
		cardCount: number,
		duration: number,
	): Promise<void>;
}

export type PracticeRuntimeAnswerOutcome =
	| {
			type: "continue";
			session: PracticeSession;
	  }
	| {
			type: "complete";
			result: PracticeResult;
	  };

export interface PracticeSessionRuntime {
	createSession(
		deckId: string,
		options: PracticeSessionStartOptions,
		now?: number,
	): PracticeSession | null;
	createDaySession(params: {
		deckId: string;
		dayIndex: number;
		studyOrder: StudySettings["studyOrder"];
		direction: CardDirection;
		now?: number;
	}): PracticeSession | null;
	createIncorrectSession(
		session: PracticeSession,
		result: PracticeResult,
		now?: number,
	): PracticeSession | null;
	getCurrentCard(session: PracticeSession): FlashCard | null;
	getCards(deckId: string, cardIds: readonly string[]): FlashCard[];
	answer(
		session: PracticeSession,
		isCorrect: boolean,
		now?: number,
	): Promise<PracticeRuntimeAnswerOutcome | null>;
	previous(session: PracticeSession): PracticeSession | null;
	remapSessionCards(session: PracticeSession, idMap: CardIdMap): PracticeSession | null;
}

export function createPracticeSessionRuntime(
	store: PracticeSessionRuntimeStore,
): PracticeSessionRuntime {
	return new DataStorePracticeSessionRuntime(store);
}

class DataStorePracticeSessionRuntime implements PracticeSessionRuntime {
	constructor(private readonly store: PracticeSessionRuntimeStore) {}

	createSession(
		deckId: string,
		options: PracticeSessionStartOptions,
		now?: number,
	): PracticeSession | null {
		const deck = this.store.getDeck(deckId);
		if (!deck) return null;

		return options.mode === "range"
			? createRangePracticeSession({
					deckId,
					direction: options.direction,
					cards: deck.cards,
					startIndex: options.startIndex,
					endIndex: options.endIndex,
					startTime: now,
				})
			: createRandomPracticeSession({
					deckId,
					direction: options.direction,
					cards: deck.cards,
					questionCount: options.questionCount,
					startTime: now,
				});
	}

	createDaySession(params: {
		deckId: string;
		dayIndex: number;
		studyOrder: StudySettings["studyOrder"];
		direction: CardDirection;
		now?: number;
	}): PracticeSession | null {
		const cards = this.store.getCardsForDay(params.deckId, params.dayIndex);
		if (cards.length === 0) return null;

		return createDayPracticeSession({
			deckId: params.deckId,
			direction: params.direction,
			cards,
			studyOrder: params.studyOrder,
			startTime: params.now,
		});
	}

	createIncorrectSession(
		session: PracticeSession,
		result: PracticeResult,
		now?: number,
	): PracticeSession | null {
		if (result.incorrectCardIds.length === 0) return null;

		return createIncorrectPracticeSession({
			deckId: session.deckId,
			direction: session.direction,
			cardIds: result.incorrectCardIds,
			startTime: now,
		});
	}

	getCurrentCard(session: PracticeSession): FlashCard | null {
		const cardId = session.cardQueue[session.currentIndex];
		return cardId ? (this.store.getCard(session.deckId, cardId) ?? null) : null;
	}

	getCards(deckId: string, cardIds: readonly string[]): FlashCard[] {
		return cardIds.flatMap((cardId) => {
			const card = this.store.getCard(deckId, cardId);
			return card ? [card] : [];
		});
	}

	async answer(
		session: PracticeSession,
		isCorrect: boolean,
		now: number = Date.now(),
	): Promise<PracticeRuntimeAnswerOutcome | null> {
		const card = this.getCurrentCard(session);
		if (!card) return null;

		const step = answerPracticeCard({
			session,
			cardId: card.id,
			isCorrect,
			now,
		});

		if (step.type === "complete") {
			await this.persistPracticeResult(session.deckId, step.result);
		}

		return step;
	}

	previous(session: PracticeSession): PracticeSession | null {
		return previousPracticeCard(session);
	}

	remapSessionCards(session: PracticeSession, idMap: CardIdMap): PracticeSession | null {
		return remapPracticeSessionCards(session, idMap);
	}

	private async persistPracticeResult(deckId: string, result: PracticeResult): Promise<void> {
		const deck = this.store.getDeck(deckId);
		await this.store.recordStudySession(
			deckId,
			deck?.name ?? deckId,
			"practice",
			result.totalQuestions,
			result.timeSpent,
		);
	}
}
