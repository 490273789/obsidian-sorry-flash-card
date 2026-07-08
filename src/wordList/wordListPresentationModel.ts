import type { FlashCard } from "../shared/types";

export type VisibleWordColumnKey = "front" | "back";

export interface WordListItem {
	id: string;
	front: string;
	back: string;
	explanation: string;
	index: number;
}

export interface WordColumnPresentation {
	key: VisibleWordColumnKey;
	className: string;
	textClassName: string;
	buttonClassName: string;
	variant: "blue" | "orange";
	labelKey: "wordList.firstColumn" | "wordList.secondColumn";
	maskKey: "wordList.maskFirstColumn" | "wordList.maskSecondColumn";
	unmaskKey: "wordList.unmaskFirstColumn" | "wordList.unmaskSecondColumn";
	toggleKey: "wordList.toggleFirstColumn" | "wordList.toggleSecondColumn";
}

export interface WordRowLayout {
	item: WordListItem;
	index: number;
	top: number;
	height: number;
}

export interface VirtualWordRows {
	rows: WordRowLayout[];
	totalHeight: number;
}

export interface VisibleWordRowsInput {
	rows: readonly WordRowLayout[];
	scrollTop: number;
	viewportHeight: number;
	rowGap: number;
	rowHeight?: number;
	overscanRows?: number;
}

export const DEFAULT_WORD_ROW_HEIGHT = 118;
export const DEFAULT_WORD_ROW_GAP = 12;
export const WORD_LIST_OVERSCAN_ROWS = 8;

export const VISIBLE_WORD_COLUMNS: readonly WordColumnPresentation[] = [
	{
		key: "front",
		className: "flashcard-word-cell-first",
		textClassName: "flashcard-word-front",
		buttonClassName: "word-column-front",
		variant: "blue",
		labelKey: "wordList.firstColumn",
		maskKey: "wordList.maskFirstColumn",
		unmaskKey: "wordList.unmaskFirstColumn",
		toggleKey: "wordList.toggleFirstColumn",
	},
	{
		key: "back",
		className: "flashcard-word-cell-second",
		textClassName: "flashcard-word-back",
		buttonClassName: "word-column-back",
		variant: "orange",
		labelKey: "wordList.secondColumn",
		maskKey: "wordList.maskSecondColumn",
		unmaskKey: "wordList.unmaskSecondColumn",
		toggleKey: "wordList.toggleSecondColumn",
	},
];

export function buildWordListItems(cards: FlashCard[]): WordListItem[] {
	return [...cards].sort((a, b) => a.indexInFile - b.indexInFile).map(toWordListItem);
}

export function buildVirtualWordRows(
	items: WordListItem[],
	rowHeights: ReadonlyMap<string, number>,
	rowGap: number,
): VirtualWordRows {
	let offsetTop = 0;
	const rows = items.map((item, index) => {
		const height = rowHeights.get(item.id) ?? DEFAULT_WORD_ROW_HEIGHT;
		const row = {
			item,
			index,
			top: offsetTop,
			height,
		};
		offsetTop += height + rowGap;
		return row;
	});

	return {
		rows,
		totalHeight: Math.max(0, offsetTop - rowGap),
	};
}

export function selectVisibleWordRows({
	rows,
	scrollTop,
	viewportHeight,
	rowGap,
	rowHeight = DEFAULT_WORD_ROW_HEIGHT,
	overscanRows = WORD_LIST_OVERSCAN_ROWS,
}: VisibleWordRowsInput): WordRowLayout[] {
	if (rows.length === 0) {
		return [];
	}

	const overscanPixels = (rowHeight + rowGap) * overscanRows;
	const startIndex = Math.max(0, findFirstVisibleIndex(rows, scrollTop - overscanPixels));
	const endIndex = Math.min(
		rows.length - 1,
		findLastVisibleIndex(rows, scrollTop + viewportHeight + overscanPixels),
	);

	if (endIndex < startIndex) {
		return [];
	}
	return rows.slice(startIndex, endIndex + 1);
}

function toWordListItem(card: FlashCard): WordListItem {
	return {
		id: card.id,
		front: stripHashSymbols(card.front),
		back: card.back.trim(),
		explanation: card.explanation?.trim() ?? "",
		index: card.indexInFile,
	};
}

function stripHashSymbols(text: string): string {
	return text.replace(/#/g, "").trim();
}

function findFirstVisibleIndex(rows: readonly WordRowLayout[], targetTop: number): number {
	let low = 0;
	let high = rows.length - 1;
	let result = rows.length;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const row = rows[middle];
		if (!row) break;
		if (row.top + row.height >= targetTop) {
			result = middle;
			high = middle - 1;
		} else {
			low = middle + 1;
		}
	}

	return result;
}

function findLastVisibleIndex(rows: readonly WordRowLayout[], targetBottom: number): number {
	let low = 0;
	let high = rows.length - 1;
	let result = -1;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const row = rows[middle];
		if (!row) break;
		if (row.top <= targetBottom) {
			result = middle;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}

	return result;
}
