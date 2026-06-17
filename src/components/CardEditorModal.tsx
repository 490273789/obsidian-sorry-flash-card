import React, { memo, useCallback, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { FilePlus2, Pencil, Sparkles, X } from "lucide-react";
import type { Deck } from "../types";
import { containsReservedMarkerLine } from "../cardFormat";
import { FlashcardButton } from "./FlashcardButton";
import { useI18n } from "./I18nContext";

export type CardEditorMode = "create" | "edit";

export interface CardEditorSavePayload {
	deckId: string;
	front: string;
	back: string;
	explanation?: string;
}

interface CardEditorModalProps {
	mode: CardEditorMode;
	decks: Deck[];
	initialDeckId: string | null;
	initialFront: string;
	initialBack: string;
	initialExplanation: string;
	onSave: (payload: CardEditorSavePayload) => Promise<void>;
	onClose: () => void;
}

export const CardEditorModal = memo(function CardEditorModal({
	mode,
	decks,
	initialDeckId,
	initialFront,
	initialBack,
	initialExplanation,
	onSave,
	onClose,
}: CardEditorModalProps) {
	const { t } = useI18n();
	const defaultDeckId = initialDeckId ?? decks[0]?.id ?? "";
	const [deckId, setDeckId] = useState(defaultDeckId);
	const [front, setFront] = useState(initialFront);
	const [back, setBack] = useState(initialBack);
	const [explanation, setExplanation] = useState(initialExplanation);
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const selectedDeck = useMemo(() => decks.find((deck) => deck.id === deckId), [deckId, decks]);

	const title = mode === "edit" ? t("cardEditor.editTitle") : t("cardEditor.createTitle");
	const Icon = mode === "edit" ? Pencil : FilePlus2;

	const handleBackdropClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (e.target === e.currentTarget && !isSaving) onClose();
		},
		[isSaving, onClose],
	);

	const handleSave = useCallback(async () => {
		const trimmedDeckId = deckId.trim();
		const trimmedFront = front.trim();
		const trimmedBack = back.trim();
		const trimmedExplanation = explanation.trim();

		if (!trimmedDeckId) {
			setError(t("cardEditor.deckRequired"));
			return;
		}
		if (!trimmedFront) {
			setError(t("cardEditor.frontRequired"));
			return;
		}
		if (!trimmedBack) {
			setError(t("cardEditor.backRequired"));
			return;
		}
		if ([trimmedFront, trimmedBack, trimmedExplanation].some(containsReservedMarkerLine)) {
			setError(t("cardEditor.markerReserved"));
			return;
		}

		setError(null);
		setIsSaving(true);
		try {
			await onSave({
				deckId: trimmedDeckId,
				front: trimmedFront,
				back: trimmedBack,
				explanation: trimmedExplanation || undefined,
			});
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : t("cardEditor.saveFailed"));
		} finally {
			setIsSaving(false);
		}
	}, [back, deckId, explanation, front, onSave, t]);

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
						<span>{t("common.cardFront")}</span>
						<textarea
							value={front}
							onChange={(e) => setFront(e.target.value)}
							placeholder={t("cardEditor.frontPlaceholder")}
							disabled={isSaving}
							rows={7}
						/>
					</label>

					<label className="flashcard-card-editor-field">
						<span>{t("common.cardBack")}</span>
						<textarea
							value={back}
							onChange={(e) => setBack(e.target.value)}
							placeholder={t("cardEditor.backPlaceholder")}
							disabled={isSaving}
							rows={7}
						/>
					</label>

					<label className="flashcard-card-editor-field">
						<span>{t("common.explanationOptional")}</span>
						<textarea
							value={explanation}
							onChange={(e) => setExplanation(e.target.value)}
							placeholder={t("cardEditor.explanationPlaceholder")}
							disabled={isSaving}
							rows={5}
						/>
					</label>

					{error && <div className="flashcard-card-editor-error">{error}</div>}
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

	const container = activeDocument.querySelector(".flashcard-root") ?? activeDocument.body;
	return ReactDOM.createPortal(modal, container);
});
