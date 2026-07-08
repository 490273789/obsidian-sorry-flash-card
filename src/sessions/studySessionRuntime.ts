import type { Card } from "ts-fsrs";
import type {
	CardIdMap,
	Deck,
	FlashCard,
	StudyHistoryEntry,
	StudyRating,
	StudySession,
} from "../shared/types";
import {
	answerStudyCard,
	finishStudySession,
	getCurrentStudyCardId,
	remapStudySessionCards,
	undoStudyAnswer,
	type StudyCardScheduler,
	type StudySessionFinishIntent,
	type StudySessionFinishReason,
} from "./studySessionEngine";

export interface StudySessionRuntimeStore extends StudyCardScheduler {
	getDeck(id: string): Deck | undefined;
	getCard(deckId: string, cardId: string): FlashCard | undefined;
	updateCard(deckId: string, cardId: string, updatedCard: Card): Promise<void>;
	incrementStudyCount(deckId: string): Promise<void>;
	recordStudySession(
		deckId: string,
		deckName: string,
		mode: StudyHistoryEntry["mode"],
		cardCount: number,
		duration: number,
	): Promise<void>;
}

export type StudyRuntimeAnswerOutcome =
	| {
			type: "continue";
			session: StudySession;
	  }
	| {
			type: "complete";
			session: StudySession;
	  };

export interface StudyRuntimeUndoOutcome {
	session: StudySession;
}

export interface StudySessionRuntime {
	getCurrentCard(session: StudySession): FlashCard | null;
	answer(
		session: StudySession,
		rating: StudyRating,
		now?: number,
	): Promise<StudyRuntimeAnswerOutcome | null>;
	undo(session: StudySession): Promise<StudyRuntimeUndoOutcome | null>;
	finish(session: StudySession, reason: StudySessionFinishReason, now?: number): Promise<void>;
	remapSessionCards(session: StudySession, idMap: CardIdMap): StudySession | null;
}

export function createStudySessionRuntime(store: StudySessionRuntimeStore): StudySessionRuntime {
	return new DataStoreStudySessionRuntime(store);
}

class DataStoreStudySessionRuntime implements StudySessionRuntime {
	constructor(private readonly store: StudySessionRuntimeStore) {}

	getCurrentCard(session: StudySession): FlashCard | null {
		const cardId = getCurrentStudyCardId(session);
		return cardId ? (this.store.getCard(session.deckId, cardId) ?? null) : null;
	}

	async answer(
		session: StudySession,
		rating: StudyRating,
		now?: number,
	): Promise<StudyRuntimeAnswerOutcome | null> {
		const card = this.getCurrentCard(session);
		if (!card) return null;

		const step = answerStudyCard({
			session,
			card,
			rating,
			scheduler: this.store,
			now,
		});
		await this.store.updateCard(
			step.cardUpdate.deckId,
			step.cardUpdate.cardId,
			step.cardUpdate.fsrsCard,
		);

		if (step.type === "complete") {
			await this.persistFinishIntent(step.finishIntent);
			return {
				type: "complete",
				session: step.session,
			};
		}

		return {
			type: "continue",
			session: step.session,
		};
	}

	async undo(session: StudySession): Promise<StudyRuntimeUndoOutcome | null> {
		const step = undoStudyAnswer(session);
		if (!step) return null;

		await this.store.updateCard(
			step.cardUpdate.deckId,
			step.cardUpdate.cardId,
			step.cardUpdate.fsrsCard,
		);

		return {
			session: step.session,
		};
	}

	async finish(
		session: StudySession,
		reason: StudySessionFinishReason,
		now?: number,
	): Promise<void> {
		const intent = finishStudySession(session, reason, now);
		if (!intent) return;

		await this.persistFinishIntent(intent);
	}

	remapSessionCards(session: StudySession, idMap: CardIdMap): StudySession | null {
		return remapStudySessionCards(session, idMap);
	}

	private async persistFinishIntent(intent: StudySessionFinishIntent): Promise<void> {
		const deck = this.store.getDeck(intent.deckId);
		if (intent.incrementStudyCount) {
			await this.store.incrementStudyCount(intent.deckId);
		}
		await this.store.recordStudySession(
			intent.deckId,
			deck?.name ?? intent.deckId,
			intent.mode,
			intent.cardCount,
			intent.duration,
		);
	}
}
