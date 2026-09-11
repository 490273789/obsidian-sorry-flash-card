import { describe, expect, it, vi } from "vitest";
import { buildSelectionPopupSettingsViewModel } from "../viewModel";

describe("buildSelectionPopupSettingsViewModel", () => {
	it("builds settings view model in Chinese with dictionary toggles", async () => {
		const setEnabled = vi.fn();
		const setModifier = vi.fn();
		const toggleDictionary = vi.fn();

		const available = [
			{ id: "youdao", label: "有道词典" },
			{ id: "cambridge", label: "剑桥词典" },
		];

		const vm = buildSelectionPopupSettingsViewModel(
			{ enabled: true, modifier: "alt", selectedDictionaries: ["youdao"] },
			available,
			{ setEnabled, setModifier, toggleDictionary },
			"zh",
		);

		expect(vm.type).toBe("group");
		expect(vm.heading).toBe("划词助手");
		// 2 main settings + 1 section header + 2 dictionary toggles = 5 items
		expect(vm.items).toHaveLength(5);

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

		// Dictionary toggles:
		expect(vm.items[2]?.name).toBe("划词展示字典");
		expect(vm.items[3]?.name).toBe("有道词典");
		expect(vm.items[3]?.controls?.[0]?.type).toBe("toggle");
		if (vm.items[3]?.controls?.[0]?.type === "toggle") {
			expect(vm.items[3].controls[0].value).toBe(true);
		}

		expect(vm.items[4]?.name).toBe("剑桥词典");
		if (vm.items[4]?.controls?.[0]?.type === "toggle") {
			expect(vm.items[4].controls[0].value).toBe(false);
			await vm.items[4].controls[0].onChange(true);
			expect(toggleDictionary).toHaveBeenCalledWith("cambridge", true);
		}
	});

	it("builds settings view model in English", () => {
		const vm = buildSelectionPopupSettingsViewModel(
			{ enabled: false, modifier: "ctrl", selectedDictionaries: [] },
			[],
			{ setEnabled: vi.fn(), setModifier: vi.fn(), toggleDictionary: vi.fn() },
			"en",
		);

		expect(vm.heading).toBe("Selection Helper");
		expect(vm.items[0]?.name).toBe("Enable selection popup");
		expect(vm.items[1]?.name).toBe("Trigger modifier key");
	});
});
