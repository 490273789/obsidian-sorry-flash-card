import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Target, X, Check } from "lucide-react";
import { Notice } from "obsidian";
import { getDisplayCardContent } from "../../../cards/cardDisplay";
import type { ActivePracticeSnapshot } from "../../../sessions/sessionLifecycle";
import type { AnswerPresentationTransition } from "../../answerPresentationTransition";
import { FlashcardButton } from "../../primitives/Button";
import { MarkdownContent, PronounceableMarkdown } from "../../primitives/Markdown";
import { SessionToolbar } from "../../primitives/SessionToolbar";
import { useWindowKeyDown } from "../../hooks/hooks";
import { useI18n } from "../../context/I18nContext";
import { shouldAutoPronounceSessionCard, type PronunciationRuntime } from "../../../pronunciation";
import { extractSpellingWord } from "../../../cards/spellingWord";

interface PracticeViewProps {
	session: ActivePracticeSnapshot;
	transition: AnswerPresentationTransition;
	isTransitioning: boolean;
	onEditCard: (deckId: string, cardId: string) => void;
	onDeleteCard: (deckId: string, cardId: string) => void;
	onClose: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
	pronunciationRuntime: PronunciationRuntime;
	pronunciationEnabled: boolean;
}

export const PracticeView = React.memo(function PracticeView({
	session,
	transition,
	isTransitioning,
	onEditCard,
	onDeleteCard,
	onClose,
	markdownRenderer,
	pronunciationRuntime,
	pronunciationEnabled,
}: PracticeViewProps) {
	const { t } = useI18n();
	const [answerCardId, setAnswerCardId] = useState<string | null>(null);
	const [autoPronunciationEnabled, setAutoPronunciationEnabled] = useState(false);

	const currentCard = session.currentCard;
	const showAnswer = answerCardId === currentCard.identity;
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

	const handleAnswer = useCallback(
		async (isCorrect: boolean) => {
			if (!currentCard || isTransitioning) return;
			const outcome = await transition.act({
				kind: "practice-answer",
				reference: session.reference,
				correct: isCorrect,
			});
			if (outcome.kind === "failed") new Notice(outcome.message);
		},
		[currentCard, isTransitioning, session.reference, transition],
	);

	const handlePrevious = useCallback(async () => {
		if (!session.canPrevious || isTransitioning) return;
		const outcome = await transition.act({
			kind: "practice-previous",
			reference: session.reference,
		});
		if (outcome.kind === "failed") new Notice(outcome.message);
	}, [isTransitioning, session.canPrevious, session.reference, transition]);

	useWindowKeyDown((e) => {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		if (!showAnswer) {
			if (e.code === "Space") {
				e.preventDefault();
				handleShowAnswer();
			}
			return;
		}

		switch (e.code) {
			case "Digit1":
			case "Numpad1":
			case "KeyX":
				e.preventDefault();
				void handleAnswer(false);
				break;
			case "Digit2":
			case "Numpad2":
			case "KeyO":
			case "Space":
				e.preventDefault();
				void handleAnswer(true);
				break;
			case "Digit6":
			case "Numpad6":
				e.preventDefault();
				void handlePrevious();
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

	const progress = session.progress.label;
	const progressPercent = session.progress.percent;
	const directionLabel =
		session.direction === "normal" ? t("mode.normalShort") : t("mode.reversedShort");

	return (
		<div className="flashcard-study">
			{/* Header */}
			<SessionToolbar
				deckName={session.originDeck.name}
				statusIcon={Target}
				statusLabel={`${t("practice.practicing")} · ${directionLabel}`}
				progress={progress}
				progressPercent={progressPercent}
				startTime={session.startTime}
				onEdit={() => onEditCard(currentCard.currentDeckId, currentCard.identity)}
				onDelete={() => onDeleteCard(currentCard.currentDeckId, currentCard.identity)}
				onClose={onClose}
				editTitle={t("cardEditor.editCurrentTitle")}
				deleteTitle={t("cardEditor.deleteCurrentTitle")}
				closeTitle={t("practice.exitTitle")}
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
					<div className="flashcard-practice-response-controls">
						<FlashcardButton
							preset="prev"
							icon={RotateCcw}
							iconSize={24}
							onClick={handlePrevious}
							disabled={!session.canPrevious}
							title={`${t("common.undo")} (6)`}
						/>
						<div className="flashcard-practice-answer-buttons">
							<FlashcardButton
								preset="practice-wrong"
								size="lg"
								onClick={() => void handleAnswer(false)}
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
								size="lg"
								onClick={() => void handleAnswer(true)}
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
});
