import type {
	SelectionPopupModifier,
	SelectionPopupSettings,
} from "../../features/selectionPopup/domain/types";
import { settingsRecord, type SettingsSlice } from "./slice";

export interface SelectionPopupSliceSettings {
	selectionPopup: SelectionPopupSettings;
}

export const DEFAULT_SELECTION_POPUP_SETTINGS: SelectionPopupSettings = {
	enabled: true,
	modifier: "none",
	selectedDictionaries: [],
};

export function normalizeSelectionPopupModifier(value: unknown): SelectionPopupModifier {
	if (value === "alt" || value === "shift" || value === "ctrl") {
		return value;
	}
	return "none";
}

export function normalizeSelectionPopupSettings(value: unknown): SelectionPopupSettings {
	if (typeof value !== "object" || value === null) {
		return { ...DEFAULT_SELECTION_POPUP_SETTINGS };
	}
	const candidate = value as Record<string, unknown>;
	const selectedDictionaries = Array.isArray(candidate.selectedDictionaries)
		? candidate.selectedDictionaries.filter((item): item is string => typeof item === "string")
		: [];

	return {
		enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : true,
		modifier: normalizeSelectionPopupModifier(candidate.modifier),
		selectedDictionaries,
	};
}

export const selectionPopupSettingsSlice: SettingsSlice<SelectionPopupSliceSettings> = {
	id: "selectionPopup",
	keys: ["selectionPopup"],

	defaults: () => ({
		selectionPopup: {
			...DEFAULT_SELECTION_POPUP_SETTINGS,
			selectedDictionaries: [...DEFAULT_SELECTION_POPUP_SETTINGS.selectedDictionaries],
		},
	}),

	normalize: (raw) => ({
		selectionPopup: normalizeSelectionPopupSettings(settingsRecord(raw).selectionPopup),
	}),

	clone: (document) => ({
		selectionPopup: {
			...document.selectionPopup,
			selectedDictionaries: [...document.selectionPopup.selectedDictionaries],
		},
	}),
};
