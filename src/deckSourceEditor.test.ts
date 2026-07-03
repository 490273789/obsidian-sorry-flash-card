import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { DeckSourceEditException, editDeckSource } from "./deckSourceEditor";
import type { Deck, FlashCard } from "./types";

function makeDeck(cardCount: number): Deck {
	return {
		id: "notes/deck.md",
		name: "deck",
		filePath: "notes/deck.md",
		tag: "#单词",
		cards: Array.from({ length: cardCount }, (_, index) => makeCard(index)),
		studyCount: 0,
		lastStudied: null,
	};
}

function makeCard(index: number): FlashCard {
	return {
		id: `notes/deck.md::${index}`,
		front: `front ${index}`,
		back: `back ${index}`,
		fsrsCard: createEmptyCard(),
		sourceFile: "notes/deck.md",
		indexInFile: index,
	};
}

const threeCardSource = `#单词

苹果
??
apple
;;

香蕉
??
banana
::
黄色水果
;;

梨
??
pear
;;`;

describe("editDeckSource", () => {
	it("appends new cards to the end and returns the new card id", () => {
		const result = editDeckSource(threeCardSource, makeDeck(3), {
			type: "add",
			front: " 葡萄 ",
			back: " grape ",
			explanation: " fruit ",
		});

		expect(result.newCardId).toBe("notes/deck.md::3");
		expect(result.idMap).toEqual({});
		expect(result.nextContent).toBe(`${threeCardSource}

葡萄
??
grape
::
fruit
;;
`);
	});

	it("updates a card block while preserving the first tag prefix", () => {
		const result = editDeckSource(threeCardSource, makeDeck(3), {
			type: "update",
			cardId: "notes/deck.md::0",
			front: "苹果 updated",
			back: "apple updated",
		});

		expect(result.idMap).toEqual({});
		expect(result.nextContent).toBe(`#单词

苹果 updated
??
apple updated
;;

香蕉
??
banana
::
黄色水果
;;

梨
??
pear
;;`);
	});

	it("deletes a middle card and returns card identity remaps", () => {
		const result = editDeckSource(threeCardSource, makeDeck(3), {
			type: "delete",
			cardId: "notes/deck.md::1",
		});

		expect(result.idMap).toEqual({
			"notes/deck.md::0": "notes/deck.md::0",
			"notes/deck.md::1": null,
			"notes/deck.md::2": "notes/deck.md::1",
		});
		expect(result.nextContent).toBe(`#单词

苹果
??
apple
;;

梨
??
pear
;;`);
	});

	it("keeps the source tag when deleting the first card", () => {
		const result = editDeckSource(threeCardSource, makeDeck(3), {
			type: "delete",
			cardId: "notes/deck.md::0",
		});

		expect(result.idMap).toEqual({
			"notes/deck.md::0": null,
			"notes/deck.md::1": "notes/deck.md::0",
			"notes/deck.md::2": "notes/deck.md::1",
		});
		expect(result.nextContent.startsWith("#单词\n")).toBe(true);
		expect(result.nextContent).toContain("香蕉\n??\nbanana");
		expect(result.nextContent).not.toContain("苹果\n??\napple");
	});

	it("throws structured validation errors before editing the source", () => {
		expect(() =>
			editDeckSource(threeCardSource, makeDeck(3), {
				type: "add",
				front: "valid",
				back: "::",
			}),
		).toThrowError(DeckSourceEditException);

		try {
			editDeckSource(threeCardSource, makeDeck(3), {
				type: "add",
				front: "valid",
				back: "::",
			});
		} catch (error) {
			expect(error).toMatchObject({
				editError: { type: "reserved-marker", marker: "::" },
			});
		}
	});

	it("throws structured errors for missing cards and invalid source blocks", () => {
		expect(() =>
			editDeckSource(threeCardSource, makeDeck(3), {
				type: "delete",
				cardId: "notes/deck.md::99",
			}),
		).toThrowError(DeckSourceEditException);

		try {
			editDeckSource("#单词\ninvalid\n;;", makeDeck(1), {
				type: "update",
				cardId: "notes/deck.md::0",
				front: "front",
				back: "back",
			});
		} catch (error) {
			expect(error).toMatchObject({
				editError: { type: "source-file-invalid" },
			});
		}
	});
});
