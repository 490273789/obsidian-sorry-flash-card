import React, { memo, useEffect, useId, useRef } from "react";
import ReactDOM from "react-dom";
import { AlertTriangle, Check, Sparkles, X } from "lucide-react";
import { FlashcardButton } from "./FlashcardButton";

export type ConfirmDialogTone = "primary" | "danger";

interface ConfirmDialogProps {
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
	const dialogRef = useRef<HTMLDivElement | null>(null);
	const Icon = tone === "danger" ? AlertTriangle : Sparkles;

	useEffect(() => {
		const previouslyFocused = activeDocument.activeElement;
		dialogRef.current?.querySelector<HTMLButtonElement>(".flashcard-confirm-cancel")?.focus();

		return () => {
			if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
		};
	}, []);

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
			return;
		}

		if (event.key !== "Tab") return;
		const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
		);
		if (!focusable?.length) return;

		const first = focusable[0]!;
		const last = focusable[focusable.length - 1]!;
		if (event.shiftKey && activeDocument.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && activeDocument.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget) onCancel();
	};

	const modal = (
		<div
			className="flashcard-modal-backdrop flashcard-confirm-backdrop"
			onClick={handleBackdropClick}
			onKeyDown={handleKeyDown}
			role="presentation"
		>
			<div
				ref={dialogRef}
				className={`flashcard-modal flashcard-confirm-dialog is-${tone}`}
				role="alertdialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
			>
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
						onClick={onCancel}
						title={cancelText}
						aria-label={cancelText}
					/>
				</div>

				<div className="flashcard-modal-body flashcard-confirm-body">
					<p id={descriptionId}>{message}</p>
				</div>

				<div className="flashcard-modal-footer flashcard-confirm-footer">
					<FlashcardButton
						variant="gray"
						className="flashcard-confirm-cancel"
						onClick={onCancel}
					>
						{cancelText}
					</FlashcardButton>
					<FlashcardButton
						variant={tone === "danger" ? "red" : "green"}
						icon={Check}
						onClick={onConfirm}
					>
						{confirmText}
					</FlashcardButton>
				</div>
			</div>
		</div>
	);

	const container = activeDocument.querySelector(".flashcard-root") ?? activeDocument.body;
	return ReactDOM.createPortal(modal, container);
});
