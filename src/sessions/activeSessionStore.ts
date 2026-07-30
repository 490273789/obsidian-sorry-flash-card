import type {
	PracticeResult,
	PracticeSession,
	SessionOriginDeckSnapshot,
	SpellingResult,
	SpellingSession,
	StudySession,
} from "../shared/types";
import type {
	ContinuitySessionChange,
	ContinuitySessionStore,
} from "../identity/cardIdentityContinuity";

export type SessionEndReason = "source-change" | null;

export interface ActiveSessionSnapshot {
	studySession: StudySession | null;
	practiceSession: PracticeSession | null;
	practiceResult: PracticeResult | null;
	spellingSession: SpellingSession | null;
	spellingResult: SpellingResult | null;
	lastEndReason: SessionEndReason;
}

export interface SourceChangeEnd {
	type: "study" | "practice" | "spelling";
	originDeck: SessionOriginDeckSnapshot;
	answerEventCount: number;
	duration: number;
}

export interface CreateActiveSessionStoreOptions {
	onSourceChangeEnd?: (ending: SourceChangeEnd) => Promise<void>;
}

export interface ActiveSessionStore extends ContinuitySessionStore {
	getSnapshot(): ActiveSessionSnapshot;
	subscribe(listener: () => void): () => void;
	setStudySession(session: StudySession | null): void;
	setPracticeSession(session: PracticeSession | null): void;
	setPracticeResult(result: PracticeResult | null): void;
	setSpellingSession(session: SpellingSession | null): void;
	setSpellingResult(result: SpellingResult | null): void;
	clearEndReason(): void;
}

export function createActiveSessionStore(
	options: CreateActiveSessionStoreOptions = {},
): ActiveSessionStore {
	return new DefaultActiveSessionStore(options);
}

class DefaultActiveSessionStore implements ActiveSessionStore {
	private snapshot: ActiveSessionSnapshot = {
		studySession: null,
		practiceSession: null,
		practiceResult: null,
		spellingSession: null,
		spellingResult: null,
		lastEndReason: null,
	};
	private readonly listeners = new Set<() => void>();

	constructor(private readonly options: CreateActiveSessionStoreOptions) {}

	getSnapshot(): ActiveSessionSnapshot {
		return this.snapshot;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	setStudySession(session: StudySession | null): void {
		this.publish({ ...this.snapshot, studySession: session, lastEndReason: null });
	}

	setPracticeSession(session: PracticeSession | null): void {
		this.publish({ ...this.snapshot, practiceSession: session, lastEndReason: null });
	}

	setPracticeResult(result: PracticeResult | null): void {
		this.publish({ ...this.snapshot, practiceResult: result });
	}

	setSpellingSession(session: SpellingSession | null): void {
		this.publish({ ...this.snapshot, spellingSession: session, lastEndReason: null });
	}

	setSpellingResult(result: SpellingResult | null): void {
		this.publish({ ...this.snapshot, spellingResult: result });
	}

	clearEndReason(): void {
		if (this.snapshot.lastEndReason === null) return;
		this.publish({ ...this.snapshot, lastEndReason: null });
	}

	hasActiveSession(): boolean {
		return (
			this.snapshot.studySession !== null ||
			this.snapshot.practiceSession !== null ||
			this.snapshot.spellingSession !== null
		);
	}

	async reconcile(change: ContinuitySessionChange): Promise<void> {
		let nextStudySession = this.snapshot.studySession;
		let nextPracticeSession = this.snapshot.practiceSession;
		let nextSpellingSession = this.snapshot.spellingSession;
		let lastEndReason = this.snapshot.lastEndReason;

		if (nextStudySession) {
			const reconciled = reconcileStudySession(nextStudySession, change);
			if (reconciled) {
				nextStudySession = reconciled;
			} else {
				await this.reportSourceChangeEnd("study", nextStudySession);
				nextStudySession = null;
				lastEndReason = "source-change";
			}
		}

		if (nextPracticeSession) {
			const reconciled = reconcilePracticeSession(nextPracticeSession, change);
			if (reconciled) {
				nextPracticeSession = reconciled;
			} else {
				await this.reportSourceChangeEnd("practice", nextPracticeSession);
				nextPracticeSession = null;
				lastEndReason = "source-change";
			}
		}

		if (nextSpellingSession) {
			const reconciled = reconcileSpellingSession(nextSpellingSession, change);
			if (reconciled) {
				nextSpellingSession = reconciled;
			} else {
				await this.reportSourceChangeEnd("spelling", nextSpellingSession);
				nextSpellingSession = null;
				lastEndReason = "source-change";
			}
		}

		this.publish({
			...this.snapshot,
			studySession: nextStudySession,
			practiceSession: nextPracticeSession,
			practiceResult: nextPracticeSession ? this.snapshot.practiceResult : null,
			spellingSession: nextSpellingSession,
			spellingResult: nextSpellingSession ? this.snapshot.spellingResult : null,
			lastEndReason,
		});
	}

	private async reportSourceChangeEnd(
		type: SourceChangeEnd["type"],
		session: StudySession | PracticeSession | SpellingSession,
	): Promise<void> {
		if (!this.options.onSourceChangeEnd) return;
		const answerEventCount =
			type === "study"
				? (session as StudySession).answerEvents.length
				: type === "practice"
					? (session as PracticeSession).history.length
					: Object.keys((session as SpellingSession).firstAttempts).length;
		await this.options.onSourceChangeEnd({
			type,
			originDeck: session.originDeck ?? { id: session.deckId, name: session.deckId },
			answerEventCount,
			duration: Math.max(0, Math.floor((Date.now() - session.startTime) / 1000)),
		});
	}

	private publish(snapshot: ActiveSessionSnapshot): void {
		this.snapshot = snapshot;
		for (const listener of this.listeners) listener();
	}
}

function reconcileSpellingSession(
	session: SpellingSession,
	change: ContinuitySessionChange,
): SpellingSession | null {
	const spellableIdentities =
		change.spellableIdentitiesByDeck?.get(session.deckId) ?? change.availableIdentities;
	const selectedCardIds = session.selectedCardIds.filter((identity) =>
		spellableIdentities.has(identity),
	);
	const cardQueue = session.cardQueue.filter((identity) => spellableIdentities.has(identity));
	if (selectedCardIds.length === 0 || cardQueue.length === 0) return null;
	const previousCurrentIdentity = session.cardQueue[session.currentIndex];
	const firstAttempts = Object.fromEntries(
		Object.entries(session.firstAttempts).filter(([identity]) =>
			spellableIdentities.has(identity),
		),
	);
	const unavailableIdentities = new Set([
		...change.deletedIdentities,
		...session.selectedCardIds.filter((identity) => !spellableIdentities.has(identity)),
	]);
	return {
		...session,
		selectedCardIds,
		cardQueue,
		currentIndex: reconcileSpellingCurrentIndex(
			session.cardQueue,
			session.currentIndex,
			cardQueue,
		),
		phase:
			previousCurrentIdentity && spellableIdentities.has(previousCurrentIdentity)
				? session.phase
				: "retrieval",
		firstAttempts,
		completedCardIds: session.completedCardIds.filter((identity) =>
			spellableIdentities.has(identity),
		),
		unavailableCardIds: mergeUnavailableIdentities(
			session.unavailableCardIds,
			unavailableIdentities,
		),
	};
}

function reconcileSpellingCurrentIndex(
	previousQueue: string[],
	previousIndex: number,
	nextQueue: string[],
): number {
	const currentIdentity = previousQueue[previousIndex];
	if (currentIdentity) {
		const occurrence = previousQueue
			.slice(0, previousIndex + 1)
			.filter((identity) => identity === currentIdentity).length;
		let seen = 0;
		for (let index = 0; index < nextQueue.length; index++) {
			if (nextQueue[index] !== currentIdentity) continue;
			seen++;
			if (seen === occurrence) return index;
		}
	}
	const survivingBefore = previousQueue
		.slice(0, previousIndex)
		.filter((identity) => nextQueue.includes(identity)).length;
	return Math.min(survivingBefore, nextQueue.length - 1);
}

function reconcileStudySession(
	session: StudySession,
	change: ContinuitySessionChange,
): StudySession | null {
	const cardQueue = session.cardQueue.filter((identity) =>
		change.availableIdentities.has(identity),
	);
	if (cardQueue.length === 0) return null;
	return {
		...session,
		cardQueue,
		currentIndex: reconcileCurrentIndex(session.cardQueue, session.currentIndex, cardQueue),
		repeatQueue: session.repeatQueue.filter((identity) =>
			change.availableIdentities.has(identity),
		),
		unavailableCardIds: mergeUnavailableIdentities(
			session.unavailableCardIds,
			change.deletedIdentities,
		),
	};
}

function reconcilePracticeSession(
	session: PracticeSession,
	change: ContinuitySessionChange,
): PracticeSession | null {
	const cardQueue = session.cardQueue.filter((identity) =>
		change.availableIdentities.has(identity),
	);
	if (cardQueue.length === 0) return null;
	const deletedUnanswered = Array.from(change.deletedIdentities).filter(
		(identity) => session.answers[identity] === undefined,
	).length;
	return {
		...session,
		cardQueue,
		currentIndex: reconcileCurrentIndex(session.cardQueue, session.currentIndex, cardQueue),
		totalQuestions: Math.max(
			session.history.length,
			session.totalQuestions - deletedUnanswered,
		),
		unavailableCardIds: mergeUnavailableIdentities(
			session.unavailableCardIds,
			change.deletedIdentities,
		),
	};
}

function reconcileCurrentIndex(
	previousQueue: string[],
	previousIndex: number,
	nextQueue: string[],
): number {
	const currentIdentity = previousQueue[previousIndex];
	if (currentIdentity) {
		const currentNextIndex = nextQueue.indexOf(currentIdentity);
		if (currentNextIndex !== -1) return currentNextIndex;
	}
	const survivingBefore = previousQueue
		.slice(0, previousIndex)
		.filter((identity) => nextQueue.includes(identity)).length;
	return Math.min(survivingBefore, nextQueue.length - 1);
}

function mergeUnavailableIdentities(
	current: string[] | undefined,
	deleted: ReadonlySet<string>,
): string[] {
	return Array.from(new Set([...(current ?? []), ...deleted]));
}
