import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { createActiveSessionStore, type SourceChangeEnd } from "../activeSessionStore";
import type { StudySession } from "../../shared/types";

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
});
