import React, { useState, useMemo } from "react";
import type { DictionaryController } from "../../dictionary/domain/controller";
import type { SelectionTarget } from "../domain/types";
import type { SelectionPopupStrings } from "../strings/selectionPopup";
import { SelectionBubble } from "./SelectionBubble";
import { SelectionDictCard } from "./SelectionDictCard";

export interface SelectionPopupHostProps {
	target: SelectionTarget;
	strings: SelectionPopupStrings;
	dictionaryController: DictionaryController | null;
	selectedDictionaries?: readonly string[];
	onLookupStart: (word: string) => void;
	onTranslate: (text: string) => void;
	onOpenDictionaryInMainTab: (word: string) => void;
	onClose: () => void;
}

export const SelectionPopupHost: React.FC<SelectionPopupHostProps> = ({
	target,
	strings,
	dictionaryController,
	selectedDictionaries,
	onLookupStart,
	onTranslate,
	onOpenDictionaryInMainTab,
	onClose,
}) => {
	const [mode, setMode] = useState<"bubble" | "dict">("bubble");

	const position = useMemo(() => {
		const isCard = mode === "dict";
		const width = isCard ? 390 : 200;
		const height = isCard ? 430 : 48;

		let left = target.x;
		let top = target.y + 12;

		if (left + width > window.innerWidth - 16) {
			left = Math.max(16, window.innerWidth - width - 16);
		} else {
			left = Math.max(16, left);
		}

		if (top + height > window.innerHeight - 16) {
			top = Math.max(16, target.y - height - 12);
		} else {
			top = Math.max(16, top);
		}

		return { left, top };
	}, [target, mode]);

	const handleLookup = () => {
		if (!dictionaryController) return;
		setMode("dict");
		onLookupStart(target.text);
	};

	return (
		<div
			className="fc-selection-popup-root"
			style={{ left: position.left, top: position.top }}
			onMouseDown={(e) => e.stopPropagation()}
		>
			{mode === "bubble" ? (
				<SelectionBubble
					text={target.text}
					isEnglishWord={target.isEnglishWord}
					strings={strings}
					onLookup={handleLookup}
					onTranslate={() => onTranslate(target.text)}
					onClose={onClose}
				/>
			) : dictionaryController ? (
				<SelectionDictCard
					query={target.text}
					controller={dictionaryController}
					selectedDictionaries={selectedDictionaries}
					strings={strings}
					onOpenInMainTab={(word) => onOpenDictionaryInMainTab(word)}
					onClose={onClose}
				/>
			) : null}
		</div>
	);
};
