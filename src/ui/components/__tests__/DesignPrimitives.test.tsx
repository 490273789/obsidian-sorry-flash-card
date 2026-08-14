import React from "react";
import { Settings } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FlashcardButton } from "../FlashcardButton";
import { FlashcardInput, FlashcardTextarea } from "../FlashcardInput";
import { FlashcardMenu } from "../FlashcardMenu";
import { FlashcardSelect } from "../FlashcardSelect";

describe("design primitives", () => {
	it("renders semantic button variants and sizes", () => {
		const html = renderToStaticMarkup(
			<FlashcardButton variant="primary" size="lg">
				保存
			</FlashcardButton>,
		);

		expect(html).toContain("flashcard-btn-primary");
		expect(html).toContain("flashcard-btn-lg");
	});

	it("shares states across input, textarea, and select controls", () => {
		const html = renderToStaticMarkup(
			<>
				<FlashcardInput invalid aria-label="名称" />
				<FlashcardTextarea aria-label="说明" />
				<FlashcardSelect aria-label="顺序">
					<option value="random">随机</option>
				</FlashcardSelect>
			</>,
		);

		expect(html).toContain("flashcard-input");
		expect(html).toContain("flashcard-textarea");
		expect(html).toContain("flashcard-select-shell");
		expect(html).toContain('aria-invalid="true"');
	});

	it("renders a menu trigger with menu semantics", () => {
		const html = renderToStaticMarkup(
			<FlashcardMenu
				triggerTitle="更多"
				ariaLabel="更多操作"
				items={[
					{
						key: "settings",
						label: "设置",
						icon: Settings,
						onSelect: vi.fn(),
					},
				]}
			/>,
		);

		expect(html).toContain('aria-haspopup="menu"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain("flashcard-menu-trigger");
	});
});
