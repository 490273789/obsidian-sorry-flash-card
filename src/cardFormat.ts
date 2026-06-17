export const FRONT_BACK_SEPARATOR = "??";
export const EXPLANATION_SEPARATOR = "::";
export const CARD_END_SEPARATOR = ";;";
export const FIRST_TAG_LINE_PATTERN = /(?:^|\n)\s*#[\w\u4e00-\u9fa5]+\s*\n?/;

const FLASHCARD_FRONT_BACK_PATTERN = /(?:^|\n)\s*\?\?\s*(?:\n|$)/;
const FLASHCARD_END_PATTERN = /(?:^|\n)\s*;;\s*(?:\n|$)/;
const RESERVED_MARKER_LINE_PATTERN = /(?:^|\n)\s*(?:\?\?|::|;;)\s*(?:\n|$)/;

export function isMarkerLine(line: string, marker: string): boolean {
	return line.trim() === marker;
}

export function hasFlashcardSyntax(content: string): boolean {
	return (
		FLASHCARD_FRONT_BACK_PATTERN.test(content) &&
		FLASHCARD_END_PATTERN.test(content)
	);
}

export function containsReservedMarkerLine(content: string): boolean {
	return RESERVED_MARKER_LINE_PATTERN.test(content);
}

export function formatCardBlock(
	front: string,
	back: string,
	explanation?: string,
): string {
	const trimmedExplanation = explanation?.trim() ?? "";
	const parts = [
		front.trim(),
		FRONT_BACK_SEPARATOR,
		back.trim(),
	];

	if (trimmedExplanation.length > 0) {
		parts.push(EXPLANATION_SEPARATOR, trimmedExplanation);
	}

	return parts.join("\n");
}
