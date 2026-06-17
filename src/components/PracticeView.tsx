import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { RotateCcw, Target, X, Check } from "lucide-react";
import { Deck, FlashCard, PracticeSession, PracticeResult } from "../types";
import { DataStore } from "../dataStore";
import { getDisplayCardContent } from "../cardDisplay";
import { FlashcardButton } from "./FlashcardButton";
import { MarkdownContent } from "./MarkdownContent";
import { SessionToolbar } from "./SessionToolbar";
import { useWindowKeyDown } from "./hooks";
import { useI18n } from "./I18nContext";

interface PracticeViewProps {
	dataStore: DataStore;
	deck: Deck;
	session: PracticeSession;
	contentVersion: number;
	onSessionUpdate: (session: PracticeSession) => void;
	onEditCard: (deckId: string, cardId: string) => void;
	onDeleteCard: (deckId: string, cardId: string) => void;
	onComplete: (result: PracticeResult) => void;
	onClose: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

function normalizeStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function normalizeAnswerMap(value: unknown): Record<string, boolean> {
	if (!value || typeof value !== "object") return {};

	const answers: Record<string, boolean> = {};
	for (const [cardId, answer] of Object.entries(value)) {
		if (typeof answer === "boolean") {
			answers[cardId] = answer;
		}
	}
	return answers;
}

function normalizeDirection(
	value: unknown,
): PracticeSession["direction"] {
	return value === "reversed" ? "reversed" : "normal";
}

export const PracticeView: React.FC<PracticeViewProps> = ({
	dataStore,
	deck,
	session,
	contentVersion,
	onSessionUpdate,
	onEditCard,
	onDeleteCard,
	onComplete,
	onClose,
	markdownRenderer,
}) => {
	const { t } = useI18n();
	const [showAnswer, setShowAnswer] = useState(false);
	const isAnimatingRef = useRef(false);
	const [isAnimating, setIsAnimating] = useState(false);

	const currentCard = useMemo<FlashCard | null>(() => {
		const cardId = session.cardQueue[session.currentIndex];
		return cardId ? (dataStore.getCard(deck.id, cardId) ?? null) : null;
	}, [
		contentVersion,
		session.currentIndex,
		session.cardQueue,
		dataStore,
		deck.id,
	]);
	const direction = normalizeDirection(session.direction);
	const displayContent = useMemo(
		() =>
			currentCard
				? getDisplayCardContent(currentCard, direction)
				: null,
		[currentCard, direction],
	);

	useEffect(() => {
		setShowAnswer(false);
	}, [currentCard?.id]);

	const handleShowAnswer = useCallback(() => {
		setShowAnswer(true);
	}, []);

	const handleAnswer = useCallback((isCorrect: boolean) => {
		if (!currentCard || isAnimatingRef.current) return;

		isAnimatingRef.current = true;
		setIsAnimating(true);

		const cardQueue = normalizeStringArray(session.cardQueue);
		const history = normalizeStringArray(session.history);
		const answers = normalizeAnswerMap(session.answers);

		// Update session with answer
		const newSession: PracticeSession = {
			...session,
			direction,
			cardQueue: cardQueue.slice(),
			history: history.concat(currentCard.id),
			answers: {
				...answers,
				[currentCard.id]: isCorrect,
			},
		};

		// Move to next card
		if (newSession.currentIndex < newSession.cardQueue.length - 1) {
			newSession.currentIndex++;
			window.setTimeout(() => {
				onSessionUpdate(newSession);
				isAnimatingRef.current = false;
				setIsAnimating(false);
			}, 200);
		} else {
			// Practice complete - calculate results
			const incorrectCardIds = Object.entries(newSession.answers)
				.filter(([, correct]) => !correct)
				.map(([cardId]) => cardId);

			const correctCount = Object.values(newSession.answers).filter(
				(v) => v,
			).length;
			const incorrectCount = newSession.totalQuestions - correctCount;
			const accuracy =
				newSession.totalQuestions > 0
					? (correctCount / newSession.totalQuestions) * 100
					: 0;

			const result: PracticeResult = {
				direction,
				totalQuestions: newSession.totalQuestions,
				correctCount,
				incorrectCount,
				accuracy,
				incorrectCardIds,
				timeSpent: Math.floor((Date.now() - session.startTime) / 1000),
			};

			window.setTimeout(() => {
				onComplete(result);
			}, 300);
		}
	}, [currentCard, direction, onComplete, onSessionUpdate, session]);

	const handlePrevious = useCallback(() => {
		if (session.currentIndex === 0 || isAnimatingRef.current) return;

		isAnimatingRef.current = true;
		setIsAnimating(true);

		const cardQueue = normalizeStringArray(session.cardQueue);
		const history = normalizeStringArray(session.history);
		const previousIndex = session.currentIndex - 1;
		const previousCardId = cardQueue[previousIndex];
		const nextAnswers = normalizeAnswerMap(session.answers);
		if (previousCardId) {
			delete nextAnswers[previousCardId];
		}

		const nextHistory = history.slice();
		nextHistory.pop();

		const newSession: PracticeSession = {
			...session,
			direction,
			currentIndex: previousIndex,
			answers: nextAnswers,
			history: nextHistory,
		};

		window.setTimeout(() => {
			onSessionUpdate(newSession);
			isAnimatingRef.current = false;
			setIsAnimating(false);
		}, 200);
	}, [direction, onSessionUpdate, session]);

	useWindowKeyDown((e) => {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement
		) {
			return;
		}

		if (!showAnswer) {
			if (e.code === "Space") {
				e.preventDefault();
				setShowAnswer(true);
			}
			return;
		}

		switch (e.code) {
			case "Digit1":
			case "Numpad1":
			case "KeyX":
				e.preventDefault();
				handleAnswer(false);
				break;
			case "Digit2":
			case "Numpad2":
			case "KeyO":
			case "Space":
				e.preventDefault();
				handleAnswer(true);
				break;
			case "Digit6":
			case "Numpad6":
				e.preventDefault();
				handlePrevious();
				break;
		}
	});

	if (!currentCard) {
		return (
			<div className="flashcard-complete">
				<div className="flashcard-complete-icon">⏳</div>
				<div>{t("common.loading")}</div>
			</div>
		);
	}

	const progress = `${session.currentIndex + 1}/${session.totalQuestions}`;
	const progressPercent =
		((session.currentIndex + 1) / session.totalQuestions) * 100;
	const directionLabel =
		direction === "normal"
			? t("mode.normalShort")
			: t("mode.reversedShort");

	return (
		<div className="flashcard-study">
			{/* Header */}
			<SessionToolbar
				deckName={deck.name}
				statusIcon={Target}
				statusLabel={`${t("practice.practicing")} · ${directionLabel}`}
				progress={progress}
				progressPercent={progressPercent}
				startTime={session.startTime}
				onEdit={() => onEditCard(deck.id, currentCard.id)}
				onDelete={() => onDeleteCard(deck.id, currentCard.id)}
				onClose={onClose}
				editTitle={t("cardEditor.editCurrentTitle")}
				deleteTitle={t("cardEditor.deleteCurrentTitle")}
				closeTitle={t("practice.exitTitle")}
			/>

			{/* Content */}
			<div
				className={`flashcard-content ${isAnimating ? "animating" : ""}`}
			>
				<div className="flashcard-question">
					<div className="flashcard-label flashcard-label-question">
						{t("common.question")}
					</div>
					<MarkdownContent
						content={displayContent?.prompt ?? ""}
						className="flashcard-markdown"
						markdownRenderer={markdownRenderer}
					/>
				</div>

				{showAnswer && (
					<div className="flashcard-answer-section">
						<div className="flashcard-divider" />
						<div className="flashcard-answer">
							<div className="flashcard-label flashcard-label-answer">
								{t("common.answer")}
							</div>
							<MarkdownContent
								content={displayContent?.answer ?? ""}
								className="flashcard-markdown"
								markdownRenderer={markdownRenderer}
							/>
						</div>
						{displayContent?.explanation && (
							<div className="flashcard-explanation">
								<div className="flashcard-label flashcard-label-explanation">
									{t("common.explanation")}
								</div>
								<MarkdownContent
									content={displayContent.explanation}
									className="flashcard-markdown"
									markdownRenderer={markdownRenderer}
								/>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="flashcard-footer">
				{!showAnswer ? (
					<FlashcardButton preset="show" onClick={handleShowAnswer}>
						{t("common.showAnswer")}
						<span className="flashcard-shortcut">
							({t("common.space")})
						</span>
					</FlashcardButton>
				) : (
					<div className="flashcard-practice-response-controls">
						<FlashcardButton
							preset="prev"
							icon={RotateCcw}
							iconSize={24}
							onClick={handlePrevious}
							disabled={session.currentIndex === 0}
							title={`${t("common.undo")} (6)`}
						/>
						<div className="flashcard-practice-answer-buttons">
							<FlashcardButton
								preset="practice-wrong"
								onClick={() => handleAnswer(false)}
							>
								<span className="flashcard-practice-btn-icon">
									<X size={18} />
								</span>
								<span className="flashcard-practice-btn-label">
									{t("practice.bad")}
								</span>
								<span className="flashcard-shortcut">
									{t("practice.badShortcut")}
								</span>
							</FlashcardButton>
							<FlashcardButton
								preset="practice-correct"
								onClick={() => handleAnswer(true)}
							>
								<span className="flashcard-practice-btn-icon">
									<Check size={18} />
								</span>
								<span className="flashcard-practice-btn-label">
									{t("practice.good")}
								</span>
								<span className="flashcard-shortcut">
									{t("practice.goodShortcut")}
								</span>
							</FlashcardButton>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
