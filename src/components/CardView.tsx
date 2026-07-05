import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, PartyPopper, RotateCcw } from "lucide-react";
import { Deck, FlashCard, StudySession } from "../types";
import { DataStore } from "../dataStore";
import { getRatingButtons } from "../scheduler";
import { getDisplayCardContent } from "../cardDisplay";
import {
	answerStudyCard,
	canUndoStudyAnswer,
	getCurrentStudyCardId,
	getStudyProgress,
	undoStudyAnswer,
	type StudySessionFinishIntent,
} from "../sessionEngine";
import { FlashcardButton } from "./FlashcardButton";
import { MarkdownContent } from "./MarkdownContent";
import { SessionToolbar } from "./SessionToolbar";
import { SessionTimer } from "./SessionTimer";
import { useWindowKeyDown } from "./hooks";
import { useI18n } from "./I18nContext";

interface CardViewProps {
	dataStore: DataStore;
	deck: Deck;
	session: StudySession;
	contentVersion: number;
	onSessionUpdate: (session: StudySession) => void;
	onComplete: (intent: StudySessionFinishIntent) => void | Promise<void>;
	onEditCard: (deckId: string, cardId: string) => void;
	onDeleteCard: (deckId: string, cardId: string) => void;
	onClose: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

export const CardView: React.FC<CardViewProps> = ({
	dataStore,
	deck,
	session,
	onSessionUpdate,
	onComplete,
	onEditCard,
	onDeleteCard,
	onClose,
	markdownRenderer,
}) => {
	const { t, language } = useI18n();
	const [showAnswer, setShowAnswer] = useState(false);
	// isAnimatingRef is the source of truth used inside callbacks/closures
	// to avoid stale captures; isAnimating state drives the CSS class.
	const isAnimatingRef = useRef(false);
	const [isAnimating, setIsAnimating] = useState(false);

	const currentCardId = getCurrentStudyCardId(session);
	const currentCard: FlashCard | null = currentCardId
		? (dataStore.getCard(deck.id, currentCardId) ?? null)
		: null;
	const ratingButtons = useMemo(() => getRatingButtons(language), [language]);
	const displayContent = useMemo(
		() => (currentCard ? getDisplayCardContent(currentCard, session.direction) : null),
		[currentCard, session.direction],
	);

	useEffect(() => {
		setShowAnswer(false);
	}, [currentCard?.id, session.currentIndex]);

	const handleShowAnswer = useCallback(() => {
		setShowAnswer(true);
	}, []);

	const handleRating = useCallback(
		async (rating: 1 | 2 | 3 | 4 | 5) => {
			if (!currentCard || isAnimatingRef.current) return;

			isAnimatingRef.current = true;
			setIsAnimating(true);

			const step = answerStudyCard({
				session,
				card: currentCard,
				rating,
				scheduler: dataStore,
			});
			await dataStore.updateCard(deck.id, step.cardUpdate.cardId, step.cardUpdate.fsrsCard);

			if (step.type === "complete") {
				window.setTimeout(() => {
					void onComplete(step.finishIntent);
				}, 300);
				return;
			}

			window.setTimeout(() => {
				onSessionUpdate(step.session);
				isAnimatingRef.current = false;
				setIsAnimating(false);
			}, 200);
		},
		[currentCard, dataStore, deck.id, onComplete, onSessionUpdate, session],
	);

	const handlePrevious = useCallback(async () => {
		if (!canUndoStudyAnswer(session) || isAnimatingRef.current) return;

		isAnimatingRef.current = true;
		setIsAnimating(true);

		const step = undoStudyAnswer(session);
		if (!step) {
			isAnimatingRef.current = false;
			setIsAnimating(false);
			return;
		}

		await dataStore.updateCard(deck.id, step.cardUpdate.cardId, step.cardUpdate.fsrsCard);

		window.setTimeout(() => {
			onSessionUpdate(step.session);
			isAnimatingRef.current = false;
			setIsAnimating(false);
		}, 200);
	}, [dataStore, deck.id, onSessionUpdate, session]);

	useWindowKeyDown((e) => {
		// Ignore if in input field
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		if (!showAnswer) {
			// Show answer on space
			if (e.code === "Space") {
				e.preventDefault();
				setShowAnswer(true);
			}
			return;
		}

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
				void handlePrevious();
				break;
		}
	});

	// Check if session is complete
	if (!currentCard) {
		return (
			<div className="flashcard-complete">
				<div className="flashcard-complete-icon">
					<PartyPopper size={48} />
				</div>
				<div>{t("study.complete")}</div>
				<p>
					{t("study.duration")}
					<SessionTimer startTime={session.startTime} />
				</p>
				<FlashcardButton variant="green" onClick={onClose}>
					{t("study.backToDeck")}
				</FlashcardButton>
			</div>
		);
	}

	const progress = getStudyProgress(session);
	const directionLabel =
		session.direction === "normal" ? t("mode.normalShort") : t("mode.reversedShort");

	return (
		<div className="flashcard-study">
			{/* Header */}
			<SessionToolbar
				deckName={deck.name}
				statusIcon={Brain}
				statusLabel={`${t("study.studying")} · ${directionLabel}`}
				progress={progress.label}
				progressPercent={progress.percent}
				startTime={session.startTime}
				onEdit={() => onEditCard(deck.id, currentCard.id)}
				onDelete={() => onDeleteCard(deck.id, currentCard.id)}
				onClose={onClose}
				editTitle={t("cardEditor.editCurrentTitle")}
				deleteTitle={t("cardEditor.deleteCurrentTitle")}
				closeTitle={t("common.close")}
			/>

			{/* Content */}
			<div className={`flashcard-content ${isAnimating ? "animating" : ""}`}>
				<div className="flashcard-question fc-lift">
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
						<div className="flashcard-answer fc-lift">
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
							<div className="flashcard-explanation fc-lift">
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
						<span className="flashcard-shortcut">({t("common.space")})</span>
					</FlashcardButton>
				) : (
					<div className="flashcard-response-controls">
						<FlashcardButton
							preset="prev"
							icon={RotateCcw}
							iconSize={24}
							onClick={handlePrevious}
							disabled={!canUndoStudyAnswer(session)}
							title={`${t("common.undo")} (6)`}
						/>
						<div className="flashcard-rating-grid">
							{ratingButtons.map((btn) => (
								<FlashcardButton
									key={btn.rating}
									preset="rating"
									className={`flashcard-rating-${btn.rating}`}
									onClick={() => void handleRating(btn.rating)}
								>
									<span className="flashcard-rating-label">
										{btn.label}-{btn.intervalDesc}
									</span>
									<span className="flashcard-rating-interval">
										({btn.shortcut})
									</span>
								</FlashcardButton>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
