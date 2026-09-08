# UI Primitives and Shared Components

## Button

- File: `src/ui/primitives/Button/Button.tsx`
- Description: Versatile button with primary/secondary/ghost/danger tones and sm/md/lg sizes

````tsx
import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Visual variant for the button.
 * Maps directly to CSS classes: `flashcard-btn-{variant}`
 */
export type ButtonVariant =
	"primary" | "secondary" | "danger" | "green" | "blue" | "purple" | "orange" | "red" | "gray";

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
	"icon" | "show" | "prev" | "rating" | "practice-wrong" | "practice-correct";

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
````

## Input

- File: `src/ui/primitives/Input/Input.tsx`
- Description: Text input with error states and clear button

```tsx
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
```

## Select

- File: `src/ui/primitives/Select/Select.tsx`
- Description: Custom select dropdown primitive

```tsx
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
```

## Checkbox

- File: `src/ui/primitives/Checkbox/Checkbox.tsx`
- Description: Accessible checkbox with label support

```tsx
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
```

## Slider

- File: `src/ui/primitives/Slider/Slider.tsx`
- Description: Slider control for range selection

```tsx
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
```

## ConfirmDialog

- File: `src/ui/primitives/ConfirmDialog/ConfirmDialog.tsx`
- Description: Confirmation alert dialog with confirm/cancel action

```tsx
import React, { memo, useId } from "react";
import { AlertTriangle, Check, Sparkles, X } from "lucide-react";
import { FlashcardButton } from "../Button";
import { ModalSurface } from "../Modal";

export type ConfirmDialogTone = "primary" | "danger";

export interface ConfirmDialogProps {
	title: string;
	message: string;
	confirmText: string;
	cancelText: string;
	kicker: string;
	tone?: ConfirmDialogTone;
	onConfirm: () => void;
	onCancel: () => void;
}

export const ConfirmDialog = memo(function ConfirmDialog({
	title,
	message,
	confirmText,
	cancelText,
	kicker,
	tone = "primary",
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	const titleId = useId();
	const descriptionId = useId();
	const Icon = tone === "danger" ? AlertTriangle : Sparkles;

	return (
		<ModalSurface
			className={`flashcard-confirm-dialog is-${tone}`}
			backdropClassName="flashcard-confirm-backdrop"
			role="alertdialog"
			labelledBy={titleId}
			describedBy={descriptionId}
			onRequestClose={onCancel}
		>
			{({ requestClose, initialFocusProps }) => (
				<>
					<div className="flashcard-confirm-accent" aria-hidden="true" />
					<div className="flashcard-modal-header flashcard-confirm-header">
						<div className="flashcard-confirm-heading">
							<span className="flashcard-confirm-icon" aria-hidden="true">
								<Icon size={20} />
							</span>
							<div className="flashcard-modal-heading">
								<span className="flashcard-modal-kicker fc-kicker">{kicker}</span>
								<h2 id={titleId} className="flashcard-confirm-title">
									{title}
								</h2>
							</div>
						</div>
						<FlashcardButton
							preset="icon"
							icon={X}
							onClick={requestClose}
							title={cancelText}
							aria-label={cancelText}
						/>
					</div>

					<div className="flashcard-modal-body flashcard-confirm-body">
						<p id={descriptionId}>{message}</p>
					</div>

					<div className="flashcard-modal-footer flashcard-confirm-footer">
						<FlashcardButton
							variant="secondary"
							className="flashcard-confirm-cancel"
							onClick={requestClose}
							{...initialFocusProps}
						>
							{cancelText}
						</FlashcardButton>
						<FlashcardButton
							variant={tone === "danger" ? "danger" : "primary"}
							icon={Check}
							onClick={onConfirm}
						>
							{confirmText}
						</FlashcardButton>
					</div>
				</>
			)}
		</ModalSurface>
	);
});
```

## Modal

- File: `src/ui/primitives/Modal/Modal.tsx`
- Description: Accessible modal dialog wrapper with focus management

```tsx
import React, {
	createContext,
	useCallback,
	useContext,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	canRequestModalClose,
	getModalFocusDestination,
	getModalLayer,
	registerModal,
	unregisterModal,
	type ModalId,
} from "./modalBehavior";

const FOCUSABLE_SELECTOR = [
	"button:not([disabled])",
	"[href]",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[contenteditable="true"]',
	'[tabindex]:not([tabindex="-1"])',
].join(", ");

const INITIAL_FOCUS_SELECTOR = "[data-modal-initial-focus]";
const INITIAL_FOCUS_PROPS = { "data-modal-initial-focus": "" } as const;

interface ModalContextValue {
	host: HTMLElement;
	stack: readonly ModalId[];
	register: (modalId: ModalId) => () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

interface ModalProviderProps {
	host: HTMLElement;
	children: React.ReactNode;
}

export function ModalProvider({ host, children }: ModalProviderProps) {
	const [stack, setStack] = useState<readonly ModalId[]>([]);
	const register = useCallback((modalId: ModalId) => {
		setStack((current) => registerModal(current, modalId));
		return () => {
			setStack((current) => unregisterModal(current, modalId));
		};
	}, []);
	const value = useMemo(() => ({ host, stack, register }), [host, register, stack]);

	return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

interface ModalControls {
	requestClose: () => void;
	initialFocusProps: typeof INITIAL_FOCUS_PROPS;
}

interface ModalSurfaceProps {
	children: (controls: ModalControls) => React.ReactNode;
	onRequestClose: () => void;
	isDismissible?: boolean;
	role?: "dialog" | "alertdialog";
	labelledBy: string;
	describedBy?: string;
	className?: string;
	backdropClassName?: string;
}

export function ModalSurface({
	children,
	onRequestClose,
	isDismissible = true,
	role = "dialog",
	labelledBy,
	describedBy,
	className,
	backdropClassName,
}: ModalSurfaceProps) {
	const context = useContext(ModalContext);
	if (!context) {
		throw new Error("ModalSurface must be rendered inside ModalProvider");
	}

	const modalId = useId();
	const panelRef = useRef<HTMLDivElement | null>(null);
	const [previouslyFocused] = useState(() =>
		asFocusableElement(context.host.ownerDocument.activeElement),
	);
	const hasActivatedRef = useRef(false);
	const restoreFrameRef = useRef<number | null>(null);
	const { host, register, stack } = context;
	const { index, isTopmost } = getModalLayer(stack, modalId);

	useLayoutEffect(() => register(modalId), [modalId, register]);

	useLayoutEffect(() => {
		if (!isTopmost) return;
		const panel = panelRef.current;
		if (!panel) return;
		if (!hasActivatedRef.current) {
			hasActivatedRef.current = true;
			focusInitialElement(panel);
			return;
		}
		if (!panel.contains(host.ownerDocument.activeElement)) {
			focusInitialElement(panel);
		}
	}, [host, isTopmost]);

	useLayoutEffect(() => {
		const ownerWindow = host.ownerDocument.defaultView;
		if (ownerWindow && restoreFrameRef.current !== null) {
			ownerWindow.cancelAnimationFrame(restoreFrameRef.current);
			restoreFrameRef.current = null;
		}
		return () => {
			if (!previouslyFocused) return;
			const restoreFocus = () => {
				if (previouslyFocused.isConnected) {
					previouslyFocused.focus({ preventScroll: true });
				}
			};
			if (ownerWindow) {
				restoreFrameRef.current = ownerWindow.requestAnimationFrame(() => {
					restoreFrameRef.current = null;
					restoreFocus();
				});
			} else {
				restoreFocus();
			}
		};
	}, [host, previouslyFocused]);

	const requestClose = useCallback(() => {
		if (canRequestModalClose(isTopmost, isDismissible)) {
			onRequestClose();
		}
	}, [isDismissible, isTopmost, onRequestClose]);

	const handleBackdropClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (event.target === event.currentTarget) requestClose();
		},
		[requestClose],
	);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (!isTopmost) return;
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				requestClose();
				return;
			}
			if (event.key !== "Tab") return;

			const panel = panelRef.current;
			if (!panel) return;
			const focusable = getFocusableElements(panel);
			const activeIndex = focusable.indexOf(host.ownerDocument.activeElement as HTMLElement);
			const destination = getModalFocusDestination(
				focusable.length,
				activeIndex,
				event.shiftKey,
			);
			if (destination === null) return;

			event.preventDefault();
			const target =
				destination === "container"
					? panel
					: destination === "first"
						? focusable[0]
						: focusable[focusable.length - 1];
			target?.focus({ preventScroll: true });
		},
		[host, isTopmost, requestClose],
	);

	const controls = useMemo(
		() => ({ requestClose, initialFocusProps: INITIAL_FOCUS_PROPS }),
		[requestClose],
	);
	const layerIndex = Math.max(index, 0);
	const backdropClasses = ["flashcard-modal-backdrop", backdropClassName]
		.filter(Boolean)
		.join(" ");
	const panelClasses = ["flashcard-modal", className].filter(Boolean).join(" ");

	return createPortal(
		// oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Backdrop click is supplemental; keyboard dismissal is handled by the dialog.
		<div
			className={backdropClasses}
			onClick={handleBackdropClick}
			aria-hidden={isTopmost ? undefined : true}
			inert={isTopmost ? undefined : true}
			style={{ zIndex: 999 + layerIndex }}
			role="presentation"
		>
			{/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- The runtime role is always dialog or alertdialog. */}
			<div
				ref={panelRef}
				className={panelClasses}
				role={role}
				aria-modal="true"
				aria-labelledby={labelledBy}
				aria-describedby={describedBy}
				tabIndex={-1}
				onKeyDown={handleKeyDown}
			>
				{children(controls)}
			</div>
		</div>,
		host,
	);
}

function focusInitialElement(panel: HTMLElement): void {
	const focusable = getFocusableElements(panel);
	const marked = panel.querySelector<HTMLElement>(INITIAL_FOCUS_SELECTOR);
	const initialFocus = marked && focusable.includes(marked) ? marked : (focusable[0] ?? panel);
	initialFocus.focus({ preventScroll: true });
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(element) =>
			!element.hidden &&
			element.getAttribute("aria-hidden") !== "true" &&
			element.getAttribute("type") !== "hidden" &&
			!element.closest("[inert]"),
	);
}

function asFocusableElement(element: Element | null): HTMLElement | null {
	if (!element || typeof (element as HTMLElement).focus !== "function") return null;
	return element as HTMLElement;
}
```

## FlashcardHeader

- File: `src/ui/primitives/Header/FlashcardHeader.tsx`
- Description: Top navigation header with back button, title, status and action menu

````tsx
import React from "react";
import { ArrowLeft, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FlashcardButton } from "../Button";
import { useI18n } from "../../context/I18nContext";

export type FlashcardHeaderStatTone = "blue" | "green" | "orange" | "purple" | "red";

export interface FlashcardHeaderStat {
	key: string;
	value: React.ReactNode;
	label: React.ReactNode;
	tone: FlashcardHeaderStatTone;
	icon?: LucideIcon;
}

export interface FlashcardHeaderProps {
	/** Icon displayed next to the title (optional). */
	icon?: LucideIcon;
	/** Main header title. */
	title: React.ReactNode;
	/** Compact badge displayed after the title (optional). */
	badge?: React.ReactNode;
	/** Content rendered to the left of the title (optional). */
	left?: React.ReactNode;
	/** Content rendered to the right of the title (optional). */
	right?: React.ReactNode;
	/** When provided, renders a back button on the left that calls this handler. */
	onBack?: () => void;
	/** Accessible label for the back/close button. */
	backTitle?: string;
	/** Extra CSS class names appended to the header. */
	className?: string;
	/** Optional statistics rendered directly below the title row. */
	stats?: FlashcardHeaderStat[];
}

/**
 * Shared compact page header.
 *
 * Desktop keeps the title at the leading edge and actions at the trailing edge.
 * Mobile navigation keeps the title centered and swaps the close icon for a back arrow.
 *
 * @example
 * ```tsx
 * <FlashcardHeader icon={Brain} title="Study" onBack={onBack} />
 * ```
 */
export const FlashcardHeader: React.FC<FlashcardHeaderProps> = ({
	icon: Icon,
	title,
	badge,
	left,
	right,
	onBack,
	backTitle,
	className = "",
	stats,
}) => {
	const { t } = useI18n();
	const navigationLabel = backTitle ?? t("common.back");
	const desktopBackButton = (
		<FlashcardButton
			preset="icon"
			icon={X}
			iconSize={18}
			onClick={onBack}
			title={navigationLabel}
			aria-label={navigationLabel}
		/>
	);
	const mobileBackButton = (
		<FlashcardButton
			preset="icon"
			icon={ArrowLeft}
			iconSize={20}
			onClick={onBack}
			title={navigationLabel}
			aria-label={navigationLabel}
		/>
	);
	const classes = [
		"flashcard-common-header",
		"flashcard-navigation-header",
		onBack ? "has-back" : "",
		className,
	]
		.filter(Boolean)
		.join(" ");

	const header = (
		<header className={classes}>
			<div className="flashcard-header-left">
				{onBack && <span className="flashcard-header-back-mobile">{mobileBackButton}</span>}
				{left}
			</div>
			<div className="flashcard-header-center">
				{Icon && <Icon size={18} />}
				<div className="flashcard-header-title-content">{title}</div>
				{badge && <span className="flashcard-header-badge">{badge}</span>}
			</div>
			<div className="flashcard-header-right">
				{right}
				{onBack && (
					<span className="flashcard-header-back-desktop">{desktopBackButton}</span>
				)}
			</div>
		</header>
	);

	if (!stats || stats.length === 0) return header;

	return (
		<div className="flashcard-page-header">
			{header}
			<div className="flashcard-header-overview">
				<ul className={`flashcard-header-stats columns-${stats.length}`}>
					{stats.map(({ key, value, label, tone, icon: StatIcon }) => (
						<li className="flashcard-header-stat" key={key}>
							{StatIcon && <StatIcon size={16} />}
							<span className={`flashcard-header-stat-value tone-${tone}`}>
								{value}
							</span>
							<span className="flashcard-header-stat-label">{label}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
};
````

## SessionTimer

- File: `src/ui/primitives/SessionTimer/SessionTimer.tsx`
- Description: Session countdown and elapsed timer

```tsx
import React, { memo, useEffect, useState } from "react";

function getElapsedSeconds(startTime: number): number {
	return Math.floor((Date.now() - startTime) / 1000);
}

export function formatElapsedTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

interface SessionTimerProps {
	startTime: number;
	className?: string;
}

export const SessionTimer = memo(function SessionTimer({
	startTime,
	className,
}: SessionTimerProps) {
	const [elapsedTime, setElapsedTime] = useState(() => getElapsedSeconds(startTime));

	useEffect(() => {
		setElapsedTime(getElapsedSeconds(startTime));
		const interval = window.setInterval(() => {
			setElapsedTime(getElapsedSeconds(startTime));
		}, 1000);

		return () => window.clearInterval(interval);
	}, [startTime]);

	return <span className={className}>{formatElapsedTime(elapsedTime)}</span>;
});
```

## SessionToolbar

- File: `src/ui/primitives/SessionToolbar/SessionToolbar.tsx`
- Description: Bottom session action toolbar

```tsx
import React from "react";
import { ChevronDown, Pencil, Trash2, Volume2, VolumeX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FlashcardButton } from "../Button";
import { FlashcardHeader } from "../Header";
import { SessionTimer } from "../SessionTimer";
import { useI18n } from "../../context/I18nContext";

export interface SessionToolbarProps {
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
```

## SetupSelector

- File: `src/ui/primitives/SetupSelector/SetupSelector.tsx`
- Description: Option selector grid/pills for study/practice setup

```tsx
import React from "react";
import type { LucideIcon } from "lucide-react";
import { FlashcardButton } from "../Button";

export interface SetupControlGroupProps {
	icon: LucideIcon;
	title: React.ReactNode;
	note: React.ReactNode;
	children: React.ReactNode;
}

export const SetupControlGroup: React.FC<SetupControlGroupProps> = ({
	icon: Icon,
	title,
	note,
	children,
}) => {
	return (
		<section className="flashcard-setup-control-group">
			<div className="flashcard-setup-control-copy">
				<span className="flashcard-setup-control-icon" aria-hidden="true">
					<Icon size={17} />
				</span>
				<div className="flashcard-setup-control-text">
					<div className="flashcard-setup-control-title">{title}</div>
					<div className="flashcard-setup-control-note">{note}</div>
				</div>
			</div>
			<div className="flashcard-setup-control-body">{children}</div>
		</section>
	);
};

export interface SetupSelectorOption<T extends string> {
	value: T;
	label: React.ReactNode;
	icon: LucideIcon;
}

export interface SetupSelectorProps<T extends string> {
	value: T;
	options: SetupSelectorOption<T>[];
	ariaLabel: string;
	onChange: (value: T) => void;
}

export function SetupSelector<T extends string>({
	value,
	options,
	ariaLabel,
	onChange,
}: SetupSelectorProps<T>): React.JSX.Element {
	return (
		<fieldset className="flashcard-setup-segmented" aria-label={ariaLabel}>
			{options.map((option) => (
				<FlashcardButton
					key={option.value}
					type="button"
					icon={option.icon}
					iconSize={16}
					className="flashcard-setup-segment-btn"
					active={value === option.value}
					aria-pressed={value === option.value}
					onClick={() => onChange(option.value)}
				>
					<span className="flashcard-setup-segment-label">{option.label}</span>
				</FlashcardButton>
			))}
		</fieldset>
	);
}
```

## PronunciationButton

- File: `src/ui/primitives/PronunciationButton/PronunciationButton.tsx`
- Description: TTS pronunciation audio trigger button

```tsx
import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { Notice } from "obsidian";
import type {
	PronunciationFailureReason,
	PronunciationRuntime,
	PronunciationSnapshot,
} from "../../../pronunciation";
import { normalizePronunciationText } from "../../../pronunciation";
import { useI18n } from "../../context/I18nContext";
import { FlashcardButton } from "../Button";

export interface PronunciationButtonProps {
	text: string;
}

export interface PronunciationButtonRuntimeProps extends PronunciationButtonProps {
	runtime: PronunciationRuntime;
}

/**
 * Snapshot fields that can change whether a text is speakable.
 */
function getAvailabilityKey(text: string, snapshot: PronunciationSnapshot): string {
	return JSON.stringify([
		text,
		snapshot.voicesLoaded,
		snapshot.hasLocalEnglishVoice,
		snapshot.settings,
		snapshot.cacheUsage.status,
	]);
}

export const PronunciationButton: React.FC<PronunciationButtonRuntimeProps> = ({
	text,
	runtime,
}) => {
	const { t } = useI18n();
	const subscribe = useCallback((listener: () => void) => runtime.subscribe(listener), [runtime]);
	const getSnapshot = useCallback(() => runtime.getSnapshot(), [runtime]);
	const snapshot = useSyncExternalStore(subscribe, getSnapshot);
	const normalizedText = normalizePronunciationText(text);
	const [availability, setAvailability] = useState({
		text: "",
		available: false,
	});

	const availabilityKey = getAvailabilityKey(normalizedText, snapshot);

	useEffect(() => {
		let active = true;
		void runtime
			.canSpeak(normalizedText)
			.then((canSpeak) => {
				if (active) {
					setAvailability({
						text: normalizedText,
						available: canSpeak,
					});
				}
			})
			.catch(() => {
				if (active) {
					setAvailability({
						text: normalizedText,
						available: false,
					});
				}
			});
		return () => {
			active = false;
		};
	}, [normalizedText, availabilityKey, runtime]);

	if (availability.text !== normalizedText || !availability.available) return null;

	const isSpeaking = snapshot.speakingText === normalizedText;
	const label = t("pronunciation.play", { word: normalizedText });

	return (
		<FlashcardButton
			preset="icon"
			icon={Volume2}
			className={`flashcard-pronunciation-button ${isSpeaking ? "is-speaking" : ""}`}
			aria-label={label}
			title={label}
			aria-pressed={isSpeaking}
			onClick={() => {
				void runtime
					.speak(normalizedText, "manual")
					.then((outcome) => {
						if (outcome.status === "failed" || outcome.status === "unavailable") {
							new Notice(getFailureMessage(outcome.reason, t));
						}
					})
					.catch(() => new Notice(t("pronunciation.failed")));
			}}
		/>
	);
};

function getFailureMessage(
	reason: PronunciationFailureReason,
	t: ReturnType<typeof useI18n>["t"],
): string {
	switch (reason) {
		case "offline":
			return t("pronunciation.offline");
		case "not-configured":
			return t("pronunciation.notConfigured");
		case "unauthorized":
			return t("pronunciation.unauthorized");
		case "quota":
			return t("pronunciation.quota");
		default:
			return t("pronunciation.failed");
	}
}
```
