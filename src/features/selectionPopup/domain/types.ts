export type SelectionPopupModifier = "none" | "alt" | "shift" | "ctrl";

export interface SelectionPopupSettings {
	/** Whether the selection popup helper is active. */
	enabled: boolean;
	/** Modifier key required to trigger the popup on selection mouseup. */
	modifier: SelectionPopupModifier;
	/** IDs of dictionary sources to display in the selection popup. */
	selectedDictionaries: string[];
}

export interface SelectionTarget {
	text: string;
	isEnglishWord: boolean;
	x: number;
	y: number;
}
