import { describe, expect, it, vi } from "vitest";
import { SelectionHelper } from "../selectionHelper";
import type {
	SelectionDictionaryAdapter,
	SelectionHelperSettings,
	SelectionLookupSession,
	SelectionLookupSnapshot,
	SelectionTranslationAdapter,
} from "../types";

describe("SelectionHelper", () => {
	it("filters selected sources in catalog order and owns the lookup lifetime", () => {
		const { session, dispose } = fakeSession();
		const startLookup = vi.fn(() => session);
		const { helper } = setup({
			settings: { enabled: true, modifier: "none", selectedDictionaries: ["b", "a"] },
			startLookup,
		});

		helper.handleSelection(candidate("hello world"));
		expect(helper.getSnapshot()).toMatchObject({
			visible: true,
			mode: "actions",
			canLookup: true,
			canTranslate: true,
		});

		helper.beginLookup();
		expect(startLookup).toHaveBeenCalledWith("hello world", ["a", "b"]);
		expect(helper.getSnapshot().mode).toBe("dictionary");

		helper.dismiss();
		expect(dispose).toHaveBeenCalledOnce();
		expect(helper.getSnapshot().visible).toBe(false);
	});

	it("keeps stale explicit source ids without falling back to all sources", () => {
		const startLookup = vi.fn();
		const { helper } = setup({
			settings: { enabled: true, modifier: "none", selectedDictionaries: ["missing"] },
			startLookup,
		});

		helper.handleSelection(candidate("hello"));

		expect(helper.getSnapshot().canLookup).toBe(false);
		helper.beginLookup();
		expect(startLookup).not.toHaveBeenCalled();
	});

	it("replaces the previous selection session and discards later updates", () => {
		const { session, dispose } = fakeSession();
		const { helper } = setup({ startLookup: () => session });
		helper.handleSelection(candidate("first"));
		helper.beginLookup();

		helper.handleSelection(candidate("second"));

		expect(dispose).toHaveBeenCalledOnce();
		expect(helper.getSnapshot().target?.text).toBe("second");
		expect(helper.getSnapshot().lookup).toBeNull();
	});

	it("closes before handing text to the translation adapter", async () => {
		const openPrefilled = vi.fn().mockResolvedValue(undefined);
		const { helper } = setup({ openPrefilled });
		helper.handleSelection(candidate("一段中文"));

		await helper.translate();

		expect(helper.getSnapshot().visible).toBe(false);
		expect(openPrefilled).toHaveBeenCalledWith("一段中文");
	});

	it("honors the configured modifier and eligible note context", () => {
		const { helper } = setup({
			settings: { enabled: true, modifier: "alt", selectedDictionaries: [] },
		});
		helper.handleSelection(candidate("hello", { altKey: false }));
		expect(helper.getSnapshot().visible).toBe(false);
		helper.handleSelection(candidate("hello", { altKey: true, eligibleContext: false }));
		expect(helper.getSnapshot().visible).toBe(false);
		helper.handleSelection(candidate("hello", { altKey: true }));
		expect(helper.getSnapshot().visible).toBe(true);
	});
});

function setup(
	overrides: {
		settings?: SelectionHelperSettings;
		startLookup?: SelectionDictionaryAdapter["startLookup"];
		openPrefilled?: SelectionTranslationAdapter["openPrefilled"];
	} = {},
) {
	const settings =
		overrides.settings ??
		({
			enabled: true,
			modifier: "none",
			selectedDictionaries: [],
		} satisfies SelectionHelperSettings);
	const dictionary: SelectionDictionaryAdapter = {
		sources: () => [
			{ id: "a", label: "A", kind: "dictionary" },
			{ id: "b", label: "B", kind: "ai" },
		],
		startLookup: overrides.startLookup ?? (() => fakeSession().session),
		openInMainTab: vi.fn().mockResolvedValue(undefined),
	};
	const translation: SelectionTranslationAdapter = {
		available: () => true,
		openPrefilled: overrides.openPrefilled ?? vi.fn().mockResolvedValue(undefined),
	};
	return { helper: new SelectionHelper({ settings: () => settings, dictionary, translation }) };
}

function candidate(
	text: string,
	overrides: Partial<Parameters<SelectionHelper["handleSelection"]>[0]> = {},
) {
	return {
		text,
		x: 10,
		y: 20,
		eligibleContext: true,
		altKey: false,
		shiftKey: false,
		ctrlOrMetaKey: false,
		...overrides,
	};
}

function fakeSession(): { session: SelectionLookupSession; dispose: ReturnType<typeof vi.fn> } {
	const snapshot: SelectionLookupSnapshot = {
		query: "hello",
		activeSourceId: "a",
		aiEngineName: "",
		status: "loading",
		sources: [],
	};
	const dispose = vi.fn();
	return {
		dispose,
		session: {
			getSnapshot: () => snapshot,
			subscribe: () => () => {},
			selectSource: vi.fn(),
			retry: vi.fn().mockResolvedValue(undefined),
			generateAi: vi.fn().mockResolvedValue(undefined),
			dispose,
		},
	};
}
