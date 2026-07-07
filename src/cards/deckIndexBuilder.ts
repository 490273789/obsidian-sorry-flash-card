import { hasFlashcardSyntax } from "./cardFormat";
import { extractFirstTag, parseFlashcards } from "./parser";
import type { Deck, FlashCard } from "../shared/types";

export interface DeckIndexSourceFile {
	path: string;
	basename: string;
	content: string;
	existingDeck?: Deck;
}

export interface DeckIndexBuildParams {
	files: DeckIndexSourceFile[];
	configuredTags: string[];
	parseCards?: ParseFlashcardsFn;
}

export interface DeckIndexBuildResult {
	decks: Map<string, Deck>;
	availableTags: string[];
	errors: DeckIndexBuildError[];
}

export interface DeckIndexBuildError {
	filePath: string;
	error: unknown;
}

type ParseFlashcardsFn = (
	content: string,
	filePath: string,
	existingCards?: Map<string, FlashCard>,
) => FlashCard[];

export function buildDeckIndex(params: DeckIndexBuildParams): DeckIndexBuildResult {
	const decks = new Map<string, Deck>();
	const availableTags = new Set<string>();
	const errors: DeckIndexBuildError[] = [];
	const configuredTagsLower = new Set(params.configuredTags.map((tag) => tag.toLowerCase()));
	const parseCards = params.parseCards ?? parseFlashcards;

	for (const file of params.files) {
		try {
			const tag = extractFirstTag(file.content);
			if (!tag) continue;

			if (hasFlashcardSyntax(file.content)) {
				availableTags.add(tag);
			}

			if (!configuredTagsLower.has(tag.toLowerCase())) {
				continue;
			}

			const deck = buildDeckFromSourceFile(file, tag, parseCards);
			if (deck) {
				decks.set(deck.id, deck);
			}
		} catch (error) {
			errors.push({
				filePath: file.path,
				error,
			});
		}
	}

	return {
		decks,
		availableTags: Array.from(availableTags),
		errors,
	};
}

function buildDeckFromSourceFile(
	file: DeckIndexSourceFile,
	tag: string,
	parseCards: ParseFlashcardsFn,
): Deck | null {
	const existingCards = new Map<string, FlashCard>();
	for (const card of file.existingDeck?.cards ?? []) {
		existingCards.set(card.id, card);
	}

	const cards = parseCards(file.content, file.path, existingCards);
	if (cards.length === 0) return null;

	return {
		id: file.path,
		name: file.basename,
		filePath: file.path,
		tag,
		cards,
		studyCount: file.existingDeck?.studyCount || 0,
		lastStudied: file.existingDeck?.lastStudied || null,
	};
}
