import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Visual variant for the button.
 * Maps directly to CSS classes: `flashcard-btn-{variant}`
 */
export type ButtonVariant =
	| "primary"
	| "secondary"
	| "danger"
	| "green"
	| "blue"
	| "purple"
	| "orange"
	| "red"
	| "gray";

export type ButtonSize = "sm" | "md" | "lg";

/**
 * Special button presets that override the default shape / behavior.
 * - `"icon"`       — compact square icon-only button
 * - `"show"`       — full-width "Show Answer" button with sheen animation
 * - `"prev"`       — undo / previous-card button (square)
 * - `"rating"`     — FSRS rating button (used inside rating grid)
 * - `"practice-wrong"`  — practice wrong-answer button
 * - `"practice-correct"` — practice correct-answer button
 */
export type ButtonPreset =
	| "icon"
	| "show"
	| "prev"
	| "rating"
	| "practice-wrong"
	| "practice-correct";

/** CSS class applied per preset. Presets shape the button; variants color it. */
const PRESET_CLASSES: Record<ButtonPreset, string> = {
	icon: "flashcard-btn-icon",
	show: "flashcard-btn-show",
	prev: "flashcard-btn-prev",
	rating: "flashcard-rating-btn",
	"practice-wrong": "flashcard-practice-btn-wrong",
	"practice-correct": "flashcard-practice-btn-correct",
};

/** Presets that render a compact square icon-only control. */
const COMPACT_ICON_PRESETS: ReadonlySet<ButtonPreset> = new Set(["icon", "prev"]);

/** Default icon size for compact icon-only presets. */
const COMPACT_ICON_SIZE = 16;
/** Default icon size for buttons with text. */
const DEFAULT_ICON_SIZE = 18;

export interface FlashcardButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	/** Semantic visual variant. Colors the button; combined with preset when both are set. */
	variant?: ButtonVariant;
	/** Control size. Defaults to the 36px medium control. */
	size?: ButtonSize;
	/** Special shape / behavior preset. Class generation combines preset and variant. */
	preset?: ButtonPreset;
	/** FSRS rating (1-5). Adds `flashcard-rating-{n}`; normally combined with preset="rating". */
	rating?: 1 | 2 | 3 | 4 | 5;
	/** Optional Lucide icon element rendered before children. */
	icon?: LucideIcon;
	/** Icon size in pixels. Defaults to 18 for normal buttons, 16 for icon-only. */
	iconSize?: number;
	/** Extra CSS class names appended after the generated ones. */
	className?: string;
	/** Extra CSS class names applied to the icon element. */
	iconClassName?: string;
	/** Active state — appends `active` class (useful for toggle buttons). */
	active?: boolean;
}

/**
 * Unified flashcard button.
 *
 * `preset` shapes the button, `variant` colors it, and the two compose:
 * `preset="show" variant="green"` renders `flashcard-btn-show flashcard-btn-green`.
 *
 * The rendered element defaults to `type="button"` and marks its icon as
 * decorative (`aria-hidden`), so callers only need to provide an accessible
 * name when the button has no visible text.
 *
 * Usage examples:
 * ```tsx
 * <FlashcardButton variant="green" onClick={handleSave}>Save</FlashcardButton>
 * <FlashcardButton preset="icon" icon={X} onClick={onClose} title="Close" />
 * <FlashcardButton variant="blue" icon={Target} active={isActive}>Practice</FlashcardButton>
 * ```
 */
export const FlashcardButton = React.forwardRef<HTMLButtonElement, FlashcardButtonProps>(
	function FlashcardButton(
		{
			variant,
			size = "md",
			preset,
			rating,
			icon: Icon,
			iconSize,
			className: extraClassName = "",
			iconClassName,
			active = false,
			children,
			...rest
		},
		ref,
	) {
		// Build class list
		const classes: string[] = ["flashcard-btn", `flashcard-btn-${size}`];

		if (preset) {
			classes.push(PRESET_CLASSES[preset]);
		}
		if (variant) {
			classes.push(`flashcard-btn-${variant}`);
		}
		if (rating !== undefined) {
			classes.push(`flashcard-rating-${rating}`);
		}
		if (active) {
			classes.push("active");
		}
		if (extraClassName) {
			classes.push(extraClassName);
		}

		// Resolve icon size
		const resolvedIconSize =
			iconSize ??
			(preset !== undefined && COMPACT_ICON_PRESETS.has(preset)
				? COMPACT_ICON_SIZE
				: DEFAULT_ICON_SIZE);

		return (
			// `type="button"` is the safe default; callers may override via `type`.
			<button ref={ref} type="button" className={classes.join(" ")} {...rest}>
				{Icon && (
					<Icon size={resolvedIconSize} className={iconClassName} aria-hidden="true" />
				)}
				{children}
			</button>
		);
	},
);
