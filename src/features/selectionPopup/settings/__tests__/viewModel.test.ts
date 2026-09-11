import { describe, expect, it, vi } from "vitest";
import { buildSelectionPopupSettingsViewModel } from "../viewModel";

describe("buildSelectionPopupSettingsViewModel", () => {
	it("builds settings view model in Chinese", async () => {
		const setEnabled = vi.fn();
		const setModifier = vi.fn();

		const vm = buildSelectionPopupSettingsViewModel(
			{ enabled: true, modifier: "alt" },
			{ setEnabled, setModifier },
			"zh",
		);

		expect(vm.type).toBe("group");
		expect(vm.heading).toBe("划词助手");
		expect(vm.items).toHaveLength(2);

		const toggle = vm.items[0]?.controls?.[0];
		expect(toggle?.type).toBe("toggle");
		if (toggle?.type === "toggle") {
			expect(toggle.value).toBe(true);
			await toggle.onChange(false);
			expect(setEnabled).toHaveBeenCalledWith(false);
		}

		const select = vm.items[1]?.controls?.[0];
		expect(select?.type).toBe("select");
		if (select?.type === "select") {
			expect(select.value).toBe("alt");
			expect(select.options).toHaveLength(4);
			await select.onChange("shift");
			expect(setModifier).toHaveBeenCalledWith("shift");
		}
	});

	it("builds settings view model in English", () => {
		const vm = buildSelectionPopupSettingsViewModel(
			{ enabled: false, modifier: "ctrl" },
			{ setEnabled: vi.fn(), setModifier: vi.fn() },
			"en",
		);

		expect(vm.heading).toBe("Selection Helper");
		expect(vm.items[0]?.name).toBe("Enable selection popup");
		expect(vm.items[1]?.name).toBe("Trigger modifier key");
	});
});
