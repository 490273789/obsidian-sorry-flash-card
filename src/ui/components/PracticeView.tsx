import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Target, X, Check } from "lucide-react";
import { Deck, FlashCard, PracticeSession, PracticeResult } from "../../shared/types";
import { DataStore } from "../../storage/dataStore";
import { getDisplayCardContent } from "../../cards/cardDisplay";
import { answerPracticeCard, previousPracticeCard } from "../../sessions/sessionEngine";
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
	}, [contentVersion, session.currentIndex, session.cardQueue, dataStore, deck.id]);
	const displayContent = useMemo(
		() => (currentCard ? getDisplayCardContent(currentCard, session.direction) : null),
		[currentCard, session.direction],
	);

	useEffect(() => {
		setShowAnswer(false);
	}, [currentCard?.id]);

	const handleShowAnswer = useCallback(() => {
		setShowAnswer(true);
	}, []);

	const handleAnswer = useCallback(
		(isCorrect: boolean) => {
			if (!currentCard || isAnimatingRef.current) return;

			isAnimatingRef.current = true;
			setIsAnimating(true);

			const step = answerPracticeCard({
				session,
				cardId: currentCard.id,
				isCorrect,
				now: Date.now(),
			});

			if (step.type === "continue") {
				window.setTimeout(() => {
					onSessionUpdate(step.session);
					isAnimatingRef.current = false;
					setIsAnimating(false);
				}, 200);
			} else {
				window.setTimeout(() => {
					onComplete(step.result);
				}, 300);
			}
		},
		[currentCard, onComplete, onSessionUpdate, session],
	);

	const handlePrevious = useCallback(() => {
		if (session.currentIndex === 0 || isAnimatingRef.current) return;

		isAnimatingRef.current = true;
		setIsAnimating(true);

		const newSession = previousPracticeCard(session);
		if (!newSession) {
			isAnimatingRef.current = false;
			setIsAnimating(false);
			return;
		}

		window.setTimeout(() => {
			onSessionUpdate(newSession);
			isAnimatingRef.current = false;
			setIsAnimating(false);
		}, 200);
	}, [onSessionUpdate, session]);

	useWindowKeyDown((e) => {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
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
	const progressPercent = ((session.currentIndex + 1) / session.totalQuestions) * 100;
	const directionLabel =
		session.direction === "normal" ? t("mode.normalShort") : t("mode.reversedShort");

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
			<div className={`flashcard-content ${isAnimating ? "animating" : ""}`}>
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
						<span className="flashcard-shortcut">({t("common.space")})</span>
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
