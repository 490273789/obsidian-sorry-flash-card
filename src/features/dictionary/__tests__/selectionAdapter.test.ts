import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DICTIONARY_SETTINGS } from "../domain/configuration";
import type { DictionaryViewState } from "../domain/types";
import {
	createDictionarySelectionAdapter,
	type DictionarySelectionController,
} from "../selectionAdapter";

describe("dictionary selection adapter", () => {
	it("reports enabled sources in 词典目录 order", () => {
		const { adapter } = setup(emptyDictionarySnapshot());
		expect(adapter.sources()).toEqual([
			{ id: "youdao", label: "有道词典", kind: "dictionary" },
			{ id: "ai", label: "AI 词典", kind: "ai" },
		]);
	});

	it("maps only the narrow presentation and marks complex content", () => {
		const state = emptyDictionarySnapshot();
		state.sources = [
			{
				id: "youdao",
				label: "有道词典",
				kind: "youdao",
				status: "success",
				error: "",
				activeSectionIndex: 0,
				result: {
					attribution: "",
					word: "science",
					pronunciations: [
						{ accent: "uk", label: "英", phonetic: "saɪəns", audioUrl: null },
					],
					sourceId: "youdao",
					sourceLabel: "有道词典",
					suggestions: [],
					sections: [
						{
							title: "释义",
							presentation: "stack",
							content: { kind: "list", items: ["科学"] },
						},
						{
							title: "HTML",
							presentation: "stack",
							content: { kind: "document", document: {} as never },
						},
					],
				},
			},
		];
		const { adapter } = setup(state);

		const snapshot = adapter.startLookup("science", ["youdao"])?.getSnapshot();

		expect(snapshot?.sources[0]).toMatchObject({
			id: "youdao",
			pronunciations: [{ label: "英", phonetic: "saɪəns" }],
			sections: [{ kind: "list", items: ["科学"] }],
			hasComplexContent: true,
		});
	});

	it("forwards semantic actions and disposes the isolated controller", async () => {
		const { adapter, spies } = setup(emptyDictionarySnapshot());
		const session = adapter.startLookup("science", ["youdao"])!;

		session.selectSource("youdao");
		await session.retry("youdao");
		await session.generateAi();
		session.dispose();

		expect(spies.selectSource).toHaveBeenCalledWith("youdao");
		expect(spies.retry).toHaveBeenCalledWith("youdao");
		expect(spies.loadAi).toHaveBeenCalledOnce();
		expect(spies.dispose).toHaveBeenCalledOnce();
	});
});

function setup(state: DictionaryViewState) {
	const spies = {
		selectSource: vi.fn(),
		retry: vi.fn().mockResolvedValue(undefined),
		loadAi: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn(),
	};
	const controller: DictionarySelectionController = {
		getSnapshot: () => state,
		subscribe: () => () => {},
		selectSource: spies.selectSource,
		retry: spies.retry,
		loadAi: spies.loadAi,
		dispose: spies.dispose,
	};
	const runtime = {
		settings: {
			getDictionarySettings: () => ({
				...structuredClone(DEFAULT_DICTIONARY_SETTINGS),
				sources: [
					{ id: "youdao", kind: "youdao" as const, label: "有道词典", enabled: true },
					{ id: "off", kind: "hujiang" as const, label: "沪江", enabled: false },
					{ id: "ai", kind: "ai" as const, label: "AI 词典", enabled: true },
				],
			}),
		},
		createSelectionLookupSession: vi.fn(() => controller),
	};
	return {
		spies,
		adapter: createDictionarySelectionAdapter({
			runtime: () => runtime,
			openInMainTab: vi.fn().mockResolvedValue(undefined),
		}),
	};
}

function emptyDictionarySnapshot(): DictionaryViewState {
	return {
		activeSourceId: null,
		aiEngineName: "",
		aiReady: false,
		history: [],
		input: "science",
		query: "science",
		sources: [],
		status: "loading",
	};
}
