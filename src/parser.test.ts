import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { extractFirstTag, parseFlashcards } from "./parser";
import type { FlashCard } from "./types";

function getOnlyCard(cards: FlashCard[]): FlashCard {
	expect(cards).toHaveLength(1);

	const card = cards[0];
	if (!card) {
		throw new Error("Expected parsed card");
	}

	return card;
}

describe("extractFirstTag", () => {
	it("extracts the first flashcard tag including Chinese characters", () => {
		const tag = extractFirstTag("\n  #单词\n#other\ncontent");

		expect(tag).toBe("#单词");
	});
});

describe("parseFlashcards", () => {
	it("parses cards with front, back, explanation, and stable source metadata", () => {
		const cards = parseFlashcards(
			`#单词
苹果
??
apple
::
一种水果
;;

香蕉
??
banana
;;`,
			"notes/vocab.md",
		);

		expect(cards).toHaveLength(2);
		expect(cards[0]).toMatchObject({
			id: "notes/vocab.md::0",
			front: "苹果",
			back: "apple",
			explanation: "一种水果",
			sourceFile: "notes/vocab.md",
			indexInFile: 0,
		});
		expect(cards[1]).toMatchObject({
			id: "notes/vocab.md::1",
			front: "香蕉",
			back: "banana",
			sourceFile: "notes/vocab.md",
			indexInFile: 1,
		});
		expect(cards[1]?.explanation).toBeUndefined();
	});

	it("preserves existing FSRS state by stable card id", () => {
		const fsrsCard = createEmptyCard();
		const existingCard: FlashCard = {
			id: "notes/vocab.md::0",
			front: "旧问题",
			back: "old answer",
			fsrsCard,
			sourceFile: "notes/vocab.md",
			indexInFile: 0,
		};

		const card = getOnlyCard(
			parseFlashcards(
				`#单词
新问题
??
new answer
;;`,
				"notes/vocab.md",
				new Map([[existingCard.id, existingCard]]),
			),
		);

		expect(card.fsrsCard).toBe(fsrsCard);
		expect(card.front).toBe("新问题");
		expect(card.back).toBe("new answer");
	});
});
