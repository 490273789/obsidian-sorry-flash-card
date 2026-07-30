import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, CornerDownLeft, Keyboard, Lightbulb, X } from "lucide-react";
import type { Deck, SpellingResult, SpellingSession } from "../../shared/types";
import type {
	SpellingRuntimeAnswerOutcome,
	SpellingSessionRuntime,
} from "../../sessions/spellingSessionRuntime";
import { FlashcardButton } from "./FlashcardButton";
import { MarkdownContent } from "./MarkdownContent";
import { SessionToolbar } from "./SessionToolbar";
import { useI18n } from "./I18nContext";

interface SpellingViewProps {
	spellingRuntime: SpellingSessionRuntime;
	deck: Deck;
	session: SpellingSession;
	onSessionUpdate: (session: SpellingSession) => void;
	onEditCard: (deckId: string, cardId: string) => void;
	onDeleteCard: (deckId: string, cardId: string) => void;
	onComplete: (result: SpellingResult) => void;
	onClose: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

type Feedback = SpellingRuntimeAnswerOutcome & { submittedInput: string };

export const SpellingView: React.FC<SpellingViewProps> = ({
	spellingRuntime,
	deck,
	session,
	onSessionUpdate,
	onEditCard,
	onDeleteCard,
	onComplete,
	onClose,
	markdownRenderer,
}) => {
	const { t } = useI18n();
	const [input, setInput] = useState("");
	const [feedback, setFeedback] = useState<Feedback | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const advanceTimerRef = useRef<number | null>(null);
	const currentCard = spellingRuntime.getCurrentCard(session);

	useEffect(() => {
		setInput("");
		setFeedback(null);
		window.setTimeout(() => inputRef.current?.focus(), 0);
	}, [currentCard?.id, session.currentIndex]);

	useEffect(
		() => () => {
			if (advanceTimerRef.current !== null) {
				window.clearTimeout(advanceTimerRef.current);
			}
		},
		[],
	);

	const submit = useCallback(
		async (submittedInput: string, allowEmpty = false) => {
			if (!currentCard || isSubmitting) return;
			if (!allowEmpty && submittedInput.trim().length === 0) return;
			setIsSubmitting(true);
			const outcome = await spellingRuntime.answer(session, submittedInput);
			if (!outcome) {
				setIsSubmitting(false);
				return;
			}
			const nextFeedback: Feedback = { ...outcome, submittedInput };
			setFeedback(nextFeedback);

			if (
				outcome.feedback === "retrieval-incorrect" ||
				outcome.feedback === "correction-incorrect"
			) {
				if (outcome.type === "continue") onSessionUpdate(outcome.session);
				setInput("");
				setIsSubmitting(false);
				window.setTimeout(() => inputRef.current?.focus(), 0);
				return;
			}

			advanceTimerRef.current = window.setTimeout(() => {
				setIsSubmitting(false);
				if (outcome.type === "continue") {
					onSessionUpdate(outcome.session);
				} else {
					onComplete(outcome.result);
				}
			}, 550);
		},
		[currentCard, isSubmitting, onComplete, onSessionUpdate, session, spellingRuntime],
	);

	if (!currentCard) {
		return <div className="flashcard-complete">{t("common.loading")}</div>;
	}

	const completed = session.completedCardIds.length;
	const total = session.selectedCardIds.length;
	const progressPercent = total > 0 ? (completed / total) * 100 : 0;
	const isCorrection = session.phase === "correction";
	const isCorrectFeedback =
		feedback?.feedback === "retrieval-correct" || feedback?.feedback === "correction-correct";

	return (
		<div className="flashcard-study flashcard-spelling-view">
			<SessionToolbar
				deckName={deck.name}
				statusIcon={Keyboard}
				statusLabel={isCorrection ? t("spelling.correcting") : t("spelling.spelling")}
				progress={`${completed}/${total}`}
				progressPercent={progressPercent}
				startTime={session.startTime}
				onEdit={() => {
					if (!isSubmitting) onEditCard(deck.id, currentCard.id);
				}}
				onDelete={() => {
					if (!isSubmitting) onDeleteCard(deck.id, currentCard.id);
				}}
				onClose={() => {
					if (!isSubmitting) onClose();
				}}
				editTitle={t("cardEditor.editCurrentTitle")}
				deleteTitle={t("cardEditor.deleteCurrentTitle")}
				closeTitle={t("spelling.exitTitle")}
			/>

			<div className="flashcard-content">
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
					(feedback.feedback === "retrieval-incorrect" ||
						feedback.feedback === "correction-incorrect") && (
						<div className="flashcard-spelling-feedback is-wrong">
							<div className="flashcard-spelling-feedback-title">
								<X size={18} />
								{feedback.feedback === "retrieval-incorrect"
									? t("spelling.incorrect")
									: t("spelling.correctionIncorrect")}
							</div>
							<div className="flashcard-spelling-submitted-answer">
								<span>{t("spelling.yourInput")}</span>
								<strong>{feedback.submittedInput || t("spelling.noAnswer")}</strong>
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
								<strong>{feedback.answer}</strong>
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
						</div>
					)}

				{isCorrectFeedback && (
					<div className="flashcard-spelling-feedback is-correct">
						<Check size={20} />
						<span>{t("spelling.correct")}</span>
						<strong>{feedback.answer}</strong>
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
