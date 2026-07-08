import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it, vi } from "vitest";
import { createDeckHomeRuntime, type DeckHomeRuntimeStore } from "../deckHomeRuntime";
import type { Deck, DeckStats } from "../../shared/types";

function makeDeck(id: string, studyCount: number): Deck {
	return {
		id,
		name: id,
		filePath: `${id}.md`,
		tag: "#word",
		cards: [
			{
				id: `${id}::0`,
				front: "front",
				back: "back",
				fsrsCard: createEmptyCard(),
				sourceFile: `${id}.md`,
				indexInFile: 0,
			},
		],
		studyCount,
		lastStudied: null,
	};
}

function makeStats(totalCards: number, newCards: number, dueCards: number): DeckStats {
	return {
		totalCards,
		newCards,
		dueCards,
		learningCards: 0,
		reviewCards: Math.max(0, totalCards - newCards),
		relearningCards: 0,
	};
}

describe("DeckHomeRuntime", () => {
	it("builds the home snapshot from decks and deck stats", () => {
		const deckA = makeDeck("deck-a", 2);
		const deckB = makeDeck("deck-b", 3);
		const stats = new Map<string, DeckStats>([
			[deckA.id, makeStats(10, 4, 1)],
			[deckB.id, makeStats(5, 2, 3)],
		]);
		const getAllDecks = vi.fn(() => [deckA, deckB]);
		const getDeckStats = vi.fn((deck: Deck) => stats.get(deck.id)!);
		const store: DeckHomeRuntimeStore = {
			getAllDecks,
			getDeckStats,
		};

		const snapshot = createDeckHomeRuntime(store).getSnapshot();

		expect(snapshot.decks).toEqual([deckA, deckB]);
		expect(snapshot.statsByDeckId.get(deckA.id)).toEqual(makeStats(10, 4, 1));
		expect(snapshot.statsByDeckId.get(deckB.id)).toEqual(makeStats(5, 2, 3));
		expect(snapshot.totals).toEqual({
			totalCards: 15,
			newCards: 6,
			dueCards: 4,
			studyCount: 5,
		});
		expect(getAllDecks).toHaveBeenCalledTimes(1);
		expect(getDeckStats).toHaveBeenCalledTimes(2);
	});

	it("returns an empty snapshot when no decks exist", () => {
		const store: DeckHomeRuntimeStore = {
			getAllDecks: () => [],
			getDeckStats: () => makeStats(0, 0, 0),
		};

		expect(createDeckHomeRuntime(store).getSnapshot()).toEqual({
			decks: [],
			statsByDeckId: new Map(),
			totals: {
				totalCards: 0,
				newCards: 0,
				dueCards: 0,
				studyCount: 0,
			},
		});
	});
});
