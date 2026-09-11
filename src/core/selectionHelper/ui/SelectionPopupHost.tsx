import React, { useCallback, useMemo, useSyncExternalStore } from "react";
import type { SelectionHelper } from "../domain/selectionHelper";
import type { SelectionHelperStrings } from "../strings/selectionPopup";
import { SelectionBubble } from "./SelectionBubble";
import { SelectionDictCard } from "./SelectionDictCard";
import styles from "./SelectionPopup.module.scss";

export interface SelectionPopupHostProps {
	helper: SelectionHelper;
	strings: SelectionHelperStrings;
}

export const SelectionPopupHost: React.FC<SelectionPopupHostProps> = ({ helper, strings }) => {
	const subscribe = useCallback((listener: () => void) => helper.subscribe(listener), [helper]);
	const getSnapshot = useCallback(() => helper.getSnapshot(), [helper]);
	const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const target = state.target;
	const mode = state.mode;

	const position = useMemo(() => {
		if (!target) return { left: 0, top: 0 };
		const isCard = mode === "dictionary";
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

	if (!target) return null;

	return (
		<div className={styles.root} style={{ left: position.left, top: position.top }}>
			{mode === "actions" ? (
				<SelectionBubble
					canLookup={state.canLookup}
					canTranslate={state.canTranslate}
					strings={strings}
					onLookup={() => helper.beginLookup()}
					onTranslate={() => void helper.translate()}
					onClose={() => helper.dismiss()}
				/>
			) : state.lookup ? (
				<SelectionDictCard
					query={target.text}
					lookup={state.lookup}
					strings={strings}
					onSelectSource={(sourceId) => helper.selectSource(sourceId)}
					onRetry={(sourceId) => void helper.retry(sourceId)}
					onGenerateAi={() => void helper.generateAi()}
					onOpenInMainTab={() => void helper.openDictionaryInMainTab()}
					onClose={() => helper.dismiss()}
				/>
			) : null}
		</div>
	);
};
