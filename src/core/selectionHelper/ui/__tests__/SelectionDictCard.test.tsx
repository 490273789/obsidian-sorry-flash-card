import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SelectionLookupSnapshot } from "../../domain/types";
import { selectionHelperStrings } from "../../strings/selectionPopup";
import { SelectionDictCard } from "../SelectionDictCard";

describe("SelectionDictCard", () => {
	const strings = selectionHelperStrings("zh");

	it("renders an explicit AI generation action", () => {
		const html = render(aiSnapshot({ status: "idle" }));
		expect(html).toContain("生成 AI 释义");
		expect(html).toContain("DeepSeek");
	});

	it("renders independent source failure with retry", () => {
		const html = render(aiSnapshot({ status: "error", error: "网络连接失败" }));
		expect(html).toContain("网络连接失败");
		expect(html).toContain("重试");
	});

	it("renders the narrow list presentation", () => {
		const html = render({
			query: "science",
			activeSourceId: "youdao",
			aiEngineName: "",
			status: "ready",
			sources: [
				{
					id: "youdao",
					label: "有道词典",
					kind: "dictionary",
					status: "success",
					error: "",
					pronunciations: [{ label: "英", phonetic: "saɪəns" }],
					sections: [{ kind: "list", items: ["科学", "学科"] }],
					hasComplexContent: false,
				},
			],
		});
		expect(html).toContain("科学");
		expect(html).toContain("saɪəns");
	});

	it("defers complex dictionary content to the main tab", () => {
		const html = render({
			query: "science",
			activeSourceId: "local",
			aiEngineName: "",
			status: "ready",
			sources: [
				{
					id: "local",
					label: "Local",
					kind: "dictionary",
					status: "success",
					error: "",
					pronunciations: [],
					sections: [],
					hasComplexContent: true,
				},
			],
		});
		expect(html).toContain("请在词典主标签查看");
	});

	function render(lookup: SelectionLookupSnapshot): string {
		return renderToStaticMarkup(
			<SelectionDictCard
				query="science"
				lookup={lookup}
				strings={strings}
				onSelectSource={vi.fn()}
				onRetry={vi.fn()}
				onGenerateAi={vi.fn()}
				onOpenInMainTab={vi.fn()}
				onClose={vi.fn()}
			/>,
		);
	}
});

function aiSnapshot(
	overrides: Partial<SelectionLookupSnapshot["sources"][number]>,
): SelectionLookupSnapshot {
	return {
		query: "science",
		activeSourceId: "ai",
		aiEngineName: "DeepSeek",
		status: "ready",
		sources: [
			{
				id: "ai",
				label: "AI 词典",
				kind: "ai",
				status: "idle",
				error: "",
				pronunciations: [],
				sections: [],
				hasComplexContent: false,
				...overrides,
			},
		],
	};
}
