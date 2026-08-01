import type { FlashCard, SpellingCardProgress } from "../shared/types";
import { shuffleArray } from "../shared/utils";
import { extractSpellingWord } from "../cards/spellingWord";

export type SpellingSessionPlanSource = "smart" | "range" | "incorrect-retry";

export interface SpellingSessionPlan {
	source: SpellingSessionPlanSource;
	deckId: string;
	cardIds: string[];
}

export interface SpellingDeckProgressStats {
	total: number;
	unpracticed: number;
	reinforcement: number;
	stable: number;
}

export type SpellingShuffle = (cardIds: string[]) => string[];

export function getSpellingDeckProgressStats(
	cards: readonly FlashCard[],
	progress: Readonly<Record<string, SpellingCardProgress>>,
): SpellingDeckProgressStats {
	const eligibleCards = cards.filter((card) => extractSpellingWord(card.front) !== null);
	let unpracticed = 0;
	let reinforcement = 0;
	let stable = 0;
	for (const card of eligibleCards) {
		const cardProgress = progress[card.id];
		if (!cardProgress || cardProgress.attempts === 0) {
			unpracticed++;
		} else if (cardProgress.correctStreak >= 2) {
			stable++;
		} else {
			reinforcement++;
		}
	}
	return { total: eligibleCards.length, unpracticed, reinforcement, stable };
}

export function planSmartSpellingSession(params: {
	deckId: string;
	cards: FlashCard[];
	progress: Readonly<Record<string, SpellingCardProgress>>;
	questionCount: number;
	random?: () => number;
}): SpellingSessionPlan {
	const random = params.random ?? Math.random;
	const ranked = params.cards.map((card) => ({
		card,
		tieBreaker: random(),
		progress: params.progress[card.id],
	}));
	ranked.sort((left, right) => {
		const leftRank = getProgressRank(left.progress);
		const rightRank = getProgressRank(right.progress);
		return (
			leftRank.priority - rightRank.priority ||
			leftRank.correctStreak - rightRank.correctStreak ||
			leftRank.accuracy - rightRank.accuracy ||
			leftRank.lastAttemptAt - rightRank.lastAttemptAt ||
			left.tieBreaker - right.tieBreaker
		);
	});

	return {
		source: "smart",
		deckId: params.deckId,
		cardIds: ranked
			.slice(0, normalizeQuestionLimit(params.questionCount, params.cards.length))
			.map(({ card }) => card.id),
	};
}

export function planRangeSpellingSession(params: {
	deckId: string;
	cards: FlashCard[];
	startIndex: number;
	endIndex: number;
	shuffle?: SpellingShuffle;
}): SpellingSessionPlan {
	const range = normalizeCardRange(params.startIndex, params.endIndex, params.cards.length);
	const cardIds = range
		? params.cards.slice(range.startIndex - 1, range.endIndex).map((card) => card.id)
		: [];
	return {
		source: "range",
		deckId: params.deckId,
		cardIds: (params.shuffle ?? shuffleArray)(cardIds),
	};
}

export function planIncorrectSpellingSession(params: {
	deckId: string;
	cardIds: string[];
	shuffle?: SpellingShuffle;
}): SpellingSessionPlan {
	return {
		source: "incorrect-retry",
		deckId: params.deckId,
		cardIds: (params.shuffle ?? shuffleArray)(Array.from(new Set(params.cardIds))),
	};
}

function getProgressRank(progress: SpellingCardProgress | undefined): {
	priority: number;
	correctStreak: number;
	accuracy: number;
	lastAttemptAt: number;
} {
	if (!progress || progress.attempts === 0) {
		return {
			priority: 1,
			correctStreak: 0,
			accuracy: 0,
			lastAttemptAt: 0,
		};
	}
	return {
		priority: progress.correctStreak === 0 ? 0 : 2,
		correctStreak: progress.correctStreak,
		accuracy: progress.correctAttempts / progress.attempts,
		lastAttemptAt: progress.lastAttemptAt,
	};
}

function normalizeQuestionLimit(questionCount: number, cardCount: number): number {
	if (!Number.isFinite(questionCount)) return 0;
	return Math.max(0, Math.min(cardCount, Math.floor(questionCount)));
}

function normalizeCardRange(
	startIndex: number,
	endIndex: number,
	cardCount: number,
): { startIndex: number; endIndex: number } | null {
	if (
		!Number.isFinite(startIndex) ||
		!Number.isFinite(endIndex) ||
		!Number.isFinite(cardCount) ||
		cardCount < 1
	) {
		return null;
	}
	const normalizedStart = Math.max(1, Math.floor(startIndex));
	const normalizedEnd = Math.min(cardCount, Math.floor(endIndex));
	if (normalizedStart > normalizedEnd) return null;
	return { startIndex: normalizedStart, endIndex: normalizedEnd };
}
