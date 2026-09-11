import { describe, expect, it } from "vitest";
import {
	DEFAULT_SELECTION_POPUP_SETTINGS,
	normalizeSelectionPopupModifier,
	normalizeSelectionPopupSettings,
	selectionPopupSettingsSlice,
} from "../selectionPopupSlice";

describe("selectionPopupSettingsSlice", () => {
	it("returns default settings", () => {
		expect(selectionPopupSettingsSlice.defaults()).toEqual({
			selectionPopup: DEFAULT_SELECTION_POPUP_SETTINGS,
		});
	});

	it("normalizes valid settings", () => {
		expect(
			normalizeSelectionPopupSettings({
				enabled: false,
				modifier: "alt",
			}),
		).toEqual({
			enabled: false,
			modifier: "alt",
		});
	});

	it("falls back to defaults on invalid inputs", () => {
		expect(normalizeSelectionPopupSettings(null)).toEqual(DEFAULT_SELECTION_POPUP_SETTINGS);
		expect(normalizeSelectionPopupSettings(undefined)).toEqual(
			DEFAULT_SELECTION_POPUP_SETTINGS,
		);
		expect(normalizeSelectionPopupSettings({ enabled: "yes", modifier: "invalid" })).toEqual({
			enabled: true,
			modifier: "none",
		});
	});

	it("normalizes modifiers correctly", () => {
		expect(normalizeSelectionPopupModifier("none")).toBe("none");
		expect(normalizeSelectionPopupModifier("alt")).toBe("alt");
		expect(normalizeSelectionPopupModifier("shift")).toBe("shift");
		expect(normalizeSelectionPopupModifier("ctrl")).toBe("ctrl");
		expect(normalizeSelectionPopupModifier("unknown")).toBe("none");
	});

	it("clones settings without mutating original", () => {
		const original = { selectionPopup: { enabled: true, modifier: "alt" as const } };
		const cloned = selectionPopupSettingsSlice.clone(original);
		expect(cloned).toEqual(original);
		cloned.selectionPopup.enabled = false;
		expect(original.selectionPopup.enabled).toBe(true);
	});
});
