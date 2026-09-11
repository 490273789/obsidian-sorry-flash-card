export const FRONT_BACK_SEPARATOR = "??";
export const EXPLANATION_SEPARATOR = "::";
export const CARD_END_SEPARATOR = ";;";
export const FIRST_TAG_LINE_PATTERN = /(?:^|\n)\s*#[\w\u4e00-\u9fa5]+\s*\n?/;

const CARD_IDENTITY_PATTERN =
	"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const CARD_IDENTITY_MARKER_PATTERN = new RegExp(
	`^\\s*<!--\\s*wsr-card-id:\\s*(${CARD_IDENTITY_PATTERN})\\s*-->\\s*$`,
);

const FLASHCARD_FRONT_BACK_PATTERN = /(?:^|\n)\s*\?\?\s*(?:\n|$)/;
const FLASHCARD_END_PATTERN = /(?:^|\n)\s*;;\s*(?:\n|$)/;
const RESERVED_MARKER_LINE_PATTERN = /(?:^|\n)\s*(?:\?\?|::|;;)\s*(?:\n|$)/;

const CARD_IDENTITY_EXACT_PATTERN = new RegExp(`^${CARD_IDENTITY_PATTERN}$`);

export function isMarkerLine(line: string, marker: string): boolean {
	const len = line.length;
	const mLen = marker.length;
	let start = 0;
	while (start < len && (line.charCodeAt(start) === 32 || line.charCodeAt(start) === 9)) {
		start++;
	}
	let end = len - 1;
	while (
		end >= start &&
		(line.charCodeAt(end) === 32 || line.charCodeAt(end) === 9 || line.charCodeAt(end) === 13)
	) {
		end--;
	}
	if (end - start + 1 !== mLen) return false;
	for (let i = 0; i < mLen; i++) {
		if (line.charCodeAt(start + i) !== marker.charCodeAt(i)) return false;
	}
	return true;
}

export function hasFlashcardSyntax(content: string): boolean {
	return FLASHCARD_FRONT_BACK_PATTERN.test(content) && FLASHCARD_END_PATTERN.test(content);
}

export function containsReservedMarkerLine(content: string): boolean {
	return RESERVED_MARKER_LINE_PATTERN.test(content);
}

export function extractCardIdentityMarker(line: string): string | null {
	return line.match(CARD_IDENTITY_MARKER_PATTERN)?.[1]?.toLowerCase() ?? null;
}

export function formatCardIdentityMarker(cardIdentity: string): string {
	if (!CARD_IDENTITY_EXACT_PATTERN.test(cardIdentity)) {
		throw new Error("Invalid card identity");
	}
	return `<!-- wsr-card-id: ${cardIdentity.toLowerCase()} -->`;
}

export function formatCardBlock(
	front: string,
	back: string,
	explanation?: string,
	cardIdentity?: string,
): string {
	const trimmedExplanation = explanation?.trim() ?? "";
	const parts = [front.trim(), FRONT_BACK_SEPARATOR, back.trim()];
	if (cardIdentity) {
		parts.unshift(formatCardIdentityMarker(cardIdentity));
	}

	if (trimmedExplanation.length > 0) {
		parts.push(EXPLANATION_SEPARATOR, trimmedExplanation);
	}

	return parts.join("\n");
}
