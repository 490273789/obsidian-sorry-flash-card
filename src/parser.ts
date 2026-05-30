import { TFile, Vault } from "obsidian";
import { createEmptyCard } from "ts-fsrs";
import { FlashCard, Deck } from "./types";

/**
 * Generate a unique ID for cards
 */
function generateCardId(filePath: string, index: number): string {
	return `${filePath}::${index}`;
}

/**
 * Extract the first tag from content
 */
export function extractFirstTag(content: string): string | null {
	// Match hashtag at the start of the file or after newlines
	const tagMatch = content.match(/(?:^|\n)\s*(#[\w\u4e00-\u9fa5]+)/);
	return tagMatch && tagMatch[1] ? tagMatch[1] : null;
}

/**
 * Parse flashcards from markdown content
 * Format:
 * - Cards separated by "<->"
 * - Question and answer separated by "---div---"
 */
export function parseFlashcards(
	content: string,
	filePath: string,
	existingCards?: Map<string, FlashCard>,
): FlashCard[] {
	const cards: FlashCard[] = [];

	// Remove the tag line from content for parsing
	const contentWithoutTag = content.replace(
		/(?:^|\n)\s*#[\w\u4e00-\u9fa5]+\s*\n?/,
		"\n",
	);

	// Split by card separator
	const cardBlocks = contentWithoutTag.split("<->");

	cardBlocks.forEach((block, index) => {
		const trimmedBlock = block.trim();
		if (!trimmedBlock) return;

		// Split by question/answer separator
		const parts = trimmedBlock.split("---div---");
		if (parts.length < 2) return;

		const question = parts[0]?.trim() || "";
		const answer = parts.slice(1).join("---div---").trim(); // Join back if multiple separators

		if (!question || !answer) return;

		const cardId = generateCardId(filePath, index);

		// Preserve existing FSRS state if card exists
		const existingCard = existingCards?.get(cardId);

		cards.push({
			id: cardId,
			question,
			answer,
			fsrsCard: existingCard?.fsrsCard || createEmptyCard(),
			sourceFile: filePath,
			indexInFile: index,
		});
	});

	return cards;
}

/**
 * Parse a single file into a deck.
 * Pass `preloadedContent` to avoid reading the file a second time when the
 * caller has already read it (e.g. inside a vault-wide scan loop).
 */
export async function parseFileIntoDeck(
	file: TFile,
	vault: Vault,
	existingDeck?: Deck,
	preloadedContent?: string,
): Promise<Deck | null> {
	const content = preloadedContent ?? (await vault.cachedRead(file));
	const tag = extractFirstTag(content);

	if (!tag) return null;

	// Create a map of existing cards for preserving FSRS state
	const existingCardsMap = new Map<string, FlashCard>();
	if (existingDeck) {
		existingDeck.cards.forEach((card) => {
			existingCardsMap.set(card.id, card);
		});
	}

	const cards = parseFlashcards(content, file.path, existingCardsMap);

	if (cards.length === 0) return null;

	// Extract deck name from file name
	const deckName = file.basename;

	return {
		id: file.path,
		name: deckName,
		filePath: file.path,
		tag,
		cards,
		studyCount: existingDeck?.studyCount || 0,
		lastStudied: existingDeck?.lastStudied || null,
	};
}

/**
 * Scan all files with a specific tag
 */
export async function scanFilesWithTag(
	vault: Vault,
	targetTag: string,
	existingDecks: Map<string, Deck>,
): Promise<Deck[]> {
	const decks: Deck[] = [];
	const files = vault.getMarkdownFiles();

	for (const file of files) {
		try {
			const content = await vault.cachedRead(file);
			const tag = extractFirstTag(content);

			// Check if file has the target tag (case-insensitive comparison)
			if (tag && tag.toLowerCase() === targetTag.toLowerCase()) {
				const existingDeck = existingDecks.get(file.path);
				const deck = await parseFileIntoDeck(file, vault, existingDeck);
				if (deck) {
					decks.push(deck);
				}
			}
		} catch (error) {
			console.error(`Error parsing file ${file.path}:`, error);
		}
	}

	return decks;
}

/**
 * Find all unique tags that contain flashcards
 */
export async function findAllFlashcardTags(vault: Vault): Promise<string[]> {
	const tags = new Set<string>();
	const files = vault.getMarkdownFiles();

	for (const file of files) {
		try {
			const content = await vault.cachedRead(file);
			const tag = extractFirstTag(content);

			// Check if file contains flashcard separators
			if (tag && content.includes("---div---")) {
				tags.add(tag);
			}
		} catch (error) {
			console.error(`Error scanning file ${file.path}:`, error);
		}
	}

	return Array.from(tags);
}
