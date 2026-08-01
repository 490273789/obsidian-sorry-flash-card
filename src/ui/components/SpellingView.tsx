import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, CornerDownLeft, Keyboard, Lightbulb, X } from "lucide-react";
import { Notice } from "obsidian";
import type {
	ActiveSpellingSnapshot,
	SessionLifecycle,
	SpellingLifecycleFeedback,
} from "../../sessions/sessionLifecycle";
import { FlashcardButton } from "./FlashcardButton";
import { MarkdownContent } from "./MarkdownContent";
import { SessionToolbar } from "./SessionToolbar";
import { useI18n } from "./I18nContext";
import {
	shouldAutoPronounceSpellingFeedback,
	waitForSpellingPronunciation,
	type PronunciationRuntime,
} from "../../pronunciation";

interface SpellingViewProps {
	lifecycle: SessionLifecycle;
	session: ActiveSpellingSnapshot;
	holdPresentation: () => () => void;
	onEditCard: (deckId: string, cardId: string) => void;
	onDeleteCard: (deckId: string, cardId: string) => void;
	onClose: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
	pronunciationRuntime: PronunciationRuntime;
}

export const SpellingView: React.FC<SpellingViewProps> = ({
	lifecycle,
	session,
	holdPresentation,
	onEditCard,
	onDeleteCard,
	onClose,
	markdownRenderer,
	pronunciationRuntime,
}) => {
	const { t } = useI18n();
	const [input, setInput] = useState("");
	const [feedback, setFeedback] = useState<SpellingLifecycleFeedback | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const advanceTimerRef = useRef<number | null>(null);
	const advanceGenerationRef = useRef(0);
	const pendingPresentationReleaseRef = useRef<(() => void) | null>(null);
	const currentCard = session.currentCard;
	const pronunciationSnapshot = useSyncExternalStore(
		(listener) => pronunciationRuntime.subscribe(listener),
		() => pronunciationRuntime.getSnapshot(),
		() => pronunciationRuntime.getSnapshot(),
	);
	const autoPronounce = pronunciationSnapshot.settings.spellingAutoPlay;

	useEffect(() => {
		advanceGenerationRef.current++;
		pronunciationRuntime.stop();
		setInput("");
		setFeedback(null);
		window.setTimeout(() => inputRef.current?.focus(), 0);
	}, [currentCard.identity, pronunciationRuntime]);

	useEffect(
		() => () => {
			advanceGenerationRef.current++;
			pronunciationRuntime.stop();
			pendingPresentationReleaseRef.current?.();
			pendingPresentationReleaseRef.current = null;
			if (advanceTimerRef.current !== null) {
				window.clearTimeout(advanceTimerRef.current);
			}
		},
		[pronunciationRuntime],
	);

	const submit = useCallback(
		async (submittedInput: string, allowEmpty = false) => {
			if (!currentCard || isSubmitting) return;
			if (!allowEmpty && submittedInput.trim().length === 0) return;
			setIsSubmitting(true);
			const releasePresentation = holdPresentation();
			pendingPresentationReleaseRef.current = releasePresentation;
			const outcome = await lifecycle.act(session.reference, {
				kind: "answer",
				input: submittedInput,
			});
			if (outcome.kind !== "applied" || !outcome.feedback) {
				releasePresentation();
				pendingPresentationReleaseRef.current = null;
				setIsSubmitting(false);
				if (outcome.kind === "failed") new Notice(outcome.failure.message);
				return;
			}
			setFeedback(outcome.feedback);

			if (
				outcome.feedback.kind === "retrieval-incorrect" ||
				outcome.feedback.kind === "correction-incorrect"
			) {
				releasePresentation();
				pendingPresentationReleaseRef.current = null;
				setInput("");
				setIsSubmitting(false);
				window.setTimeout(() => inputRef.current?.focus(), 0);
				return;
			}

			const generation = ++advanceGenerationRef.current;
			if (autoPronounce && shouldAutoPronounceSpellingFeedback(outcome.feedback.kind)) {
				await waitForSpellingPronunciation(
					pronunciationRuntime,
					outcome.feedback.expectedAnswer,
				);
				if (generation !== advanceGenerationRef.current) {
					releasePresentation();
					pendingPresentationReleaseRef.current = null;
					return;
				}
			}

			advanceTimerRef.current = window.setTimeout(
				() => {
					releasePresentation();
					pendingPresentationReleaseRef.current = null;
					setIsSubmitting(false);
				},
				autoPronounce ? 0 : 550,
			);
		},
		[
			autoPronounce,
			currentCard,
			holdPresentation,
			isSubmitting,
			lifecycle,
			pronunciationRuntime,
			session,
		],
	);

	if (!currentCard) {
		return <div className="flashcard-complete">{t("common.loading")}</div>;
	}

	const completed = session.progress.completed;
	const total = session.progress.total;
	const progressPercent = session.progress.percent;
	const isCorrection = session.phase === "correction";
	const isCorrectFeedback =
		feedback?.kind === "retrieval-correct" || feedback?.kind === "correction-correct";

	return (
		<div className="flashcard-study flashcard-spelling-view">
			<SessionToolbar
				deckName={session.originDeck.name}
				statusIcon={Keyboard}
				statusLabel={isCorrection ? t("spelling.correcting") : t("spelling.spelling")}
				progress={`${completed}/${total}`}
				progressPercent={progressPercent}
				startTime={session.startTime}
				onEdit={() => {
					if (!isSubmitting) {
						onEditCard(currentCard.currentDeckId, currentCard.identity);
					}
				}}
				onDelete={() => {
					if (!isSubmitting) {
						onDeleteCard(currentCard.currentDeckId, currentCard.identity);
					}
				}}
				onClose={() => {
					if (!isSubmitting) onClose();
				}}
				editTitle={t("cardEditor.editCurrentTitle")}
				deleteTitle={t("cardEditor.deleteCurrentTitle")}
				closeTitle={t("spelling.exitTitle")}
			/>

			<div className="flashcard-content">
				<div className="flashcard-card-stack">
					<div className="flashcard-question">
						<div className="flashcard-label flashcard-label-question">
							{t("spelling.meaningPrompt")}
						</div>
						<MarkdownContent
							content={currentCard.back}
							className="flashcard-markdown"
							markdownRenderer={markdownRenderer}
						/>
					</div>

					{feedback &&
						(feedback.kind === "retrieval-incorrect" ||
							feedback.kind === "correction-incorrect") && (
							<>
								<div className="flashcard-spelling-feedback is-wrong">
									<div className="flashcard-spelling-feedback-title">
										<X size={18} />
										{feedback.kind === "retrieval-incorrect"
											? t("spelling.incorrect")
											: t("spelling.correctionIncorrect")}
									</div>
									<div className="flashcard-spelling-submitted-answer">
										<span>{t("spelling.yourInput")}</span>
										<strong>
											{feedback.submittedInput || t("spelling.noAnswer")}
										</strong>
									</div>
									<div
										className="flashcard-spelling-diff"
										aria-label={t("spelling.yourInput")}
									>
										{feedback.diff.length > 0 ? (
											feedback.diff.map((segment, index) => (
												<span
													key={`${segment.kind}-${index}`}
													className={`flashcard-spelling-diff-${segment.kind}`}
													title={segment.expected}
												>
													{segment.value || " "}
												</span>
											))
										) : (
											<span className="flashcard-spelling-empty-answer">
												{t("spelling.noAnswer")}
											</span>
										)}
									</div>
									<div className="flashcard-spelling-correct-answer">
										<span>{t("spelling.correctAnswer")}</span>
										<strong>{feedback.expectedAnswer}</strong>
									</div>
								</div>
								{currentCard.explanation && (
									<div className="flashcard-explanation">
										<div className="flashcard-label flashcard-label-explanation">
											{t("common.explanation")}
										</div>
										<MarkdownContent
											content={currentCard.explanation}
											className="flashcard-markdown"
											markdownRenderer={markdownRenderer}
										/>
									</div>
								)}
							</>
						)}

					{isCorrectFeedback && (
						<div className="flashcard-spelling-feedback is-correct">
							<Check size={20} />
							<span>{t("spelling.correct")}</span>
							<strong>{feedback.expectedAnswer}</strong>
						</div>
					)}

					<label className="flashcard-spelling-input-group">
						<span>
							{isCorrection
								? t("spelling.retypeInstruction")
								: t("spelling.inputInstruction")}
						</span>
						<input
							ref={inputRef}
							type="text"
							value={input}
							onChange={(event) => setInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void submit(input);
								}
							}}
							disabled={isSubmitting}
							spellCheck={false}
							autoComplete="off"
							autoCapitalize="none"
							autoCorrect="off"
							enterKeyHint="done"
							aria-label={t("spelling.inputInstruction")}
						/>
					</label>
				</div>
			</div>

			<div className="flashcard-footer flashcard-spelling-actions">
				{!isCorrection && (
					<FlashcardButton
						variant="gray"
						icon={Lightbulb}
						onClick={() => void submit("", true)}
						disabled={isSubmitting}
					>
						{t("spelling.dontKnow")}
					</FlashcardButton>
				)}
				<FlashcardButton
					variant="green"
					icon={CornerDownLeft}
					onClick={() => void submit(input)}
					disabled={isSubmitting || input.trim().length === 0}
				>
					{isCorrection ? t("spelling.confirmCorrection") : t("spelling.submit")}
				</FlashcardButton>
			</div>
		</div>
	);
};
