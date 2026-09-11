import React from "react";
import { Check } from "lucide-react";

export interface FlashcardCheckboxProps extends Omit<
	React.InputHTMLAttributes<HTMLInputElement>,
	"type"
> {
	/** Optional label content rendered alongside the checkbox. */
	label?: React.ReactNode;
	/** Optional wrapper class name on the outer label element. */
	wrapperClassName?: string;
	/** Invalid state for validation feedback. */
	invalid?: boolean;
}

/**
 * Custom-styled checkbox component.
 * Renders an accessible native checkbox input alongside a theme-immune visual check box.
 */
export const FlashcardCheckbox = React.forwardRef<HTMLInputElement, FlashcardCheckboxProps>(
	function FlashcardCheckbox(
		{
			className = "",
			wrapperClassName = "",
			label,
			invalid = false,
			disabled = false,
			children,
			"aria-invalid": ariaInvalid,
			...props
		},
		ref,
	) {
		const rootClassName = [
			"flashcard-checkbox",
			disabled ? "is-disabled" : "",
			invalid ? "is-invalid" : "",
			wrapperClassName,
		]
			.filter(Boolean)
			.join(" ");

		const content = label ?? children;

		return (
			<label className={rootClassName}>
				<input
					ref={ref}
					type="checkbox"
					className={`flashcard-checkbox-native ${className}`.trim()}
					disabled={disabled}
					aria-invalid={ariaInvalid ?? (invalid || undefined)}
					{...props}
				/>
				<span className="flashcard-checkbox-box" aria-hidden="true">
					<Check className="flashcard-checkbox-icon" size={13} strokeWidth={3} />
				</span>
				{content && <span className="flashcard-checkbox-label">{content}</span>}
			</label>
		);
	},
);
