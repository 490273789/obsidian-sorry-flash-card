import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../../core/host/settingsSlices";
import { createFakeWorkbenchHost } from "../../../core/host/__tests__/fakeWorkbenchHost";
import { createSelectionPopupFeature } from "../feature";

describe("selectionPopup feature", () => {
	it("registers its settings section with correct order and definitions", () => {
		const fakePlugin = { registerDomEvent: vi.fn() };
		const feature = createSelectionPopupFeature({
			plugin: fakePlugin as never,
			getDictionaryController: () => null,
			openDictionaryInMainTab: vi.fn(),
			translateInMainTab: vi.fn(),
		});

		const fakeHost = createFakeWorkbenchHost(DEFAULT_SETTINGS);
		feature.render(fakeHost.host);

		const popupSection = fakeHost.sections.get("selectionPopup");
		expect(popupSection).toBeDefined();
		expect(popupSection?.order).toBe(4);

		const defs = popupSection?.definitions("zh");
		expect(defs).toHaveLength(1);
		expect(defs?.[0]?.type).toBe("group");
		expect(defs?.[0]?.heading).toBe("划词助手");
		expect(defs?.[0]?.items.length).toBeGreaterThanOrEqual(2);
		expect(defs?.[0]?.items.some((item) => item.name === "启用划词快捷浮窗")).toBe(true);
		expect(defs?.[0]?.items.some((item) => item.name === "触发修饰键")).toBe(true);
	});

	it("stops cleanly without errors", () => {
		const fakePlugin = { registerDomEvent: vi.fn() };
		const feature = createSelectionPopupFeature({
			plugin: fakePlugin as never,
			getDictionaryController: () => null,
			openDictionaryInMainTab: vi.fn(),
			translateInMainTab: vi.fn(),
		});

		const fakeHost = createFakeWorkbenchHost(DEFAULT_SETTINGS);
		feature.render(fakeHost.host);
		expect(() => feature.stop()).not.toThrow();
	});
});
