import type { Deck } from "../shared/types";

export interface DeckPdfRow {
	front: string;
	back: string;
}

export function getDeckPdfRows(deck: Deck): DeckPdfRow[] {
	return deck.cards.map((card) => ({
		front: card.front,
		back: card.back,
	}));
}

export function getDeckPdfFileStem(deckName: string): string {
	const sanitized = deckName
		.replace(/[<>:"/\\|?*]/g, "-")
		.split("")
		.map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
		.join("")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[.\s]+$/g, "");
	return sanitized || "flashcards";
}

export function ensurePdfExtension(filePath: string): string {
	return filePath.toLowerCase().endsWith(".pdf") ? filePath : `${filePath}.pdf`;
}
