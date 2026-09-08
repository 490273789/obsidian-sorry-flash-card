import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, PartyPopper, RotateCcw } from "lucide-react";
import { Notice } from "obsidian";
import { StudyRating } from "../../../shared/types";
import { getRatingButtons } from "../../../sessions/scheduler";
import { getDisplayCardContent } from "../../../cards/cardDisplay";
import type { ActiveStudySnapshot } from "../../../sessions/sessionLifecycle";
import type { AnswerPresentationTransition } from "../../answerPresentationTransition";
import { FlashcardButton } from "../../primitives/Button";
import { MarkdownContent, PronounceableMarkdown } from "../../primitives/Markdown";
import { SessionToolbar } from "../../primitives/SessionToolbar";
import { SessionTimer } from "../../primitives/SessionTimer";
import { useWindowKeyDown } from "../../hooks/hooks";
import { useI18n } from "../../context/I18nContext";
import { shouldAutoPronounceSessionCard, type PronunciationRuntime } from "../../../pronunciation";
import { extractSpellingWord } from "../../../cards/spellingWord";

interface CardViewProps {
	session: ActiveStudySnapshot;
	transition: AnswerPresentationTransition;
	isTransitioning: boolean;
	onComplete: () => void;
	onEditCard: (deckId: string, cardId: string) => void;
	onDeleteCard: (deckId: string, cardId: string) => void;
	onClose: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
	pronunciationRuntime: PronunciationRuntime;
	pronunciationEnabled: boolean;
}

export const CardView = React.memo(function CardView({
	session,
	transition,
	isTransitioning,
	onComplete,
	onEditCard,
	onDeleteCard,
	onClose,
	markdownRenderer,
	pronunciationRuntime,
	pronunciationEnabled,
}: CardViewProps) {
	const { t, language } = useI18n();
	const [answerCardId, setAnswerCardId] = useState<string | null>(null);
	const [autoPronunciationEnabled, setAutoPronunciationEnabled] = useState(false);

	const currentCard = session.currentCard;
	const showAnswer = answerCardId === currentCard.identity;
	const ratingButtons = useMemo(() => getRatingButtons(language), [language]);
	const displayContent = useMemo(
		() => (currentCard ? getDisplayCardContent(currentCard, session.direction) : null),
		[currentCard, session.direction],
	);
	const pronunciationWord =
		pronunciationEnabled && currentCard ? extractSpellingWord(currentCard.front) : null;

	useEffect(() => {
		pronunciationRuntime.stop();
		setAnswerCardId(null);
		return () => pronunciationRuntime.stop();
	}, [currentCard.identity, pronunciationRuntime]);

	const shouldAutoPronounce = shouldAutoPronounceSessionCard({
		wordLearningEnabled: pronunciationEnabled,
		autoPlayEnabled: autoPronunciationEnabled,
		direction: session.direction,
		answerVisible: showAnswer,
		word: pronunciationWord,
	});
	const autoPronunciationText = shouldAutoPronounce ? pronunciationWord : null;

	useEffect(() => {
		if (!autoPronunciationText) return;
		void pronunciationRuntime.speak(autoPronunciationText, "auto").catch(() => undefined);
		return () => pronunciationRuntime.stop();
	}, [autoPronunciationText, currentCard.identity, pronunciationRuntime]);

	useEffect(() => {
		if (!pronunciationEnabled) setAutoPronunciationEnabled(false);
	}, [pronunciationEnabled]);

	const handleShowAnswer = useCallback(() => {
		setAnswerCardId(currentCard.identity);
	}, [currentCard.identity]);

	const handleToggleAutoPronunciation = useCallback(() => {
		setAutoPronunciationEnabled((enabled) => !enabled);
	}, []);

	const handleRating = useCallback(
		async (rating: StudyRating) => {
			if (!currentCard || isTransitioning) return;
			const outcome = await transition.act({
				kind: "study-answer",
				reference: session.reference,
				rating,
			});
			if (outcome.kind === "failed") new Notice(outcome.message);
			if (outcome.kind === "applied" && outcome.studyCompleted) onComplete();
		},
		[currentCard, isTransitioning, onComplete, session.reference, transition],
	);

	const handlePrevious = useCallback(async () => {
		if (!session.canPrevious || isTransitioning) return;
		const outcome = await transition.act({
			kind: "study-previous",
			reference: session.reference,
		});
		if (outcome.kind === "failed") new Notice(outcome.message);
	}, [isTransitioning, session.canPrevious, session.reference, transition]);

	useWindowKeyDown((e) => {
		// Ignore if in input field
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		if (!showAnswer) {
			// Show answer on space
			if (e.code === "Space") {
				e.preventDefault();
				handleShowAnswer();
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
				autoPronunciation={
					pronunciationEnabled
						? {
								enabled: autoPronunciationEnabled,
								onToggle: handleToggleAutoPronunciation,
								enableTitle: t("pronunciation.autoEnable"),
								disableTitle: t("pronunciation.autoDisable"),
							}
						: undefined
				}
			/>

			{/* Content */}
			<div className={`flashcard-content ${isTransitioning ? "animating" : ""}`}>
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
					<FlashcardButton
						preset="show"
						variant="green"
						size="lg"
						onClick={handleShowAnswer}
					>
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
									rating={btn.rating}
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
});
