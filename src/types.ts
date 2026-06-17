import type { Card } from "ts-fsrs";
import {
	DEFAULT_LANGUAGE,
	DEFAULT_PRACTICE_MESSAGES,
} from "./i18n";

export type Language = "zh" | "en";

export type CardDirection = "normal" | "reversed";

/**
 * Per-deck or global study settings
 */
export interface StudySettings {
	/** Daily new cards limit */
	dailyNewCards: number;
	/** Daily review cards limit */
	dailyReviewCards: number;
	/** Study order: sequential or random */
	studyOrder: "sequential" | "random";
	/** FSRS parameters */
	fsrsParameters: {
		requestRetention: number;
		maximumInterval: number;
	};
}

/**
 * Plugin settings interface
 */
export interface FlashcardSettings extends StudySettings {
	/** Interface language */
	language: Language;
	/** Tags to scan for flashcards (each tag represents a deck) */
	flashcardTags: string[];
	/** Practice completion messages when all correct */
	practicePerfectMessages: string[];
	/** Practice completion messages when there are errors */
	practiceErrorMessages: string[];
	/** User has edited practice completion messages */
	practiceMessagesCustomized?: boolean;
	/** Per-deck study setting overrides, keyed by deck ID */
	deckStudySettings: Record<string, Partial<StudySettings>>;
}

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: FlashcardSettings = {
	language: DEFAULT_LANGUAGE,
	flashcardTags: ["#wordTag"],
	dailyNewCards: 20,
	dailyReviewCards: 100,
	studyOrder: "random",
	fsrsParameters: {
		requestRetention: 0.9,
		maximumInterval: 365,
	},
	deckStudySettings: {},
	practicePerfectMessages: DEFAULT_PRACTICE_MESSAGES.zh.perfect,
	practiceErrorMessages: DEFAULT_PRACTICE_MESSAGES.zh.error,
	practiceMessagesCustomized: false,
};

/**
 * Single flashcard data
 */
export interface FlashCard {
	/** Unique identifier */
	id: string;
	/** Front content (markdown) */
	front: string;
	/** Back content (markdown) */
	back: string;
	/** Optional explanation content (markdown), shown with the answer side */
	explanation?: string;
	/** FSRS card state */
	fsrsCard: Card;
	/** Source file path */
	sourceFile: string;
	/** Index in source file */
	indexInFile: number;
}

/**
 * Deck data structure
 */
export interface Deck {
	/** Deck ID (based on file path) */
	id: string;
	/** Deck name (extracted from file) */
	name: string;
	/** Source file path */
	filePath: string;
	/** Tag associated with this deck */
	tag: string;
	/** All cards in this deck */
	cards: FlashCard[];
	/** Total study sessions count */
	studyCount: number;
	/** Last studied date */
	lastStudied: string | null;
}

/**
 * Study session state
 */
export interface StudySession {
	/** Current deck being studied */
	deckId: string;
	/** Card display direction for this session */
	direction: CardDirection;
	/** Queue of card IDs to study */
	cardQueue: string[];
	/** Current card index in queue */
	currentIndex: number;
	/** Session start time */
	startTime: number;
	/** Cards that need to be repeated in this session */
	repeatQueue: string[];
	/** History of answered cards for "previous" function */
	history: string[];
}

/**
 * Study statistics for a deck
 */
export interface DeckStats {
	/** Total cards */
	totalCards: number;
	/** New cards (never studied) */
	newCards: number;
	/** Cards due for review */
	dueCards: number;
	/** Cards in learning state */
	learningCards: number;
	/** Cards in review state */
	reviewCards: number;
	/** Cards in relearning state */
	relearningCards: number;
}

/**
 * Rating button configuration
 */
export interface RatingButton {
	/** Button label */
	label: string;
	/** Keyboard shortcut */
	shortcut: string;
	/** Rating value (1-4 for FSRS, 5 for custom "garbage" rating) */
	rating: 1 | 2 | 3 | 4 | 5;
	/** Interval description */
	intervalDesc: string;
}

/**
 * View state for React components
 */
export type ViewState =
	| { type: "home" }
	| { type: "study-setup"; deckId: string }
	| { type: "study"; deckId: string }
	| { type: "word-list"; deckId: string }
	| { type: "practice-setup"; deckId: string }
	| { type: "practice"; deckId: string }
	| { type: "practice-summary"; deckId: string }
	| { type: "stats" };

/**
 * A single study history entry (recorded when a session ends)
 */
export interface StudyHistoryEntry {
	/** YYYY-MM-DD local date */
	date: string;
	/** Deck ID */
	deckId: string;
	/** Deck name at time of session */
	deckName: string;
	/** 'study' = Study FSRS, 'practice' = Practice, 'word-list' = List浏览 */
	mode: "study" | "practice" | "word-list";
	/** Cards reviewed (0 for word-list) */
	cardCount: number;
	/** Session duration in seconds */
	duration: number;
	/** Unix timestamp (ms) of session start */
	timestamp: number;
}

/**
 * Info about a single learning day for the day list in StudySetup
 */
export interface StudyDayInfo {
	/** 0-based day index */
	dayIndex: number;
	/** Inclusive start index in sorted cards array */
	startCardIndex: number;
	/** Exclusive end index in sorted cards array */
	endCardIndex: number;
	/** Total cards in this day */
	totalCards: number;
	/** Number of cards already studied (not State.New) */
	studiedCards: number;
	/** All cards in this day have been studied */
	isCompleted: boolean;
	/** This is the first incomplete day */
	isCurrent: boolean;
	/** Day is after the current day — not yet unlocked */
	isLocked: boolean;
}

/**
 * Practice session state (for practice mode without FSRS)
 */
export interface PracticeSession {
	/** Current deck being practiced */
	deckId: string;
	/** Card display direction for this session */
	direction: CardDirection;
	/** Queue of card IDs to practice (randomized) */
	cardQueue: string[];
	/** Current card index in queue */
	currentIndex: number;
	/** Session start time */
	startTime: number;
	/** Total number of questions selected */
	totalQuestions: number;
	/** Record of user answers: cardId -> isCorrect */
	answers: Record<string, boolean>;
}

/**
 * Practice result for summary display
 */
export interface PracticeResult {
	/** Card display direction used for this practice run */
	direction: CardDirection;
	/** Total questions answered */
	totalQuestions: number;
	/** Number of correct answers */
	correctCount: number;
	/** Number of incorrect answers */
	incorrectCount: number;
	/** Accuracy percentage */
	accuracy: number;
	/** List of incorrectly answered card IDs */
	incorrectCardIds: string[];
	/** Total time spent (in seconds) */
	timeSpent: number;
}

/**
 * Card state after rating
 */
export interface CardRatingResult {
	card: FlashCard;
	repeatInSession: boolean;
}
