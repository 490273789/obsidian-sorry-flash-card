import { createEmptyCard, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { buildDeckIndex, type DeckIndexSourceFile } from "./deckIndexBuilder";
import type { Deck, FlashCard } from "./types";

function makeSource(
	path: string,
	basename: string,
	content: string,
	existingDeck?: Deck,
): DeckIndexSourceFile {
	return {
		path,
		basename,
		content,
		existingDeck,
	};
}

function makeCard(id: string, indexInFile: number, overrides: Partial<FlashCard> = {}): FlashCard {
	return {
		id,
		front: `front ${indexInFile}`,
		back: `back ${indexInFile}`,
		fsrsCard: createEmptyCard(),
		sourceFile: "notes/deck.md",
		indexInFile,
		...overrides,
	};
}

function makeDeck(overrides: Partial<Deck> = {}): Deck {
	return {
		id: "notes/deck.md",
		name: "deck",
		filePath: "notes/deck.md",
		tag: "#单词",
		cards: [makeCard("notes/deck.md::0", 0)],
		studyCount: 0,
		lastStudied: null,
		...overrides,
	};
}

describe("buildDeckIndex", () => {
	it("builds decks only for configured tags while discovering all flashcard tags", () => {
		const result = buildDeckIndex({
			configuredTags: ["#word"],
			files: [
				makeSource(
					"notes/word.md",
					"word",
					`#Word
front
??
back
;;`,
				),
				makeSource(
					"notes/phrase.md",
					"phrase",
					`#短语
front
??
back
;;`,
				),
				makeSource("notes/plain.md", "plain", "#Word\n普通笔记"),
			],
		});

		expect(Array.from(result.decks.keys())).toEqual(["notes/word.md"]);
		expect(result.decks.get("notes/word.md")).toMatchObject({
			id: "notes/word.md",
			name: "word",
			filePath: "notes/word.md",
			tag: "#Word",
		});
		expect(result.decks.get("notes/word.md")?.cards).toHaveLength(1);
		expect(result.availableTags).toEqual(["#Word", "#短语"]);
		expect(result.errors).toEqual([]);
	});

	it("preserves existing deck metadata and matching FSRS state", () => {
		const fsrsCard = {
			...createEmptyCard(),
			state: State.Review,
			reps: 9,
			due: new Date("2026-07-01T00:00:00.000Z"),
		};
		const existingDeck = makeDeck({
			studyCount: 3,
			lastStudied: "2026-07-02T00:00:00.000Z",
			cards: [
				makeCard("notes/deck.md::0", 0, {
					fsrsCard,
				}),
			],
		});

		const result = buildDeckIndex({
			configuredTags: ["#单词"],
			files: [
				makeSource(
					"notes/deck.md",
					"deck",
					`#单词
front
??
back
;;`,
					existingDeck,
				),
			],
		});

		const deck = result.decks.get("notes/deck.md");
		expect(deck?.studyCount).toBe(3);
		expect(deck?.lastStudied).toBe("2026-07-02T00:00:00.000Z");
		expect(deck?.cards[0]?.fsrsCard.reps).toBe(9);
		expect(deck?.cards[0]?.fsrsCard.state).toBe(State.Review);
	});

	it("skips files without a configured tag or valid cards", () => {
		const result = buildDeckIndex({
			configuredTags: ["#单词"],
			files: [
				makeSource("notes/notag.md", "notag", "front\n??\nback\n;;"),
				makeSource("notes/invalid.md", "invalid", "#单词\n??\nback\n;;"),
			],
		});

		expect(result.decks.size).toBe(0);
		expect(result.availableTags).toEqual(["#单词"]);
		expect(result.errors).toEqual([]);
	});

	it("returns file-level parse errors and continues indexing later files", () => {
		const result = buildDeckIndex({
			configuredTags: ["#单词"],
			files: [
				makeSource(
					"notes/bad.md",
					"bad",
					`#单词
bad
??
bad
;;`,
				),
				makeSource(
					"notes/good.md",
					"good",
					`#单词
good
??
ok
;;`,
				),
			],
			parseCards: (content, filePath, existingCards) => {
				if (filePath === "notes/bad.md") {
					throw new Error("bad file");
				}
				return [
					makeCard(`${filePath}::0`, 0, {
						front: content.includes("good") ? "good" : "front",
						back: "ok",
						sourceFile: filePath,
						fsrsCard:
							existingCards?.get(`${filePath}::0`)?.fsrsCard ?? createEmptyCard(),
					}),
				];
			},
		});

		expect(Array.from(result.decks.keys())).toEqual(["notes/good.md"]);
		expect(result.availableTags).toEqual(["#单词"]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.filePath).toBe("notes/bad.md");
		expect(result.errors[0]?.error).toBeInstanceOf(Error);
	});
});
