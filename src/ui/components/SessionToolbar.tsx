import React from "react";
import { ChevronDown, Pencil, Trash2, Volume2, VolumeX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardHeader } from "./FlashcardHeader";
import { SessionTimer } from "./SessionTimer";
import { useI18n } from "./I18nContext";

interface SessionToolbarProps {
	deckName: string;
	statusIcon: LucideIcon;
	statusLabel: string;
	progress: string;
	progressPercent: number;
	startTime: number;
	onEdit: () => void;
	onDelete: () => void;
	onClose: () => void;
	editTitle: string;
	deleteTitle: string;
	closeTitle: string;
	autoPronunciation?: {
		enabled: boolean;
		onToggle: () => void;
		enableTitle: string;
		disableTitle: string;
	};
}

export const SessionToolbar: React.FC<SessionToolbarProps> = ({
	deckName,
	statusIcon: StatusIcon,
	statusLabel,
	progress,
	progressPercent,
	startTime,
	onEdit,
	onDelete,
	onClose,
	editTitle,
	deleteTitle,
	closeTitle,
	autoPronunciation,
}) => {
	const { t } = useI18n();
	const [areActionsOpen, setAreActionsOpen] = React.useState(false);
	const normalizedProgress = Math.min(Math.max(progressPercent, 0), 100);
	const actionMenuTitle = areActionsOpen
		? t("cardEditor.hideActions")
		: t("cardEditor.showActions");

	const handleToggleActions = React.useCallback(() => {
		setAreActionsOpen((isOpen) => !isOpen);
	}, []);

	const handleEdit = React.useCallback(() => {
		setAreActionsOpen(false);
		onEdit();
	}, [onEdit]);

	const handleDelete = React.useCallback(() => {
		setAreActionsOpen(false);
		onDelete();
	}, [onDelete]);

	const autoPronunciationTitle = autoPronunciation?.enabled
		? autoPronunciation.disableTitle
		: autoPronunciation?.enableTitle;

	return (
		<div className="flashcard-session-shell">
			<FlashcardHeader
				title={
					<div className="flashcard-session-identity">
						<span className="flashcard-deck-title">{deckName}</span>
						<span className="flashcard-badge">
							<StatusIcon size={14} /> {statusLabel}
						</span>
					</div>
				}
				onBack={onClose}
				backTitle={closeTitle}
			/>
			<div className="flashcard-session-toolbar">
				<div className="flashcard-session-progress" aria-label={t("study.progress")}>
					<span className="flashcard-session-progress-text">{progress}</span>
					<span className="flashcard-session-progress-track">
						<span
							className="flashcard-session-progress-fill"
							style={{ width: `${normalizedProgress}%` }}
						/>
					</span>
				</div>
				<div className="flashcard-session-metrics">
					<SessionTimer
						startTime={startTime}
						className="flashcard-timer flashcard-session-timer"
					/>
				</div>
				<div className={`flashcard-session-actions${areActionsOpen ? " is-open" : ""}`}>
					<FlashcardButton
						preset="icon"
						icon={ChevronDown}
						onClick={handleToggleActions}
						className="flashcard-session-actions-toggle"
						iconClassName="flashcard-session-actions-toggle-icon"
						title={actionMenuTitle}
						aria-label={actionMenuTitle}
						aria-expanded={areActionsOpen}
						active={areActionsOpen}
					/>
					{autoPronunciation && (
						<FlashcardButton
							preset="icon"
							icon={autoPronunciation.enabled ? Volume2 : VolumeX}
							onClick={autoPronunciation.onToggle}
							className="flashcard-session-action-item flashcard-session-auto-pronunciation"
							title={autoPronunciationTitle}
							aria-label={autoPronunciationTitle}
							aria-pressed={autoPronunciation.enabled}
							active={autoPronunciation.enabled}
						/>
					)}
					<FlashcardButton
						preset="icon"
						icon={Pencil}
						onClick={handleEdit}
						className="flashcard-session-action-item"
						title={editTitle}
						aria-label={editTitle}
					/>
					<FlashcardButton
						preset="icon"
						variant="danger"
						icon={Trash2}
						onClick={handleDelete}
						className="flashcard-session-action-item"
						title={deleteTitle}
						aria-label={deleteTitle}
					/>
				</div>
			</div>
		</div>
	);
};
