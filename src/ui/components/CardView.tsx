import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, PartyPopper, RotateCcw } from "lucide-react";
import { Notice } from "obsidian";
import { StudyRating } from "../../shared/types";
import { getRatingButtons } from "../../sessions/scheduler";
import { getDisplayCardContent } from "../../cards/cardDisplay";
import type { ActiveStudySnapshot, SessionLifecycle } from "../../sessions/sessionLifecycle";
import { FlashcardButton } from "./FlashcardButton";
import { MarkdownContent } from "./MarkdownContent";
import { SessionToolbar } from "./SessionToolbar";
import { SessionTimer } from "./SessionTimer";
import { useWindowKeyDown } from "./hooks";
import { useI18n } from "./I18nContext";
import type { PronunciationRuntime } from "../../pronunciation";
import { extractSpellingWord } from "../../cards/spellingWord";
import { PronounceableMarkdown } from "./PronounceableMarkdown";

interface CardViewProps {
	lifecycle: SessionLifecycle;
	session: ActiveStudySnapshot;
	holdPresentation: () => () => void;
	onComplete: () => void;
	onEditCard: (deckId: string, cardId: string) => void;
	onDeleteCard: (deckId: string, cardId: string) => void;
	onClose: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
	pronunciationRuntime: PronunciationRuntime;
	pronunciationEnabled: boolean;
}

export const CardView: React.FC<CardViewProps> = ({
	lifecycle,
	session,
	holdPresentation,
	onComplete,
	onEditCard,
	onDeleteCard,
	onClose,
	markdownRenderer,
	pronunciationRuntime,
	pronunciationEnabled,
}) => {
	const { t, language } = useI18n();
	const [showAnswer, setShowAnswer] = useState(false);
	// isAnimatingRef is the source of truth used inside callbacks/closures
	// to avoid stale captures; isAnimating state drives the CSS class.
	const isAnimatingRef = useRef(false);
	const [isAnimating, setIsAnimating] = useState(false);
	const pendingPresentationReleaseRef = useRef<(() => void) | null>(null);

	const currentCard = session.currentCard;
	const ratingButtons = useMemo(() => getRatingButtons(language), [language]);
	const displayContent = useMemo(
		() => (currentCard ? getDisplayCardContent(currentCard, session.direction) : null),
		[currentCard, session.direction],
	);
	const pronunciationWord =
		pronunciationEnabled && currentCard ? extractSpellingWord(currentCard.front) : null;

	useEffect(() => {
		pronunciationRuntime.stop();
		setShowAnswer(false);
		return () => pronunciationRuntime.stop();
	}, [currentCard.identity, pronunciationRuntime]);

	useEffect(
		() => () => {
			pendingPresentationReleaseRef.current?.();
			pendingPresentationReleaseRef.current = null;
		},
		[],
	);

	const handleShowAnswer = useCallback(() => {
		setShowAnswer(true);
	}, []);

	const handleRating = useCallback(
		async (rating: StudyRating) => {
			if (!currentCard || isAnimatingRef.current) return;

			isAnimatingRef.current = true;
			setIsAnimating(true);
			const releasePresentation = holdPresentation();
			pendingPresentationReleaseRef.current = releasePresentation;

			const outcome = await lifecycle.act(session.reference, { kind: "answer", rating });
			if (outcome.kind !== "applied") {
				releasePresentation();
				pendingPresentationReleaseRef.current = null;
				isAnimatingRef.current = false;
				setIsAnimating(false);
				if (outcome.kind === "failed") new Notice(outcome.failure.message);
				return;
			}
			if (outcome.snapshot.kind === "idle") onComplete();
			window.setTimeout(
				() => {
					releasePresentation();
					pendingPresentationReleaseRef.current = null;
					isAnimatingRef.current = false;
					setIsAnimating(false);
				},
				outcome.snapshot.kind === "idle" ? 300 : 200,
			);
		},
		[currentCard, holdPresentation, lifecycle, onComplete, session],
	);

	const handlePrevious = useCallback(async () => {
		if (!session.canPrevious || isAnimatingRef.current) return;

		isAnimatingRef.current = true;
		setIsAnimating(true);
		const releasePresentation = holdPresentation();
		pendingPresentationReleaseRef.current = releasePresentation;

		const outcome = await lifecycle.act(session.reference, { kind: "previous" });
		if (outcome.kind !== "applied") {
			releasePresentation();
			pendingPresentationReleaseRef.current = null;
			isAnimatingRef.current = false;
			setIsAnimating(false);
			if (outcome.kind === "failed") new Notice(outcome.failure.message);
			return;
		}

		window.setTimeout(() => {
			releasePresentation();
			pendingPresentationReleaseRef.current = null;
			isAnimatingRef.current = false;
			setIsAnimating(false);
		}, 200);
	}, [holdPresentation, lifecycle, session]);

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

	const progress = session.progress;
	const directionLabel =
		session.direction === "normal" ? t("mode.normalShort") : t("mode.reversedShort");

	return (
		<div className="flashcard-study">
			{/* Header */}
			<SessionToolbar
				deckName={session.originDeck.name}
				statusIcon={Brain}
				statusLabel={`${t("study.studying")} · ${directionLabel}`}
				progress={progress.label}
				progressPercent={progress.percent}
				startTime={session.startTime}
				onEdit={() => onEditCard(currentCard.currentDeckId, currentCard.identity)}
				onDelete={() => onDeleteCard(currentCard.currentDeckId, currentCard.identity)}
				onClose={onClose}
				editTitle={t("cardEditor.editCurrentTitle")}
				deleteTitle={t("cardEditor.deleteCurrentTitle")}
				closeTitle={t("common.close")}
			/>

			{/* Content */}
			<div className={`flashcard-content ${isAnimating ? "animating" : ""}`}>
				<div className="flashcard-card-stack">
					<div className="flashcard-question">
						<div className="flashcard-label flashcard-label-question">
							{t("common.question")}
						</div>
						{session.direction === "normal" && pronunciationWord ? (
							<PronounceableMarkdown
								content={displayContent?.prompt ?? ""}
								word={pronunciationWord}
								runtime={pronunciationRuntime}
								markdownRenderer={markdownRenderer}
							/>
						) : (
							<MarkdownContent
								content={displayContent?.prompt ?? ""}
								className="flashcard-markdown"
								markdownRenderer={markdownRenderer}
							/>
						)}
					</div>

					{showAnswer && (
						<div className="flashcard-answer-section">
							<div className="flashcard-divider" />
							<div className="flashcard-answer">
								<div className="flashcard-label flashcard-label-answer">
									{t("common.answer")}
								</div>
								{session.direction === "reversed" && pronunciationWord ? (
									<PronounceableMarkdown
										content={displayContent?.answer ?? ""}
										word={pronunciationWord}
										runtime={pronunciationRuntime}
										markdownRenderer={markdownRenderer}
									/>
								) : (
									<MarkdownContent
										content={displayContent?.answer ?? ""}
										className="flashcard-markdown"
										markdownRenderer={markdownRenderer}
									/>
								)}
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
							disabled={!session.canPrevious}
							title={`${t("common.undo")} (6)`}
						/>
						<div className="flashcard-rating-grid">
							{ratingButtons.map((btn) => (
								<FlashcardButton
									key={btn.rating}
									preset="rating"
									className={`flashcard-rating-${btn.rating}`}
									onClick={() => void handleRating(btn.rating)}
									aria-label={`${btn.label}，${btn.intervalDesc}，${btn.shortcut}`}
								>
									<span className="flashcard-rating-meta">
										<span className="flashcard-rating-label">{btn.label}</span>
										<span className="flashcard-rating-interval">
											{btn.shortcut}
										</span>
									</span>
									<span className="flashcard-rating-duration">
										{btn.intervalDesc}
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
