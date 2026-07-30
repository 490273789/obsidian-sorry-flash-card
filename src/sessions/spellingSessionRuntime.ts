import {
	buildSpellingDiff,
	extractSpellingWord,
	getSpellingWord,
	isSpellingAnswerCorrect,
	type SpellingDiffSegment,
} from "../cards/spellingWord";
import type {
	Deck,
	FlashCard,
	SpellingCardProgress,
	SpellingResult,
	SpellingSession,
	StudyHistoryEntry,
} from "../shared/types";
import {
	planIncorrectSpellingSession,
	planRangeSpellingSession,
	planSmartSpellingSession,
} from "./spellingSessionPlanner";
import {
	answerSpellingCard,
	createSpellingSession,
	getCurrentSpellingCardId,
	type SpellingAnswerFeedback,
} from "./spellingSessionEngine";
import { shuffleArray } from "../shared/utils";

export type SpellingSessionStartOptions =
	| { mode: "smart"; questionCount: number }
	| { mode: "range"; startIndex: number; endIndex: number };

export interface SpellingDeckProgressStats {
	total: number;
	unpracticed: number;
	reinforcement: number;
	stable: number;
}

export interface SpellingSessionRuntimeStore {
	getDeck(id: string): Deck | undefined;
	getCard(deckId: string, cardId: string): FlashCard | undefined;
	getCardsForDay(deckId: string, dayIndex: number): FlashCard[];
	getSpellingProgress(): Record<string, SpellingCardProgress>;
	recordSpellingAttempt(cardId: string, correct: boolean, attemptedAt: number): Promise<void>;
	recordStudySession(
		deckId: string,
		deckName: string,
		mode: StudyHistoryEntry["mode"],
		cardCount: number,
		duration: number,
	): Promise<void>;
}

export type SpellingRuntimeAnswerOutcome =
	| {
			type: "continue";
			session: SpellingSession;
			feedback: SpellingAnswerFeedback;
			answer: string;
			diff: SpellingDiffSegment[];
	  }
	| {
			type: "complete";
			result: SpellingResult;
			feedback: "retrieval-correct";
			answer: string;
			diff: SpellingDiffSegment[];
	  };

export interface SpellingSessionRuntime {
	createSession(
		deckId: string,
		options: SpellingSessionStartOptions,
		now?: number,
	): SpellingSession | null;
	createDaySession(deckId: string, dayIndex: number, now?: number): SpellingSession | null;
	createIncorrectSession(
		session: SpellingSession,
		result: SpellingResult,
		now?: number,
	): SpellingSession | null;
	getCurrentCard(session: SpellingSession): FlashCard | null;
	getCards(deckId: string, cardIds: readonly string[]): FlashCard[];
	getDeckProgressStats(deckId: string): SpellingDeckProgressStats;
	answer(
		session: SpellingSession,
		input: string,
		now?: number,
	): Promise<SpellingRuntimeAnswerOutcome | null>;
	finish(session: SpellingSession, now?: number): Promise<void>;
}

export function createSpellingSessionRuntime(
	store: SpellingSessionRuntimeStore,
): SpellingSessionRuntime {
	return new DataStoreSpellingSessionRuntime(store);
}

class DataStoreSpellingSessionRuntime implements SpellingSessionRuntime {
	constructor(private readonly store: SpellingSessionRuntimeStore) {}

	createSession(
		deckId: string,
		options: SpellingSessionStartOptions,
		now?: number,
	): SpellingSession | null {
		const deck = this.store.getDeck(deckId);
		if (!deck) return null;
		const eligibleCards = deck.cards.filter((card) => extractSpellingWord(card.front) !== null);
		const plan =
			options.mode === "range"
				? planRangeSpellingSession({
						deckId,
						cards: eligibleCards,
						startIndex: options.startIndex,
						endIndex: options.endIndex,
					})
				: planSmartSpellingSession({
						deckId,
						cards: eligibleCards,
						progress: this.store.getSpellingProgress(),
						questionCount: options.questionCount,
					});
		if (plan.cardIds.length === 0) return null;
		return createSpellingSession({ deckId, cardIds: plan.cardIds, startTime: now });
	}

	createDaySession(deckId: string, dayIndex: number, now?: number): SpellingSession | null {
		const cardIds = this.store
			.getCardsForDay(deckId, dayIndex)
			.filter((card) => extractSpellingWord(card.front) !== null)
			.map((card) => card.id);
		if (cardIds.length === 0) return null;
		return createSpellingSession({
			deckId,
			cardIds: shuffleArray(cardIds),
			startTime: now,
		});
	}

	createIncorrectSession(
		session: SpellingSession,
		result: SpellingResult,
		now?: number,
	): SpellingSession | null {
		if (result.incorrectCardIds.length === 0) return null;
		const plan = planIncorrectSpellingSession({
			deckId: session.deckId,
			cardIds: result.incorrectCardIds,
		});
		return createSpellingSession({
			deckId: session.deckId,
			cardIds: plan.cardIds,
			startTime: now,
		});
	}

	getCurrentCard(session: SpellingSession): FlashCard | null {
		const cardId = getCurrentSpellingCardId(session);
		return cardId ? (this.store.getCard(session.deckId, cardId) ?? null) : null;
	}

	getCards(deckId: string, cardIds: readonly string[]): FlashCard[] {
		return cardIds.flatMap((cardId) => {
			const card = this.store.getCard(deckId, cardId);
			return card ? [card] : [];
		});
	}

	getDeckProgressStats(deckId: string): SpellingDeckProgressStats {
		const deck = this.store.getDeck(deckId);
		if (!deck) return { total: 0, unpracticed: 0, reinforcement: 0, stable: 0 };
		const eligibleCards = deck.cards.filter((card) => extractSpellingWord(card.front) !== null);
		const progress = this.store.getSpellingProgress();
		let unpracticed = 0;
		let reinforcement = 0;
		let stable = 0;
		for (const card of eligibleCards) {
			const cardProgress = progress[card.id];
			if (!cardProgress || cardProgress.attempts === 0) {
				unpracticed++;
			} else if (cardProgress.correctStreak >= 2) {
				stable++;
			} else {
				reinforcement++;
			}
		}
		return { total: eligibleCards.length, unpracticed, reinforcement, stable };
	}

	async answer(
		session: SpellingSession,
		input: string,
		now: number = Date.now(),
	): Promise<SpellingRuntimeAnswerOutcome | null> {
		const card = this.getCurrentCard(session);
		if (!card) return null;
		const answer = getSpellingWord(card);
		const correct = isSpellingAnswerCorrect(input, answer);
		const step = answerSpellingCard({
			session,
			cardId: card.id,
			input,
			isCorrect: correct,
			now,
		});

		if (session.phase === "retrieval") {
			await this.store.recordSpellingAttempt(card.id, correct, now);
		}
		if (step.type === "complete") {
			await this.persistHistory(session, step.result.totalWords, step.result.timeSpent);
		}

		return {
			...step,
			answer,
			diff: buildSpellingDiff(input, answer),
		};
	}

	async finish(session: SpellingSession, now: number = Date.now()): Promise<void> {
		const attemptedWords = Object.keys(session.firstAttempts).length;
		if (attemptedWords === 0) return;
		await this.persistHistory(
			session,
			attemptedWords,
			Math.max(0, Math.floor((now - session.startTime) / 1000)),
		);
	}

	private async persistHistory(
		session: SpellingSession,
		cardCount: number,
		duration: number,
	): Promise<void> {
		const deck = this.store.getDeck(session.deckId);
		await this.store.recordStudySession(
			session.originDeck?.id ?? session.deckId,
			session.originDeck?.name ?? deck?.name ?? session.deckId,
			"spelling",
			cardCount,
			duration,
		);
	}
}
