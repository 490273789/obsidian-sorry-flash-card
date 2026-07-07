import type { CardDirection, FlashCard } from "../shared/types";

export interface DisplayCardContent {
	prompt: string;
	answer: string;
	explanation: string;
}

export function getDisplayCardContent(
	card: FlashCard,
	direction: CardDirection,
): DisplayCardContent {
	return {
		prompt: direction === "reversed" ? card.back : card.front,
		answer: direction === "reversed" ? card.front : card.back,
		explanation: card.explanation?.trim() ?? "",
	};
}
