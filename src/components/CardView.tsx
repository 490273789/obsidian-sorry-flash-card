import React, { useState, useEffect, useRef } from "react";
import { PartyPopper, RotateCcw, Target, X } from "lucide-react";
import type { Card } from "ts-fsrs";
import { Deck, FlashCard, StudySession } from "../types";
import { DataStore } from "../dataStore";
import { toFSRSRating, getRatingButtons } from "../scheduler";

// Computed once — rating button config is static
const RATING_BUTTONS = getRatingButtons();

interface CardViewProps {
	dataStore: DataStore;
	deck: Deck;
	session: StudySession;
	onSessionUpdate: (session: StudySession) => void;
	onClose: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

export const CardView: React.FC<CardViewProps> = ({
	dataStore,
	deck,
	session,
	onSessionUpdate,
	onClose,
	markdownRenderer,
}) => {
	const [showAnswer, setShowAnswer] = useState(false);
	const [currentCard, setCurrentCard] = useState<FlashCard | null>(null);
	// isAnimatingRef is the source of truth used inside callbacks/closures
	// to avoid stale captures; isAnimating state drives the CSS class.
	const isAnimatingRef = useRef(false);
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
			// Ignore if in input field
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}

			if (!showAnswer) {
				// Show answer on space
				if (e.code === "Space") {
					e.preventDefault();
					setShowAnswer(true);
				}
			} else {
				// Rating shortcuts
				switch (e.code) {
					case "Digit1":
					case "Numpad1":
						e.preventDefault();
						void handleRating(1);
						break;
					case "Digit2":
					case "Numpad2":
						e.preventDefault();
						void handleRating(2);
						break;
					case "Digit3":
					case "Numpad3":
					case "Space":
						e.preventDefault();
						void handleRating(3);
						break;
					case "Digit4":
					case "Numpad4":
						e.preventDefault();
						void handleRating(4);
						break;
					case "Digit5":
					case "Numpad5":
						e.preventDefault();
						void handleRating(5);
						break;
					case "Digit6":
					case "Numpad6":
						e.preventDefault();
						handlePrevious();
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

	const handleRating = async (rating: 1 | 2 | 3 | 4 | 5) => {
		if (!currentCard || isAnimatingRef.current) return;

		isAnimatingRef.current = true;
		setIsAnimating(true);

		const scheduler = dataStore.getScheduler();
		let updatedCard: Card;
		let repeatInSession = false;

		if (rating === 5) {
			// Custom "garbage" rating - 21 days
			updatedCard = scheduler.rateAsGarbage(currentCard.fsrsCard);
		} else {
			const result = scheduler.rateCard(
				currentCard.fsrsCard,
				toFSRSRating(rating),
			);
			updatedCard = result.card;
			repeatInSession = result.repeatInSession;
		}

		// Save updated card
		await dataStore.updateCard(deck.id, currentCard.id, updatedCard);

		// Update session
		const newSession = { ...session };
		newSession.history.push(currentCard.id);

		if (repeatInSession) {
			// Add to repeat queue for later in this session
			newSession.repeatQueue.push(currentCard.id);
		}

		// Move to next card
		if (newSession.currentIndex < newSession.cardQueue.length - 1) {
			newSession.currentIndex++;
		} else if (newSession.repeatQueue.length > 0) {
			// Process repeat queue
			newSession.cardQueue = [
				...newSession.cardQueue,
				...newSession.repeatQueue,
			];
			newSession.repeatQueue = [];
			newSession.currentIndex++;
		} else {
			// Session complete
			await dataStore.incrementStudyCount(deck.id);
			window.setTimeout(() => {
				onClose();
			}, 300);
			return;
		}

		window.setTimeout(() => {
			onSessionUpdate(newSession);
			isAnimatingRef.current = false;
			setIsAnimating(false);
		}, 200);
	};

	const handlePrevious = () => {
		if (session.history.length === 0 || isAnimatingRef.current) return;

		isAnimatingRef.current = true;
		setIsAnimating(true);

		const newSession = { ...session };
		const previousCardId = newSession.history.pop();

		if (previousCardId) {
			// Insert previous card at current position
			newSession.cardQueue = [
				...newSession.cardQueue.slice(0, newSession.currentIndex),
				previousCardId,
				...newSession.cardQueue.slice(newSession.currentIndex),
			];
		}

		window.setTimeout(() => {
			onSessionUpdate(newSession);
			isAnimatingRef.current = false;
			setIsAnimating(false);
		}, 200);
	};

	// Check if session is complete
	if (!currentCard) {
		return (
			<div className="flashcard-complete">
				<div className="flashcard-complete-icon">
					<PartyPopper size={48} />
				</div>
				<div>学习完成!</div>
				<p>本次学习时长: {formatTime(elapsedTime)}</p>
				<button
					className="flashcard-btn flashcard-btn-green"
					onClick={onClose}
				>
					Back to Deck
				</button>
			</div>
		);
	}

	const progress = `${session.currentIndex + 1} / ${session.cardQueue.length}`;

	return (
		<div className="flashcard-study">
			{/* Header */}
			<div className="flashcard-common-header">
				<div className="flashcard-header-left">
					<div className="flashcard-deck-title">{deck.name}</div>
					<div className="flashcard-progress">{progress}</div>
				</div>
				<div className="flashcard-header-center">
					<div className="flashcard-practice-badge">
						<Target size={14} /> STUDYING
					</div>
				</div>
				<div className="flashcard-header-right">
					<div className="flashcard-timer">
						{formatTime(elapsedTime)}
					</div>
					<button
						className="flashcard-btn flashcard-btn-icon"
						onClick={onClose}
						title="Close"
					>
						<X size={16} />
					</button>
				</div>
			</div>

			{/* Content */}
			<div
				className={`flashcard-content ${isAnimating ? "animating" : ""}`}
			>
				<div className="flashcard-question fc-lift">
					<div className="flashcard-label flashcard-label-question">
						Question
					</div>
					<div ref={questionRef} className="flashcard-markdown" />
				</div>

				{showAnswer && (
					<div className="flashcard-answer-section">
						<div className="flashcard-divider" />
						<div className="flashcard-answer fc-lift">
							<div className="flashcard-label flashcard-label-answer">
								Answer
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
						Show Answer
						<span className="flashcard-shortcut">(Space)</span>
					</button>
				) : (
					<div className="flashcard-response-controls">
						<button
							className="flashcard-btn flashcard-action-btn flashcard-btn-prev"
							onClick={handlePrevious}
							disabled={session.history.length === 0}
							title="Undo (6)"
						>
							<RotateCcw size={24} />
						</button>
						<div className="flashcard-rating-grid">
							{RATING_BUTTONS.map((btn) => (
								<button
									key={btn.rating}
									className={`flashcard-btn flashcard-rating-btn flashcard-rating-${btn.rating}`}
									onClick={() =>
										void handleRating(btn.rating)
									}
								>
									<span className="flashcard-rating-label">
										{btn.label}-{btn.intervalDesc}
									</span>
									<span className="flashcard-rating-interval">
										({btn.shortcut})
									</span>
								</button>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
