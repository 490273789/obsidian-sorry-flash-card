import type { Deck, FlashCard } from "../shared/types";
import {
	CARD_END_SEPARATOR,
	EXPLANATION_SEPARATOR,
	FIRST_TAG_LINE_PATTERN,
	FRONT_BACK_SEPARATOR,
	extractCardIdentityMarker,
	formatCardBlock,
	formatCardIdentityMarker,
	isMarkerLine,
} from "./cardFormat";

type ReservedMarker =
	| typeof FRONT_BACK_SEPARATOR
	| typeof EXPLANATION_SEPARATOR
	| typeof CARD_END_SEPARATOR;

export type DeckSourceEditError =
	| { type: "missing-front" }
	| { type: "missing-back" }
	| { type: "reserved-marker"; marker: ReservedMarker }
	| { type: "card-not-found" }
	| { type: "source-file-invalid" };

export class DeckSourceEditException extends Error {
	readonly editError: DeckSourceEditError;

	constructor(editError: DeckSourceEditError) {
		super(getDeckSourceEditMessage(editError));
		this.name = "DeckSourceEditException";
		this.editError = editError;
	}
}

export type DeckSourceEditOperation =
	| {
			type: "add";
			cardId?: string;
			front: string;
			back: string;
			explanation?: string;
	  }
	| {
			type: "update";
			cardId: string;
			front: string;
			back: string;
			explanation?: string;
	  }
	| {
			type: "delete";
			cardId: string;
	  };

export interface DeckSourceEditResult {
	nextContent: string;
	newCardId?: string;
}

interface CardBlockRange {
	start: number;
	end: number;
}

export interface CardIdentityRegistrationResult {
	nextContent: string;
	registeredIdentities: string[];
}

export function rewriteCardIdentityMarkers(content: string, identities: string[]): string {
	const lines = content.split(/\r?\n/);
	const nextLines: string[] = [];
	let blockStart = 0;
	let cardIndex = 0;

	for (let index = 0; index < lines.length; index++) {
		if (!isMarkerLine(lines[index] ?? "", CARD_END_SEPARATOR)) continue;
		const blockLines = lines.slice(blockStart, index);
		const frontBackIndex = blockLines.findIndex((line) =>
			isMarkerLine(line, FRONT_BACK_SEPARATOR),
		);
		const desiredIdentity = identities[cardIndex];
		if (frontBackIndex !== -1 && desiredIdentity) {
			const withoutIdentity = blockLines.filter(
				(line) => extractCardIdentityMarker(line) === null,
			);
			const frontContentIndex = findFrontContentIndex(withoutIdentity, cardIndex === 0);
			if (frontContentIndex !== -1) {
				withoutIdentity.splice(
					frontContentIndex,
					0,
					formatCardIdentityMarker(desiredIdentity),
				);
				blockLines.splice(0, blockLines.length, ...withoutIdentity);
				cardIndex++;
			}
		}
		nextLines.push(...blockLines, lines[index] ?? CARD_END_SEPARATOR);
		blockStart = index + 1;
	}

	if (cardIndex !== identities.length) {
		throw new DeckSourceEditException({ type: "source-file-invalid" });
	}
	nextLines.push(...lines.slice(blockStart));
	return nextLines.join("\n");
}

const RESERVED_MARKERS: readonly ReservedMarker[] = [
	FRONT_BACK_SEPARATOR,
	EXPLANATION_SEPARATOR,
	CARD_END_SEPARATOR,
];

export function editDeckSource(
	content: string,
	deck: Deck,
	operation: DeckSourceEditOperation,
): DeckSourceEditResult {
	switch (operation.type) {
		case "add":
			return addCardToSource(content, deck, operation);
		case "update":
			return updateCardInSource(content, deck, operation);
		case "delete":
			return deleteCardFromSource(content, deck, operation.cardId);
	}
}

export function registerMissingCardIdentities(
	content: string,
	createIdentity: () => string,
): CardIdentityRegistrationResult {
	const lines = content.split(/\r?\n/);
	const nextLines: string[] = [];
	const registeredIdentities: string[] = [];
	let blockStart = 0;
	let validCardIndex = 0;

	for (let index = 0; index < lines.length; index++) {
		if (!isMarkerLine(lines[index] ?? "", CARD_END_SEPARATOR)) continue;

		const blockLines = lines.slice(blockStart, index);
		const frontBackIndex = blockLines.findIndex((line) =>
			isMarkerLine(line, FRONT_BACK_SEPARATOR),
		);
		const explanationIndex = blockLines.findIndex(
			(line, lineIndex) =>
				lineIndex > frontBackIndex && isMarkerLine(line, EXPLANATION_SEPARATOR),
		);
		const backEnd = explanationIndex === -1 ? blockLines.length : explanationIndex;
		const frontContentIndex = findFrontContentIndex(blockLines, validCardIndex === 0);
		const hasFront =
			frontBackIndex > 0 &&
			frontContentIndex !== -1 &&
			blockLines
				.slice(frontContentIndex, frontBackIndex)
				.some((line) => line.trim().length > 0);
		const hasBack =
			frontBackIndex !== -1 &&
			blockLines.slice(frontBackIndex + 1, backEnd).some((line) => line.trim().length > 0);

		if (hasFront && hasBack) {
			validCardIndex++;
			const existingIdentity = blockLines
				.map(extractCardIdentityMarker)
				.find((identity) => identity !== null);
			if (!existingIdentity) {
				const identity = createIdentity();
				registeredIdentities.push(identity);
				blockLines.splice(frontContentIndex, 0, formatCardIdentityMarker(identity));
			}
		}

		nextLines.push(...blockLines, lines[index] ?? CARD_END_SEPARATOR);
		blockStart = index + 1;
	}

	nextLines.push(...lines.slice(blockStart));
	return {
		nextContent: nextLines.join("\n"),
		registeredIdentities,
	};
}

function findFrontContentIndex(blockLines: string[], firstValidCard: boolean): number {
	for (let index = 0; index < blockLines.length; index++) {
		const line = blockLines[index] ?? "";
		if (line.trim().length === 0) continue;
		if (extractCardIdentityMarker(line)) continue;
		if (firstValidCard && /^\s*#[\w\u4e00-\u9fa5]+\s*$/.test(line)) continue;
		return index;
	}
	return -1;
}

function addCardToSource(
	content: string,
	deck: Deck,
	operation: Extract<DeckSourceEditOperation, { type: "add" }>,
): DeckSourceEditResult {
	assertValidCardContent(operation.front, operation.back, operation.explanation);

	return {
		nextContent: appendCardBlock(
			content,
			operation.front,
			operation.back,
			operation.explanation,
			operation.cardId,
		),
		newCardId: operation.cardId ?? generateCardId(deck.filePath, deck.cards.length),
	};
}

function updateCardInSource(
	content: string,
	deck: Deck,
	operation: Extract<DeckSourceEditOperation, { type: "update" }>,
): DeckSourceEditResult {
	assertValidCardContent(operation.front, operation.back, operation.explanation);
	const card = findCard(deck, operation.cardId);
	const nextContent = replaceCardBlock(
		content,
		card.indexInFile,
		operation.front,
		operation.back,
		operation.explanation,
		isLegacyCardIdentity(deck.filePath, card.id) ? undefined : card.id,
	);

	return {
		nextContent,
	};
}

function deleteCardFromSource(content: string, deck: Deck, cardId: string): DeckSourceEditResult {
	const card = findCard(deck, cardId);

	return {
		nextContent: deleteCardBlock(content, card.indexInFile),
	};
}

function findCard(deck: Deck, cardId: string): FlashCard {
	const card = deck.cards.find((item) => item.id === cardId);
	if (!card) {
		throw new DeckSourceEditException({ type: "card-not-found" });
	}
	return card;
}

function assertValidCardContent(front: string, back: string, explanation?: string): void {
	if (!front.trim()) {
		throw new DeckSourceEditException({ type: "missing-front" });
	}
	if (!back.trim()) {
		throw new DeckSourceEditException({ type: "missing-back" });
	}

	for (const value of [front, back, explanation ?? ""]) {
		const marker = findReservedMarkerLine(value);
		if (marker) {
			throw new DeckSourceEditException({ type: "reserved-marker", marker });
		}
	}
}

function findReservedMarkerLine(content: string): ReservedMarker | null {
	const lines = content.split(/\r?\n/);
	return (
		RESERVED_MARKERS.find((marker) => lines.some((line) => isMarkerLine(line, marker))) ?? null
	);
}

function replaceCardBlock(
	content: string,
	indexInFile: number,
	front: string,
	back: string,
	explanation?: string,
	cardIdentity?: string,
): string {
	const lines = content.split(/\r?\n/);
	const ranges = findCardBlockRanges(lines);
	const currentRange = ranges[indexInFile];
	if (indexInFile < 0 || currentRange === undefined) {
		throw new DeckSourceEditException({ type: "source-file-invalid" });
	}

	const currentBlock = lines.slice(currentRange.start, currentRange.end).join("\n");
	if (!currentBlock.split(/\r?\n/).some((line) => isMarkerLine(line, FRONT_BACK_SEPARATOR))) {
		throw new DeckSourceEditException({ type: "source-file-invalid" });
	}

	const nextBlock = mergePreservedPrefixWithCardBlock(
		currentBlock,
		indexInFile,
		front,
		back,
		explanation,
		cardIdentity,
	);
	const nextLines = [
		...lines.slice(0, currentRange.start),
		...nextBlock.split("\n"),
		CARD_END_SEPARATOR,
		...lines.slice(currentRange.end + 1),
	];
	return nextLines.join("\n");
}

function deleteCardBlock(content: string, indexInFile: number): string {
	const lines = content.split(/\r?\n/);
	const ranges = findCardBlockRanges(lines);
	const currentRange = ranges[indexInFile];
	if (indexInFile < 0 || currentRange === undefined) {
		throw new DeckSourceEditException({ type: "source-file-invalid" });
	}

	const currentBlock = lines.slice(currentRange.start, currentRange.end).join("\n");
	const replacement = indexInFile === 0 ? extractPreservedPrefix(currentBlock).trimEnd() : "";
	const replacementLines = replacement.length > 0 ? replacement.split("\n") : [];
	const nextLines = [
		...lines.slice(0, currentRange.start),
		...replacementLines,
		...lines.slice(currentRange.end + 1),
	];
	return nextLines.join("\n");
}

function findCardBlockRanges(lines: string[]): CardBlockRange[] {
	const ranges: CardBlockRange[] = [];
	let start = 0;

	lines.forEach((line, index) => {
		if (!isMarkerLine(line, CARD_END_SEPARATOR)) return;
		ranges.push({ start, end: index });
		start = index + 1;
	});

	return ranges;
}

function mergePreservedPrefixWithCardBlock(
	currentBlock: string,
	indexInFile: number,
	front: string,
	back: string,
	explanation?: string,
	cardIdentity?: string,
): string {
	const cardBlock = formatCardBlock(front, back, explanation, cardIdentity);
	if (indexInFile !== 0) return cardBlock;

	const prefix = extractPreservedPrefix(currentBlock);
	if (!prefix) return cardBlock;

	const separator = prefix.endsWith("\n") ? "" : "\n";
	return `${prefix}${separator}${cardBlock}`;
}

function extractPreservedPrefix(currentBlock: string): string {
	const tagMatch = currentBlock.match(FIRST_TAG_LINE_PATTERN);
	if (!tagMatch || tagMatch.index === undefined) return "";

	return currentBlock.slice(0, tagMatch.index + tagMatch[0].length);
}

function appendCardBlock(
	content: string,
	front: string,
	back: string,
	explanation?: string,
	cardIdentity?: string,
): string {
	const base = content.trimEnd();
	const separator = base.length > 0 ? "\n\n" : "";
	return `${base}${separator}${formatCardBlock(front, back, explanation, cardIdentity)}\n${CARD_END_SEPARATOR}\n`;
}

function isLegacyCardIdentity(filePath: string, cardId: string): boolean {
	return cardId.startsWith(`${filePath}::`);
}

function generateCardId(filePath: string, index: number): string {
	return `${filePath}::${index}`;
}

function getDeckSourceEditMessage(editError: DeckSourceEditError): string {
	switch (editError.type) {
		case "missing-front":
			return "Card front is required";
		case "missing-back":
			return "Card back is required";
		case "reserved-marker":
			return `Card content cannot contain a reserved marker line: ${editError.marker}`;
		case "card-not-found":
			return "Card not found";
		case "source-file-invalid":
			return "Card block not found in source file";
	}
}
