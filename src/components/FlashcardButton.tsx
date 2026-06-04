import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Visual variant for the button.
 * Maps directly to CSS classes: `flashcard-btn-{variant}`
 */
export type ButtonVariant =
	| "green"
	| "blue"
	| "purple"
	| "orange"
	| "red"
	| "gray";

/**
 * Special button presets that override the default shape / behavior.
 * - `"icon"`       — compact square icon-only button
 * - `"back"`       — navigation back button with arrow prefix
 * - `"show"`       — full-width "Show Answer" button with sheen animation
 * - `"prev"`       — undo / previous-card button (square)
 * - `"rating"`     — FSRS rating button (used inside rating grid)
 * - `"practice-wrong"`  — practice wrong-answer button
 * - `"practice-correct"` — practice correct-answer button
 */
export type ButtonPreset =
	| "icon"
	| "back"
	| "show"
	| "prev"
	| "rating"
	| "practice-wrong"
	| "practice-correct";

interface FlashcardButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	/** Color variant — ignored when `preset` is set (preset implies its own color). */
	variant?: ButtonVariant;
	/** Special shape / behavior preset. Takes precedence over variant for class generation. */
	preset?: ButtonPreset;
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
 * Usage examples:
 * ```tsx
 * <FlashcardButton variant="green" onClick={handleSave}>Save</FlashcardButton>
 * <FlashcardButton preset="icon" icon={X} onClick={onClose} title="Close" />
 * <FlashcardButton variant="blue" icon={Target} active={isActive}>Practice</FlashcardButton>
 * <FlashcardButton preset="back" onClick={onBack}>Back</FlashcardButton>
 * ```
 */
export const FlashcardButton: React.FC<FlashcardButtonProps> = ({
	variant,
	preset,
	icon: Icon,
	iconSize,
	className: extraClassName = "",
	iconClassName,
	active = false,
	children,
	...rest
}) => {
	// Build class list
	const classes: string[] = ["flashcard-btn"];

	if (preset) {
		// Preset-specific classes
		switch (preset) {
			case "icon":
				classes.push("flashcard-btn-icon");
				break;
			case "back":
				classes.push("flashcard-btn-back");
				break;
			case "show":
				classes.push("flashcard-btn-green", "flashcard-btn-show");
				break;
			case "prev":
				classes.push("flashcard-btn-prev");
				break;
			case "rating":
				classes.push("flashcard-rating-btn");
				// variant is expected to be set as "rating-1" through "rating-5"
				// via className for rating buttons — handled by caller
				break;
			case "practice-wrong":
				classes.push("flashcard-practice-btn-wrong");
				break;
			case "practice-correct":
				classes.push("flashcard-practice-btn-correct");
				break;
		}
	} else if (variant) {
		classes.push(`flashcard-btn-${variant}`);
	}

	if (active) {
		classes.push("active");
	}

	if (extraClassName) {
		classes.push(extraClassName);
	}

	// Resolve icon size
	const resolvedIconSize =
		iconSize ?? (preset === "icon" || preset === "prev" ? 16 : 18);

	return (
		<button className={classes.join(" ")} {...rest}>
			{Icon && <Icon size={resolvedIconSize} className={iconClassName} />}
			{children}
		</button>
	);
};
