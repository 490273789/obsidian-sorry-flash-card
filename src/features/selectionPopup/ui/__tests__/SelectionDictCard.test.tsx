import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DictionaryController } from "../../../dictionary/domain/controller";
import type { DictionaryViewState } from "../../../dictionary/domain/types";
import { selectionPopupStrings } from "../../strings/selectionPopup";
import { SelectionDictCard } from "../SelectionDictCard";

function createMockController(
	state: DictionaryViewState,
	overrides: Partial<DictionaryController> = {},
): DictionaryController {
	return {
		getSnapshot: () => state,
		subscribe: () => () => {},
		loadAi: vi.fn().mockResolvedValue(undefined),
		retry: vi.fn().mockResolvedValue(undefined),
		selectSource: vi.fn(),
		prefill: vi.fn(),
		lookup: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as unknown as DictionaryController;
}

describe("SelectionDictCard", () => {
	const strings = selectionPopupStrings("zh");

	it("renders generate AI definition button when AI dictionary is active and idle", () => {
		const state: DictionaryViewState = {
			activeSourceId: "ai",
			aiEngineName: "DeepSeek",
			aiReady: true,
			history: [],
			input: "science",
			query: "science",
			sources: [
				{
					activeSectionIndex: 0,
					error: "",
					id: "youdao",
					kind: "youdao",
					label: "有道词典",
					result: null,
					status: "success",
				},
				{
					activeSectionIndex: 0,
					error: "",
					id: "ai",
					kind: "ai",
					label: "AI 词典",
					result: null,
					status: "idle",
				},
			],
			status: "ready",
		};

		const controller = createMockController(state);
		const html = renderToStaticMarkup(
			<SelectionDictCard
				query="science"
				controller={controller}
				strings={strings}
				onOpenInMainTab={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(html).toContain("生成 AI 释义");
		expect(html).toContain("DeepSeek");
		expect(html).not.toContain("未找到释义");
	});

	it("renders AI generating text when AI dictionary is active and loading", () => {
		const state: DictionaryViewState = {
			activeSourceId: "ai",
			aiEngineName: "DeepSeek",
			aiReady: true,
			history: [],
			input: "science",
			query: "science",
			sources: [
				{
					activeSectionIndex: 0,
					error: "",
					id: "ai",
					kind: "ai",
					label: "AI 词典",
					result: null,
					status: "loading",
				},
			],
			status: "loading",
		};

		const controller = createMockController(state);
		const html = renderToStaticMarkup(
			<SelectionDictCard
				query="science"
				controller={controller}
				strings={strings}
				onOpenInMainTab={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(html).toContain("正在生成 AI 释义…");
		expect(html).not.toContain("fc-selection-card__ai-generate-btn");
		expect(html).not.toContain("未找到释义");
	});

	it("renders retry button when AI dictionary encountered an error", () => {
		const state: DictionaryViewState = {
			activeSourceId: "ai",
			aiEngineName: "DeepSeek",
			aiReady: true,
			history: [],
			input: "science",
			query: "science",
			sources: [
				{
					activeSectionIndex: 0,
					error: "网络连接失败",
					id: "ai",
					kind: "ai",
					label: "AI 词典",
					result: null,
					status: "error",
				},
			],
			status: "error",
		};

		const controller = createMockController(state);
		const html = renderToStaticMarkup(
			<SelectionDictCard
				query="science"
				controller={controller}
				strings={strings}
				onOpenInMainTab={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(html).toContain("网络连接失败");
		expect(html).toContain("重试");
	});

	it("renders empty definition message for normal sources when empty", () => {
		const state: DictionaryViewState = {
			activeSourceId: "youdao",
			aiEngineName: "",
			aiReady: false,
			history: [],
			input: "science",
			query: "science",
			sources: [
				{
					activeSectionIndex: 0,
					error: "",
					id: "youdao",
					kind: "youdao",
					label: "有道词典",
					result: null,
					status: "empty",
				},
			],
			status: "ready",
		};

		const controller = createMockController(state);
		const html = renderToStaticMarkup(
			<SelectionDictCard
				query="science"
				controller={controller}
				strings={strings}
				onOpenInMainTab={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(html).toContain("未找到释义");
	});
});
