import type { Deck, DeckStats } from "../shared/types";

export interface DeckHomeTotals {
	totalCards: number;
	newCards: number;
	dueCards: number;
	studyCount: number;
}

export interface DeckHomeSnapshot {
	decks: Deck[];
	statsByDeckId: Map<string, DeckStats>;
	totals: DeckHomeTotals;
}

export interface DeckHomeRuntimeStore {
	getAllDecks(): Deck[];
	getDeckStats(deck: Deck): DeckStats;
}

export interface DeckHomeRuntime {
	getSnapshot(): DeckHomeSnapshot;
}

export function createDeckHomeRuntime(store: DeckHomeRuntimeStore): DeckHomeRuntime {
	return new DataStoreDeckHomeRuntime(store);
}

class DataStoreDeckHomeRuntime implements DeckHomeRuntime {
	constructor(private readonly store: DeckHomeRuntimeStore) {}

	getSnapshot(): DeckHomeSnapshot {
		const decks = this.store.getAllDecks();
		const statsByDeckId = new Map<string, DeckStats>();
		const totals: DeckHomeTotals = {
			totalCards: 0,
			newCards: 0,
			dueCards: 0,
			studyCount: 0,
		};

		for (const deck of decks) {
			const deckStats = this.store.getDeckStats(deck);
			statsByDeckId.set(deck.id, deckStats);
			totals.totalCards += deckStats.totalCards;
			totals.newCards += deckStats.newCards;
			totals.dueCards += deckStats.dueCards;
			totals.studyCount += deck.studyCount;
		}

		return {
			decks,
			statsByDeckId,
			totals,
		};
	}
}
