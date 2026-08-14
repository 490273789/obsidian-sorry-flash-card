import React from "react";

export interface FlashcardInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
	invalid?: boolean;
}

export interface FlashcardTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
	invalid?: boolean;
}

function getControlClassName(
	baseClassName: string,
	className: string | undefined,
	invalid: boolean,
): string {
	return [baseClassName, invalid ? "is-invalid" : "", className ?? ""].filter(Boolean).join(" ");
}

/** Shared single-line form control. */
export const FlashcardInput = React.forwardRef<HTMLInputElement, FlashcardInputProps>(
	function FlashcardInput(
		{ className, invalid = false, "aria-invalid": ariaInvalid, ...props },
		ref,
	) {
		return (
			<input
				ref={ref}
				className={getControlClassName(
					"flashcard-control flashcard-input",
					className,
					invalid,
				)}
				aria-invalid={ariaInvalid ?? (invalid || undefined)}
				{...props}
			/>
		);
	},
);

/** Shared multiline form control with the same states as FlashcardInput. */
export const FlashcardTextarea = React.forwardRef<HTMLTextAreaElement, FlashcardTextareaProps>(
	function FlashcardTextarea(
		{ className, invalid = false, "aria-invalid": ariaInvalid, ...props },
		ref,
	) {
		return (
			<textarea
				ref={ref}
				className={getControlClassName(
					"flashcard-control flashcard-textarea",
					className,
					invalid,
				)}
				aria-invalid={ariaInvalid ?? (invalid || undefined)}
				{...props}
			/>
		);
	},
);
