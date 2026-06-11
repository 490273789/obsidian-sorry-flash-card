import React from "react";
import type { LucideIcon } from "lucide-react";
import { FlashcardButton } from "./FlashcardButton";
import { useI18n } from "./I18nContext";

interface FlashcardHeaderProps {
	/** Icon displayed next to the title (optional). */
	icon?: LucideIcon;
	/** Title text displayed in the center. */
	title: React.ReactNode;
	/** Content rendered to the left of the title (optional). */
	left?: React.ReactNode;
	/** Content rendered to the right of the title (optional). */
	right?: React.ReactNode;
	/** When provided, renders a back button on the left that calls this handler. */
	onBack?: () => void;
}

/**
 * Unified header for all flashcard views.
 *
 * Supports two primary layouts:
 * - **Navigation header** (setup / overview screens): back button + icon/title + optional right content.
 *   Pass `icon`, `title`, `onBack`, and optionally `right`.
 * - **Session header** (active study / practice): deck info + badge + timer + close.
 *   Pass `left`, `title`, and `right`; omit `onBack`.
 *
 * @example Navigation header
 * ```tsx
 * <FlashcardHeader icon={Brain} title="Study" onBack={onBack} />
 * ```
 *
 * @example Session header
 * ```tsx
 * <FlashcardHeader
 *   left={<><span className="flashcard-deck-title">{name}</span><span className="flashcard-progress">{p}</span></>}
 *   title={<span className="flashcard-badge"><Brain size={18} /> STUDYING</span>}
 *   right={<><span className="flashcard-timer">{t}</span><FlashcardButton preset="icon" icon={X} onClick={onClose} /></>}
 * />
 * ```
 */
export const FlashcardHeader: React.FC<FlashcardHeaderProps> = ({
	icon: Icon,
	title,
	left,
	right,
	onBack,
}) => {
	const { t } = useI18n();

	return (
		<div className="flashcard-common-header">
			<div className="flashcard-header-left">
				{onBack && (
					<FlashcardButton preset="back" onClick={onBack}>
						← {t("common.back")}
					</FlashcardButton>
				)}
				{left}
			</div>
			<div className="flashcard-header-center">
				{Icon && <Icon size={18} />}
				{title}
			</div>
			<div className="flashcard-header-right">{right}</div>
		</div>
	);
};
