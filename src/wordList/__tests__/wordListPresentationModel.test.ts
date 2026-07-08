import { createEmptyCard } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import type { FlashCard } from "../../shared/types";
import {
	buildVirtualWordRows,
	buildWordListItems,
	DEFAULT_WORD_ROW_HEIGHT,
	selectVisibleWordRows,
} from "../wordListPresentationModel";

function makeCard(id: string, indexInFile: number, overrides: Partial<FlashCard> = {}): FlashCard {
	return {
		id,
		front: `#${id}`,
		back: ` ${id} back `,
		explanation: ` ${id} explanation `,
		fsrsCard: createEmptyCard(),
		sourceFile: "deck.md",
		indexInFile,
		...overrides,
	};
}

describe("word list presentation model", () => {
	it("builds sorted word-list items from cards and trims display fields", () => {
		expect(
			buildWordListItems([
				makeCard("second", 1),
				makeCard("first", 0, { front: " #first #tag ", explanation: undefined }),
			]),
		).toEqual([
			{
				id: "first",
				front: "first tag",
				back: "first back",
				explanation: "",
				index: 0,
			},
			{
				id: "second",
				front: "second",
				back: "second back",
				explanation: "second explanation",
				index: 1,
			},
		]);
	});

	it("builds virtual row positions with measured heights and a total height", () => {
		const items = buildWordListItems([makeCard("a", 0), makeCard("b", 1)]);
		const rows = buildVirtualWordRows(items, new Map([["a", 140]]), 12);

		expect(rows.totalHeight).toBe(140 + 12 + DEFAULT_WORD_ROW_HEIGHT);
		expect(
			rows.rows.map((row) => ({ id: row.item.id, top: row.top, height: row.height })),
		).toEqual([
			{ id: "a", top: 0, height: 140 },
			{ id: "b", top: 152, height: DEFAULT_WORD_ROW_HEIGHT },
		]);
	});

	it("selects visible rows with overscan", () => {
		const items = buildWordListItems([
			makeCard("a", 0),
			makeCard("b", 1),
			makeCard("c", 2),
			makeCard("d", 3),
		]);
		const virtualRows = buildVirtualWordRows(items, new Map(), 10);

		expect(
			selectVisibleWordRows({
				rows: virtualRows.rows,
				scrollTop: DEFAULT_WORD_ROW_HEIGHT + 10,
				viewportHeight: DEFAULT_WORD_ROW_HEIGHT,
				rowGap: 10,
				overscanRows: 1,
			}).map((row) => row.item.id),
		).toEqual(["a", "b", "c"]);
	});
});
