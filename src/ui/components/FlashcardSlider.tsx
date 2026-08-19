import React, { useMemo } from "react";

export interface FlashcardSliderProps extends Omit<
	React.InputHTMLAttributes<HTMLInputElement>,
	"type"
> {
	/** Minimum value, defaults to 0 */
	min?: number | string;
	/** Maximum value, defaults to 100 */
	max?: number | string;
	/** Step increment, defaults to 1 */
	step?: number | string;
	/** Invalid state for validation feedback */
	invalid?: boolean;
	/** Optional wrapper class name on the outer container */
	wrapperClassName?: string;
}

/**
 * Custom-styled range slider component.
 * Features a high-contrast visible track, dynamic progress fill, and smooth thumb.
 */
export const FlashcardSlider = React.forwardRef<HTMLInputElement, FlashcardSliderProps>(
	function FlashcardSlider(
		{
			className = "",
			wrapperClassName = "",
			min = 0,
			max = 100,
			step = 1,
			value,
			defaultValue,
			invalid = false,
			disabled = false,
			style,
			"aria-invalid": ariaInvalid,
			...props
		},
		ref,
	) {
		const numMin = Number(min);
		const numMax = Number(max);
		const rawVal =
			value !== undefined ? value : defaultValue !== undefined ? defaultValue : min;
		const numVal = Number(rawVal);

		const percentage = useMemo(() => {
			if (isNaN(numVal) || isNaN(numMin) || isNaN(numMax) || numMax <= numMin) {
				return 0;
			}
			const clamped = Math.min(Math.max(numVal, numMin), numMax);
			return ((clamped - numMin) / (numMax - numMin)) * 100;
		}, [numVal, numMin, numMax]);

		const sliderStyle = useMemo(() => {
			return {
				"--slider-progress": `${percentage}%`,
				...style,
			} as React.CSSProperties;
		}, [percentage, style]);

		const rootClassName = [
			"flashcard-slider-wrapper",
			disabled ? "is-disabled" : "",
			invalid ? "is-invalid" : "",
			wrapperClassName,
		]
			.filter(Boolean)
			.join(" ");

		return (
			<div className={rootClassName}>
				<input
					ref={ref}
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					defaultValue={defaultValue}
					disabled={disabled}
					className={`flashcard-slider ${className}`.trim()}
					style={sliderStyle}
					aria-invalid={ariaInvalid ?? (invalid || undefined)}
					{...props}
				/>
			</div>
		);
	},
);
