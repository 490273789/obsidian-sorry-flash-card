import React, { memo, useCallback, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { FilePlus2, Pencil, Sparkles, X } from "lucide-react";
import type { Deck } from "../types";
import { FlashcardButton } from "./FlashcardButton";
import { useI18n } from "./I18nContext";

export type CardEditorMode = "create" | "edit";

export interface CardEditorSavePayload {
	deckId: string;
	question: string;
	answer: string;
}

interface CardEditorModalProps {
	mode: CardEditorMode;
	decks: Deck[];
	initialDeckId: string | null;
	initialQuestion: string;
	initialAnswer: string;
	onSave: (payload: CardEditorSavePayload) => Promise<void>;
	onClose: () => void;
}

export const CardEditorModal = memo(function CardEditorModal({
	mode,
	decks,
	initialDeckId,
	initialQuestion,
	initialAnswer,
	onSave,
	onClose,
}: CardEditorModalProps) {
	const { t } = useI18n();
	const defaultDeckId = initialDeckId ?? decks[0]?.id ?? "";
	const [deckId, setDeckId] = useState(defaultDeckId);
	const [question, setQuestion] = useState(initialQuestion);
	const [answer, setAnswer] = useState(initialAnswer);
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const selectedDeck = useMemo(
		() => decks.find((deck) => deck.id === deckId),
		[deckId, decks],
	);

	const title =
		mode === "edit" ? t("cardEditor.editTitle") : t("cardEditor.createTitle");
	const Icon = mode === "edit" ? Pencil : FilePlus2;

	const handleBackdropClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (e.target === e.currentTarget && !isSaving) onClose();
		},
		[isSaving, onClose],
	);

	const handleSave = useCallback(async () => {
		const trimmedDeckId = deckId.trim();
		const trimmedQuestion = question.trim();
		const trimmedAnswer = answer.trim();

		if (!trimmedDeckId) {
			setError(t("cardEditor.deckRequired"));
			return;
		}
		if (!trimmedQuestion) {
			setError(t("cardEditor.questionRequired"));
			return;
		}
		if (!trimmedAnswer) {
			setError(t("cardEditor.answerRequired"));
			return;
		}

		setError(null);
		setIsSaving(true);
		try {
			await onSave({
				deckId: trimmedDeckId,
				question: trimmedQuestion,
				answer: trimmedAnswer,
			});
		} catch (saveError) {
			setError(
				saveError instanceof Error
					? saveError.message
					: t("cardEditor.saveFailed"),
			);
		} finally {
			setIsSaving(false);
		}
	}, [answer, deckId, onSave, question, t]);

	const modal = (
		<div className="flashcard-modal-backdrop" onClick={handleBackdropClick}>
			<div className="flashcard-modal flashcard-card-editor-modal">
				<div className="flashcard-modal-header">
					<div className="flashcard-modal-heading">
						<div className="flashcard-modal-kicker fc-kicker">
							<Sparkles size={14} /> {t("cardEditor.kicker")}
						</div>
						<span className="flashcard-modal-title">
							<Icon size={17} /> {title}
						</span>
						<span className="flashcard-modal-subtitle">
							{selectedDeck
								? t("cardEditor.subtitle", {
										deckName: selectedDeck.name,
									})
								: t("cardEditor.selectDeck")}
						</span>
					</div>
					<FlashcardButton
						preset="icon"
						icon={X}
						onClick={onClose}
						disabled={isSaving}
						title={t("common.close")}
						aria-label={t("common.close")}
					/>
				</div>

				<div className="flashcard-modal-body flashcard-card-editor-body">
					{mode === "create" && (
						<label className="flashcard-card-editor-field">
							<span>{t("cardEditor.selectDeck")}</span>
							<select
								value={deckId}
								onChange={(e) => setDeckId(e.target.value)}
								disabled={isSaving}
							>
								{decks.map((deck) => (
									<option key={deck.id} value={deck.id}>
										{deck.name} · {deck.tag}
									</option>
								))}
							</select>
						</label>
					)}

					<label className="flashcard-card-editor-field">
						<span>{t("common.question")}</span>
						<textarea
							value={question}
							onChange={(e) => setQuestion(e.target.value)}
							placeholder={t("cardEditor.questionPlaceholder")}
							disabled={isSaving}
							rows={7}
						/>
					</label>

					<label className="flashcard-card-editor-field">
						<span>{t("common.answer")}</span>
						<textarea
							value={answer}
							onChange={(e) => setAnswer(e.target.value)}
							placeholder={t("cardEditor.answerPlaceholder")}
							disabled={isSaving}
							rows={7}
						/>
					</label>

					{error && (
						<div className="flashcard-card-editor-error">
							{error}
						</div>
					)}
				</div>

				<div className="flashcard-modal-footer">
					<FlashcardButton onClick={onClose} disabled={isSaving}>
						{t("common.cancel")}
					</FlashcardButton>
					<FlashcardButton
						variant="green"
						onClick={() => void handleSave()}
						disabled={isSaving}
					>
						{isSaving
							? t("cardEditor.saving")
							: mode === "edit"
								? t("cardEditor.saveEdit")
								: t("cardEditor.saveCreate")}
					</FlashcardButton>
				</div>
			</div>
		</div>
	);

	const container =
		activeDocument.querySelector(".flashcard-root") ?? activeDocument.body;
	return ReactDOM.createPortal(modal, container);
});
