import { State } from "ts-fsrs";
import type {
	Deck,
	FlashCard,
	PracticeSelection,
	SpellingCardProgress,
	SpellingSelection,
	StudyDayInfo,
	StudySettings,
} from "../shared/types";
import {
	getSpellingDeckProgressStats,
	type SpellingDeckProgressStats,
} from "./spellingSessionPlanner";

export interface StudySetupPlan {
	readonly dayList: StudyDayInfo[];
	readonly todayNewCount: number;
	readonly todayReviewCount: number;
	readonly completedDays: number;
	readonly allCompleted: boolean;
	readonly hasAnythingToStudy: boolean;
	readonly todayTotal: number;
	readonly defaultStudyOrder: StudySettings["studyOrder"];
}

export interface PracticeSetupPlan {
	readonly maxQuestions: number;
	readonly maxRangeStart: number;
	readonly defaultQuestionCount: number;
	readonly initialQuestionCount: number;
	readonly initialRangeStart: number;
	readonly initialRangeEnd: number;
	readonly initialSelectionMode: "random" | "range";
}

export interface SpellingSetupPlan {
	readonly stats: SpellingDeckProgressStats;
	readonly maxQuestions: number;
	readonly defaultCount: number;
	readonly initialQuestionCount: number;
	readonly initialRangeStart: number;
	readonly initialRangeEnd: number;
	readonly initialSelectionMode: "smart" | "range";
}

export function sortDeckCards(cards: readonly FlashCard[]): FlashCard[] {
	return [...cards].sort((a, b) => a.indexInFile - b.indexInFile);
}

export function getDayList(deck: Pick<Deck, "cards">, dailyNewCards: number): StudyDayInfo[] {
	const validDailyNew = Math.max(1, Math.floor(dailyNewCards));
	const sortedCards = sortDeckCards(deck.cards);
	const totalCards = sortedCards.length;
	if (totalCards === 0) return [];

	const numDays = Math.ceil(totalCards / validDailyNew);
	const days: StudyDayInfo[] = [];
	let foundCurrent = false;

	for (let i = 0; i < numDays; i++) {
		const start = i * validDailyNew;
		const end = Math.min(start + validDailyNew, totalCards);
		const dayCards = sortedCards.slice(start, end);
		const studiedCards = dayCards.filter((c) => c.fsrsCard.state !== State.New).length;
		const isCompleted = studiedCards === dayCards.length;
		const isCurrent = !isCompleted && !foundCurrent;
		if (isCurrent) foundCurrent = true;

		days.push({
			dayIndex: i,
			startCardIndex: start,
			endCardIndex: end,
			totalCards: dayCards.length,
			studiedCards,
			isCompleted,
			isCurrent,
			isLocked: !isCompleted && !isCurrent,
		});
	}

	return days;
}

export function getTodayStudyCounts(
	deck: Pick<Deck, "cards">,
	settings: Pick<StudySettings, "dailyNewCards" | "dailyReviewCards">,
	now: Date = new Date(),
): { newCount: number; reviewCount: number } {
	const dailyNewCards = Math.max(0, settings.dailyNewCards);
	const dailyReviewCards = Math.max(0, settings.dailyReviewCards);
	let newCards = 0;
	let dueCards = 0;

	for (const card of deck.cards) {
		if (card.fsrsCard.state === State.New) {
			newCards++;
		} else if (card.fsrsCard.due <= now) {
			dueCards++;
		}
	}

	return {
		newCount: Math.min(dailyNewCards, newCards),
		reviewCount: Math.min(dailyReviewCards, dueCards),
	};
}

export function getCardsForDay(
	deck: Pick<Deck, "cards">,
	dayIndex: number,
	dailyNewCards: number,
): FlashCard[] {
	if (dayIndex < 0) return [];
	const validDailyNew = Math.max(1, Math.floor(dailyNewCards));
	const sortedCards = sortDeckCards(deck.cards);
	const start = dayIndex * validDailyNew;
	const end = Math.min(start + validDailyNew, sortedCards.length);
	if (start >= sortedCards.length) return [];
	return sortedCards.slice(start, end);
}

export function getStudySetupPlan(
	deck: Pick<Deck, "cards">,
	settings: StudySettings,
	now: Date = new Date(),
	initialStudyOrder?: StudySettings["studyOrder"],
): StudySetupPlan {
	const dayList = getDayList(deck, settings.dailyNewCards);
	const { newCount, reviewCount } = getTodayStudyCounts(deck, settings, now);
	const completedDays = dayList.reduce((total, day) => total + (day.isCompleted ? 1 : 0), 0);
	const allCompleted = dayList.length > 0 && completedDays === dayList.length;
	const hasAnythingToStudy = newCount > 0 || reviewCount > 0;
	const todayTotal = newCount + reviewCount;

	return {
		dayList,
		todayNewCount: newCount,
		todayReviewCount: reviewCount,
		completedDays,
		allCompleted,
		hasAnythingToStudy,
		todayTotal,
		defaultStudyOrder: initialStudyOrder ?? settings.studyOrder,
	};
}

export function getPracticeSetupPlan(
	deck: Pick<Deck, "cards">,
	initialSelection?: PracticeSelection,
): PracticeSetupPlan {
	const maxQuestions = deck.cards.length;
	const maxRangeStart = Math.max(1, maxQuestions - 1);
	const defaultQuestionCount = Math.min(50, maxQuestions);
	const initialQuestionCount =
		initialSelection?.kind === "random"
			? Math.min(initialSelection.questionCount, maxQuestions)
			: defaultQuestionCount;
	const initialRangeStart =
		initialSelection?.kind === "range"
			? Math.min(Math.max(1, initialSelection.startIndex), maxRangeStart)
			: 1;
	const initialRangeEnd =
		initialSelection?.kind === "range"
			? Math.min(initialSelection.endIndex, maxQuestions)
			: defaultQuestionCount;

	return {
		maxQuestions,
		maxRangeStart,
		defaultQuestionCount,
		initialQuestionCount,
		initialRangeStart,
		initialRangeEnd,
		initialSelectionMode: initialSelection?.kind === "range" ? "range" : "random",
	};
}

export function getSpellingSetupPlan(
	deck: Pick<Deck, "cards">,
	progress: Readonly<Record<string, SpellingCardProgress>>,
	initialSelection?: SpellingSelection,
): SpellingSetupPlan {
	const stats = getSpellingDeckProgressStats(deck.cards, progress);
	const maxQuestions = stats.total;
	const defaultCount = Math.min(20, maxQuestions);
	const initialQuestionCount =
		initialSelection?.kind === "smart"
			? Math.min(initialSelection.questionCount, maxQuestions)
			: defaultCount;
	const initialRangeStart =
		initialSelection?.kind === "range"
			? Math.min(Math.max(1, initialSelection.startIndex), Math.max(1, maxQuestions))
			: 1;
	const initialRangeEnd =
		initialSelection?.kind === "range"
			? Math.min(initialSelection.endIndex, maxQuestions)
			: defaultCount;

	return {
		stats,
		maxQuestions,
		defaultCount,
		initialQuestionCount,
		initialRangeStart,
		initialRangeEnd,
		initialSelectionMode: initialSelection?.kind === "range" ? "range" : "smart",
	};
}

export * from "./practiceSessionPlanner";
export * from "./spellingSessionPlanner";
