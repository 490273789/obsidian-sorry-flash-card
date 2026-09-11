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
	return {
		enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : true,
		modifier: normalizeSelectionPopupModifier(candidate.modifier),
	};
}

export const selectionPopupSettingsSlice: SettingsSlice<SelectionPopupSliceSettings> = {
	id: "selectionPopup",
	keys: ["selectionPopup"],

	defaults: () => ({
		selectionPopup: { ...DEFAULT_SELECTION_POPUP_SETTINGS },
	}),

	normalize: (raw) => ({
		selectionPopup: normalizeSelectionPopupSettings(settingsRecord(raw).selectionPopup),
	}),

	clone: (document) => ({
		selectionPopup: { ...document.selectionPopup },
	}),
};
