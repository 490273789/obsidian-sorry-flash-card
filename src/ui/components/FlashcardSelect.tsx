import React from "react";
import { ChevronDown } from "lucide-react";

export interface FlashcardSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
	wrapperClassName?: string;
	invalid?: boolean;
}

/** Native select behavior with a consistent visual shell and theme-aware chevron. */
export const FlashcardSelect = React.forwardRef<HTMLSelectElement, FlashcardSelectProps>(
	function FlashcardSelect(
		{
			className = "",
			wrapperClassName = "",
			invalid = false,
			"aria-invalid": ariaInvalid,
			children,
			...props
		},
		ref,
	) {
		const selectClassName = [
			"flashcard-control",
			"flashcard-select",
			invalid ? "is-invalid" : "",
			className,
		]
			.filter(Boolean)
			.join(" ");

		return (
			<span
				className={`flashcard-select-shell${wrapperClassName ? ` ${wrapperClassName}` : ""}`}
			>
				<select
					ref={ref}
					className={selectClassName}
					aria-invalid={ariaInvalid ?? (invalid || undefined)}
					{...props}
				>
					{children}
				</select>
				<ChevronDown className="flashcard-select-icon" size={16} aria-hidden="true" />
			</span>
		);
	},
);
