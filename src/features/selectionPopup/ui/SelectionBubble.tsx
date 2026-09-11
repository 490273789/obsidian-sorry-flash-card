import React, { useEffect, useRef } from "react";
import { BookOpen, Languages } from "lucide-react";
import { cls } from "../../../core/shared/classNames";
import type { SelectionPopupStrings } from "../strings/selectionPopup";
import styles from "./SelectionPopup.module.scss";

export interface SelectionBubbleProps {
	text: string;
	isEnglishWord: boolean;
	strings: SelectionPopupStrings;
	onLookup: () => void;
	onTranslate: () => void;
	onClose: () => void;
}

export const SelectionBubble = React.memo(function SelectionBubble({
	isEnglishWord,
	strings,
	onLookup,
	onTranslate,
	onClose,
}: SelectionBubbleProps) {
	const lookupRef = useRef<HTMLButtonElement | null>(null);
	const translateRef = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		if (isEnglishWord) {
			lookupRef.current?.focus();
		} else {
			translateRef.current?.focus();
		}
	}, [isEnglishWord]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				onClose();
				return;
			}

			if (event.key === "1") {
				event.preventDefault();
				event.stopPropagation();
				if (isEnglishWord) {
					onLookup();
				} else {
					onTranslate();
				}
				return;
			}

			if (event.key === "2" || event.key === "t" || event.key === "T") {
				event.preventDefault();
				event.stopPropagation();
				onTranslate();
				return;
			}

			if (event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				if (isEnglishWord) {
					if (document.activeElement === translateRef.current) {
						onTranslate();
					} else {
						onLookup();
					}
				} else {
					onTranslate();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown, true);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
		};
	}, [isEnglishWord, onLookup, onTranslate, onClose]);

	return (
		<div
			className={styles.bubble}
			role="toolbar"
			aria-label={strings.settingsHeading}
			tabIndex={-1}
		>
			{isEnglishWord && (
				<button
					ref={lookupRef}
					type="button"
					className={cls(styles.button, styles.buttonPrimary)}
					onClick={(e) => {
						e.stopPropagation();
						onLookup();
					}}
					title={strings.lookup}
				>
					<BookOpen aria-hidden="true" />
					<span>{strings.lookup}</span>
					<span className={styles.hint}>[1]</span>
				</button>
			)}
			<button
				ref={translateRef}
				type="button"
				className={cls(styles.button, !isEnglishWord && styles.buttonPrimary)}
				onClick={(e) => {
					e.stopPropagation();
					onTranslate();
				}}
				title={strings.translate}
			>
				<Languages aria-hidden="true" />
				<span>{strings.translate}</span>
				<span className={styles.hint}>{isEnglishWord ? "[2]" : "[↵]"}</span>
			</button>
		</div>
	);
});
