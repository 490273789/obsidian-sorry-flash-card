import React from "react";
import { Pencil, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { FlashcardButton } from "../Button";
import { FlashcardMenu, type FlashcardMenuItem } from "../Menu";
import { SessionTimer } from "../SessionTimer";
import { useI18n } from "../../context/I18nContext";

export interface SessionToolbarProps {
	deckName: string;
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
	const normalizedProgress = Math.min(Math.max(progressPercent, 0), 100);
	const autoPronunciationTitle = autoPronunciation?.enabled
		? autoPronunciation.disableTitle
		: autoPronunciation?.enableTitle;
	const actionMenuItems: FlashcardMenuItem[] = [
		...(autoPronunciation
			? [
					{
						key: "auto-pronunciation",
						label: autoPronunciationTitle,
						icon: autoPronunciation.enabled ? Volume2 : VolumeX,
						onSelect: autoPronunciation.onToggle,
					},
				]
			: []),
		{ key: "edit", label: editTitle, icon: Pencil, onSelect: onEdit },
		{ key: "delete", label: deleteTitle, icon: Trash2, onSelect: onDelete, danger: true },
	];

	return (
		<div className="flashcard-session-shell">
			<header className="flashcard-session-header">
				<FlashcardButton
					preset="icon"
					icon={X}
					onClick={onClose}
					className="flashcard-session-close"
					title={closeTitle}
					aria-label={closeTitle}
				/>
				<div className="flashcard-session-identity">
					<span className="flashcard-deck-title">{deckName}</span>
				</div>
				<div className="flashcard-session-header-tools">
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
					<div className="flashcard-session-actions">
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
							onClick={onEdit}
							className="flashcard-session-action-item"
							title={editTitle}
							aria-label={editTitle}
						/>
						<FlashcardButton
							preset="icon"
							variant="danger"
							icon={Trash2}
							onClick={onDelete}
							className="flashcard-session-action-item"
							title={deleteTitle}
							aria-label={deleteTitle}
						/>
						<FlashcardMenu
							items={actionMenuItems}
							triggerTitle={t("cardEditor.showActions")}
							ariaLabel={t("cardEditor.showActions")}
							triggerClassName="flashcard-session-actions-toggle"
							menuClassName="flashcard-session-actions-menu"
							align="end"
						/>
					</div>
				</div>
			</header>
		</div>
	);
};
