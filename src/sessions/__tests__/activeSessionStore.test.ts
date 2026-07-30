import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { createActiveSessionStore, type SourceChangeEnd } from "../activeSessionStore";
import type { SpellingSession, StudySession } from "../../shared/types";

const APPLE_ID = "550e8400-e29b-41d4-a716-446655440000";
const BANANA_ID = "7d444840-9dc0-11d1-b245-5ffdce74fad2";

function makeStudySession(overrides: Partial<StudySession> = {}): StudySession {
	return {
		deckId: "notes/deck.md",
		direction: "normal",
		cardQueue: [APPLE_ID, BANANA_ID],
		currentIndex: 1,
		startTime: 1000,
		repeatQueue: [],
		history: [APPLE_ID, BANANA_ID],
		answerEvents: [
			{
				cardId: BANANA_ID,
				rating: 3,
				previousFsrsCard: createEmptyCard(),
				nextFsrsCard: createEmptyCard(),
				repeatInSession: false,
				answeredAt: 2000,
				previousCurrentIndex: 1,
				previousCardQueueLength: 2,
				previousRepeatQueue: [],
			},
		],
		originDeck: { id: "notes/deck.md", name: "Deck at start" },
		...overrides,
	};
}

describe("ActiveSessionStore", () => {
	it("removes deleted identities from the queue without erasing answer events", async () => {
		const store = createActiveSessionStore();
		store.setStudySession(makeStudySession());

		await store.reconcile({
			availableIdentities: new Set([APPLE_ID]),
			deletedIdentities: new Set([BANANA_ID]),
		});

		expect(store.getSnapshot().studySession).toMatchObject({
			cardQueue: [APPLE_ID],
			currentIndex: 0,
			history: [APPLE_ID, BANANA_ID],
			unavailableCardIds: [BANANA_ID],
		});
		expect(store.getSnapshot().studySession?.answerEvents).toHaveLength(1);
	});

	it("ends an empty session by source change and reports completed answer activity", async () => {
		const endings: SourceChangeEnd[] = [];
		const store = createActiveSessionStore({
			onSourceChangeEnd: async (ending) => {
				endings.push(ending);
			},
		});
		store.setStudySession(
			makeStudySession({ cardQueue: [BANANA_ID], currentIndex: 0, history: [BANANA_ID] }),
		);

		await store.reconcile({
			availableIdentities: new Set(),
			deletedIdentities: new Set([BANANA_ID]),
		});

		expect(store.getSnapshot().studySession).toBeNull();
		expect(store.getSnapshot().lastEndReason).toBe("source-change");
		expect(endings).toEqual([
			expect.objectContaining({
				type: "study",
				answerEventCount: 1,
				originDeck: { id: "notes/deck.md", name: "Deck at start" },
			}),
		]);
	});

	it("reconciles spelling queues and exits correction when the current word is deleted", async () => {
		const store = createActiveSessionStore();
		const spellingSession: SpellingSession = {
			deckId: "notes/deck.md",
			selectedCardIds: [APPLE_ID, BANANA_ID],
			cardQueue: [APPLE_ID, BANANA_ID, APPLE_ID],
			currentIndex: 0,
			startTime: 1000,
			phase: "correction",
			firstAttempts: {
				[APPLE_ID]: { input: "aple", correct: false, answeredAt: 2000 },
			},
			attempts: [
				{
					cardId: APPLE_ID,
					input: "aple",
					correct: false,
					kind: "retrieval",
					answeredAt: 2000,
				},
			],
			completedCardIds: [],
		};
		store.setSpellingSession(spellingSession);

		await store.reconcile({
			availableIdentities: new Set([BANANA_ID]),
			deletedIdentities: new Set([APPLE_ID]),
		});

		expect(store.getSnapshot().spellingSession).toMatchObject({
			selectedCardIds: [BANANA_ID],
			cardQueue: [BANANA_ID],
			currentIndex: 0,
			phase: "retrieval",
			firstAttempts: {},
			unavailableCardIds: [APPLE_ID],
		});
	});

	it("removes a deleted word that was waiting to reappear at the queue tail", async () => {
		const store = createActiveSessionStore();
		store.setSpellingSession({
			deckId: "notes/deck.md",
			selectedCardIds: [APPLE_ID, BANANA_ID],
			cardQueue: [APPLE_ID, BANANA_ID, APPLE_ID],
			currentIndex: 1,
			startTime: 1000,
			phase: "retrieval",
			firstAttempts: {
				[APPLE_ID]: { input: "aple", correct: false, answeredAt: 2000 },
			},
			attempts: [
				{
					cardId: APPLE_ID,
					input: "aple",
					correct: false,
					kind: "retrieval",
					answeredAt: 2000,
				},
				{
					cardId: APPLE_ID,
					input: "apple",
					correct: true,
					kind: "correction",
					answeredAt: 3000,
				},
			],
			completedCardIds: [],
		});

		await store.reconcile({
			availableIdentities: new Set([BANANA_ID]),
			deletedIdentities: new Set([APPLE_ID]),
		});

		expect(store.getSnapshot().spellingSession).toMatchObject({
			selectedCardIds: [BANANA_ID],
			cardQueue: [BANANA_ID],
			currentIndex: 0,
			firstAttempts: {},
			unavailableCardIds: [APPLE_ID],
		});
	});

	it("safely ends an empty spelling session and reports completed first attempts", async () => {
		const endings: SourceChangeEnd[] = [];
		const store = createActiveSessionStore({
			onSourceChangeEnd: async (ending) => {
				endings.push(ending);
			},
		});
		store.setSpellingSession({
			deckId: "notes/deck.md",
			selectedCardIds: [APPLE_ID],
			cardQueue: [APPLE_ID],
			currentIndex: 0,
			startTime: Date.now() - 2000,
			phase: "retrieval",
			firstAttempts: {
				[APPLE_ID]: { input: "apple", correct: true, answeredAt: 2000 },
			},
			attempts: [
				{
					cardId: APPLE_ID,
					input: "apple",
					correct: true,
					kind: "retrieval",
					answeredAt: 2000,
				},
			],
			completedCardIds: [APPLE_ID],
			originDeck: { id: "notes/deck.md", name: "Deck at start" },
		});

		await store.reconcile({
			availableIdentities: new Set(),
			deletedIdentities: new Set([APPLE_ID]),
		});

		expect(store.getSnapshot().spellingSession).toBeNull();
		expect(store.getSnapshot().lastEndReason).toBe("source-change");
		expect(endings).toEqual([
			expect.objectContaining({
				type: "spelling",
				answerEventCount: 1,
				originDeck: { id: "notes/deck.md", name: "Deck at start" },
			}),
		]);
	});

	it("ends spelling when source edits make every remaining front invalid", async () => {
		const endings: SourceChangeEnd[] = [];
		const store = createActiveSessionStore({
			onSourceChangeEnd: async (ending) => {
				endings.push(ending);
			},
		});
		store.setSpellingSession({
			deckId: "notes/deck.md",
			selectedCardIds: [APPLE_ID],
			cardQueue: [APPLE_ID],
			currentIndex: 0,
			startTime: Date.now(),
			phase: "retrieval",
			firstAttempts: {},
			attempts: [],
			completedCardIds: [],
		});

		await store.reconcile({
			availableIdentities: new Set([APPLE_ID]),
			deletedIdentities: new Set(),
			spellableIdentitiesByDeck: new Map([["notes/deck.md", new Set()]]),
		});

		expect(store.getSnapshot().spellingSession).toBeNull();
		expect(store.getSnapshot().lastEndReason).toBe("source-change");
		expect(endings).toEqual([
			expect.objectContaining({
				type: "spelling",
				answerEventCount: 0,
			}),
		]);
	});
});
