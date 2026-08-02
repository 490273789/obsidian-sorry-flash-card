import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, CornerDownLeft, Keyboard, Lightbulb, X } from "lucide-react";
import { Notice } from "obsidian";
import type {
	ActiveSpellingSnapshot,
	SpellingLifecycleFeedback,
} from "../../sessions/sessionLifecycle";
import type { AnswerPresentationTransition } from "../answerPresentationTransition";
import { FlashcardButton } from "./FlashcardButton";
import { MarkdownContent } from "./MarkdownContent";
import { SessionToolbar } from "./SessionToolbar";
import { useI18n } from "./I18nContext";
import type { PronunciationRuntime } from "../../pronunciation";

interface SpellingViewProps {
	session: ActiveSpellingSnapshot;
	transition: AnswerPresentationTransition;
	isTransitioning: boolean;
	feedback: Readonly<SpellingLifecycleFeedback> | null;
	onEditCard: (deckId: string, cardId: string) => void;
	onDeleteCard: (deckId: string, cardId: string) => void;
	onClose: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
	pronunciationRuntime: PronunciationRuntime;
}

export const SpellingView = React.memo(function SpellingView({
	session,
	transition,
	isTransitioning,
	feedback,
	onEditCard,
	onDeleteCard,
	onClose,
	markdownRenderer,
	pronunciationRuntime,
}: SpellingViewProps) {
	const { t } = useI18n();
	const [input, setInput] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const currentCard = session.currentCard;

	useEffect(() => {
		pronunciationRuntime.stop();
		setInput("");
		window.setTimeout(() => inputRef.current?.focus(), 0);
	}, [currentCard.identity, pronunciationRuntime]);

	useEffect(() => () => pronunciationRuntime.stop(), [pronunciationRuntime]);

	const submit = useCallback(
		async (submittedInput: string, allowEmpty = false) => {
			if (!currentCard || isTransitioning) return;
			if (!allowEmpty && submittedInput.trim().length === 0) return;
			const outcome = await transition.act({
				kind: "spelling-answer",
				reference: session.reference,
				input: submittedInput,
			});
			if (outcome.kind !== "applied" || !outcome.feedback) {
				if (outcome.kind === "failed") new Notice(outcome.message);
				return;
			}

			if (
				outcome.feedback.kind === "retrieval-incorrect" ||
				outcome.feedback.kind === "correction-incorrect"
			) {
				setInput("");
				window.setTimeout(() => inputRef.current?.focus(), 0);
			}
		},
		[currentCard, isTransitioning, session.reference, transition],
	);

	if (!currentCard) {
		return <div className="flashcard-complete">{t("common.loading")}</div>;
	}

	const completed = session.progress.completed;
	const total = session.progress.total;
	const progressPercent = session.progress.percent;
	const isCorrection = session.phase === "correction";
	const isCorrectFeedback =
		feedback?.kind === "retrieval-correct" ||
		feedback?.kind === "correction-correct";

	return (
		<div className="flashcard-study flashcard-spelling-view">
			<SessionToolbar
				deckName={session.originDeck.name}
				statusIcon={Keyboard}
				statusLabel={
					isCorrection
						? t("spelling.correcting")
						: t("spelling.spelling")
				}
				progress={`${completed}/${total}`}
				progressPercent={progressPercent}
				startTime={session.startTime}
				onEdit={() => {
					if (!isTransitioning) {
						onEditCard(
							currentCard.currentDeckId,
							currentCard.identity,
						);
					}
				}}
				onDelete={() => {
					if (!isTransitioning) {
						onDeleteCard(
							currentCard.currentDeckId,
							currentCard.identity,
						);
					}
				}}
				onClose={() => {
					if (!isTransitioning) onClose();
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
											{feedback.submittedInput ||
												t("spelling.noAnswer")}
										</strong>
									</div>
									<div
										className="flashcard-spelling-diff"
										aria-label={t("spelling.yourInput")}
									>
										{feedback.diff.length > 0 ? (
											feedback.diff.map(
												(segment, index) => (
													<span
														key={`${segment.kind}-${index}`}
														className={`flashcard-spelling-diff-${segment.kind}`}
														title={segment.expected}
													>
														{segment.value || " "}
													</span>
												),
											)
										) : (
											<span className="flashcard-spelling-empty-answer">
												{t("spelling.noAnswer")}
											</span>
										)}
									</div>
									<div className="flashcard-spelling-correct-answer">
										<span>
											{t("spelling.correctAnswer")}
										</span>
										<strong>
											{feedback.expectedAnswer}
										</strong>
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
							disabled={isTransitioning}
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
						disabled={isTransitioning}
					>
						{t("spelling.dontKnow")}
					</FlashcardButton>
				)}
				<FlashcardButton
					variant="green"
					icon={CornerDownLeft}
					onClick={() => void submit(input)}
					disabled={isTransitioning || input.trim().length === 0}
				>
					{isCorrection
						? t("spelling.confirmCorrection")
						: t("spelling.submit")}
				</FlashcardButton>
			</div>
		</div>
	);
});
