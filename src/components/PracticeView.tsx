import React, { useState, useEffect, useRef } from "react";
import { Target, X, Check } from "lucide-react";
import { Deck, FlashCard, PracticeSession, PracticeResult } from "../types";
import { DataStore } from "../dataStore";

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
	const [currentCard, setCurrentCard] = useState<FlashCard | null>(null);
	const [isAnimating, setIsAnimating] = useState(false);
	const [elapsedTime, setElapsedTime] = useState(0);
	const questionRef = useRef<HTMLDivElement>(null);
	const answerRef = useRef<HTMLDivElement>(null);

	// Get current card
	useEffect(() => {
		const cardId = session.cardQueue[session.currentIndex];
		if (cardId) {
			const card = dataStore.getCard(deck.id, cardId);
			setCurrentCard(card || null);
			setShowAnswer(false);
		} else {
			setCurrentCard(null);
		}
	}, [session.currentIndex, session.cardQueue, dataStore, deck.id]);

	// Render markdown
	useEffect(() => {
		if (currentCard && questionRef.current) {
			questionRef.current.innerHTML = "";
			void markdownRenderer(currentCard.question, questionRef.current);
		}
	}, [currentCard?.question, markdownRenderer]);

	useEffect(() => {
		if (currentCard && showAnswer && answerRef.current) {
			answerRef.current.innerHTML = "";
			void markdownRenderer(currentCard.answer, answerRef.current);
		}
	}, [currentCard?.answer, showAnswer, markdownRenderer]);

	// Timer
	useEffect(() => {
		const interval = window.setInterval(() => {
			setElapsedTime(Math.floor((Date.now() - session.startTime) / 1000));
		}, 1000);
		return () => window.clearInterval(interval);
	}, [session.startTime]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
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
			} else {
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
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [showAnswer, currentCard, session]);

	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const handleShowAnswer = () => {
		setShowAnswer(true);
	};

	const handleAnswer = (isCorrect: boolean) => {
		if (!currentCard || isAnimating) return;

		setIsAnimating(true);

		// Update session with answer
		const newSession = { ...session };
		newSession.answers = {
			...newSession.answers,
			[currentCard.id]: isCorrect,
		};

		// Move to next card
		if (newSession.currentIndex < newSession.cardQueue.length - 1) {
			newSession.currentIndex++;
			window.setTimeout(() => {
				onSessionUpdate(newSession);
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
	};

	if (!currentCard) {
		return (
			<div className="flashcard-complete">
				<div className="flashcard-complete-icon">⏳</div>
				<h2>加载中...</h2>
			</div>
		);
	}

	const progress = `${session.currentIndex + 1}/${session.totalQuestions}`;
	const progressPercent =
		((session.currentIndex + 1) / session.totalQuestions) * 100;

	return (
		<div className="flashcard-study flashcard-practice">
			{/* Header */}
			<div className="flashcard-study-header">
				<div className="flashcard-study-info">
					<span className="flashcard-deck-title">{deck.name}</span>
					<span className="flashcard-progress">{progress}</span>
				</div>
				<div className="flashcard-study-center">
					<span className="flashcard-practice-badge">
						<Target size={14} /> 装杯模式
					</span>
				</div>
				<div className="flashcard-study-meta">
					<span className="flashcard-timer">
						{formatTime(elapsedTime)}
					</span>
					<button
						className="flashcard-btn flashcard-btn-close"
						onClick={onClose}
						title="退出刷题"
					>
						<X size={16} />
					</button>
				</div>
			</div>

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
						问题
					</div>
					<div ref={questionRef} className="flashcard-markdown" />
				</div>

				{showAnswer && (
					<div className="flashcard-answer-section">
						<div className="flashcard-divider" />
						<div className="flashcard-answer">
							<div className="flashcard-label flashcard-label-answer">
								答案
							</div>
							<div
								ref={answerRef}
								className="flashcard-markdown"
							/>
						</div>
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="flashcard-footer">
				{!showAnswer ? (
					<button
						className="flashcard-btn flashcard-btn-green flashcard-btn-show"
						onClick={handleShowAnswer}
					>
						显示答案
						<span className="flashcard-shortcut">空格</span>
					</button>
				) : (
					<div className="flashcard-practice-answer-buttons">
						<button
							className="flashcard-btn flashcard-practice-btn flashcard-practice-btn-wrong"
							onClick={() => handleAnswer(false)}
						>
							<span className="flashcard-practice-btn-icon">
								<X size={18} />
							</span>
							<span className="flashcard-practice-btn-label">
								拉垮
							</span>
							<span className="flashcard-shortcut">1 / X</span>
						</button>
						<button
							className="flashcard-btn flashcard-practice-btn flashcard-practice-btn-correct"
							onClick={() => handleAnswer(true)}
						>
							<span className="flashcard-practice-btn-icon">
								<Check size={18} />
							</span>
							<span className="flashcard-practice-btn-label">
								夯
							</span>
							<span className="flashcard-shortcut">2 / O</span>
						</button>
					</div>
				)}
			</div>
		</div>
	);
};
