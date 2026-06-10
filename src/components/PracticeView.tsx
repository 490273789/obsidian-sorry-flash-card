import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Target, X, Check } from "lucide-react";
import { Deck, FlashCard, PracticeSession, PracticeResult } from "../types";
import { DataStore } from "../dataStore";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardHeader } from "./FlashcardHeader";
import { MarkdownContent } from "./MarkdownContent";
import { SessionTimer } from "./SessionTimer";
import { useWindowKeyDown } from "./hooks";

interface PracticeViewProps {
	dataStore: DataStore;
	deck: Deck;
	session: PracticeSession;
	onSessionUpdate: (session: PracticeSession) => void;
	onComplete: (result: PracticeResult) => void;
	onClose: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

export const PracticeView: React.FC<PracticeViewProps> = ({
	dataStore,
	deck,
	session,
	onSessionUpdate,
	onComplete,
	onClose,
	markdownRenderer,
}) => {
	const [showAnswer, setShowAnswer] = useState(false);
	const isAnimatingRef = useRef(false);
	const [isAnimating, setIsAnimating] = useState(false);

	const currentCard = useMemo<FlashCard | null>(() => {
		const cardId = session.cardQueue[session.currentIndex];
		return cardId ? (dataStore.getCard(deck.id, cardId) ?? null) : null;
	}, [session.currentIndex, session.cardQueue, dataStore, deck.id]);

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

		// Update session with answer
		const newSession: PracticeSession = {
			...session,
			cardQueue: [...session.cardQueue],
			answers: {
				...session.answers,
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
	}, [currentCard, onComplete, onSessionUpdate, session]);

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
		}
	});

	if (!currentCard) {
		return (
			<div className="flashcard-complete">
				<div className="flashcard-complete-icon">⏳</div>
				<div>加载中...</div>
			</div>
		);
	}

	const progress = `${session.currentIndex + 1}/${session.totalQuestions}`;
	const progressPercent =
		((session.currentIndex + 1) / session.totalQuestions) * 100;

	return (
		<div className="flashcard-study">
			{/* Header */}
			<FlashcardHeader
				left={
					<>
						<span className="flashcard-deck-title">
							{deck.name}
						</span>
						<span className="flashcard-progress">{progress}</span>
					</>
				}
				title={
					<span className="flashcard-badge">
						<Target size={14} /> Practice
					</span>
				}
				right={
					<>
						<SessionTimer
							startTime={session.startTime}
							className="flashcard-timer"
						/>
						<FlashcardButton
							preset="icon"
							icon={X}
							onClick={onClose}
							title="退出刷题"
						/>
					</>
				}
			/>

			{/* Progress Bar */}
			<div className="flashcard-practice-progress-bar">
				<div
					className="flashcard-practice-progress-fill"
					style={{ width: `${progressPercent}%` }}
				/>
			</div>

			{/* Content */}
			<div
				className={`flashcard-content ${isAnimating ? "animating" : ""}`}
			>
				<div className="flashcard-question">
					<div className="flashcard-label flashcard-label-question">
						Question
					</div>
					<MarkdownContent
						content={currentCard.question}
						className="flashcard-markdown"
						markdownRenderer={markdownRenderer}
					/>
				</div>

				{showAnswer && (
					<div className="flashcard-answer-section">
						<div className="flashcard-divider" />
						<div className="flashcard-answer">
							<div className="flashcard-label flashcard-label-answer">
								Answer
							</div>
							<MarkdownContent
								content={currentCard.answer}
								className="flashcard-markdown"
								markdownRenderer={markdownRenderer}
							/>
						</div>
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="flashcard-footer">
				{!showAnswer ? (
					<FlashcardButton preset="show" onClick={handleShowAnswer}>
						Show Answer
						<span className="flashcard-shortcut">(Space)</span>
					</FlashcardButton>
				) : (
					<div className="flashcard-practice-answer-buttons">
						<FlashcardButton
							preset="practice-wrong"
							onClick={() => handleAnswer(false)}
						>
							<span className="flashcard-practice-btn-icon">
								<X size={18} />
							</span>
							<span className="flashcard-practice-btn-label">
								Bad
							</span>
							<span className="flashcard-shortcut">(1 or X)</span>
						</FlashcardButton>
						<FlashcardButton
							preset="practice-correct"
							onClick={() => handleAnswer(true)}
						>
							<span className="flashcard-practice-btn-icon">
								<Check size={18} />
							</span>
							<span className="flashcard-practice-btn-label">
								Good
							</span>
							<span className="flashcard-shortcut">(2 or O)</span>
						</FlashcardButton>
					</div>
				)}
			</div>
		</div>
	);
};
