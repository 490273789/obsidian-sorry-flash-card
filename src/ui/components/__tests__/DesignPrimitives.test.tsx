import React from "react";
import { Settings, X } from "lucide-react";
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

	it('defaults to type="button" but allows an explicit override', () => {
		const html = renderToStaticMarkup(<FlashcardButton>保存</FlashcardButton>);
		expect(html).toContain('type="button"');

		const submitHtml = renderToStaticMarkup(
			<FlashcardButton type="submit">提交</FlashcardButton>,
		);
		expect(submitHtml).toContain('type="submit"');
	});

	it("marks decorative icons as aria-hidden", () => {
		const html = renderToStaticMarkup(<FlashcardButton icon={X} aria-label="关闭" />);
		expect(html).toContain('aria-hidden="true"');
	});

	it("combines preset shape classes with variant color classes", () => {
		const html = renderToStaticMarkup(
			<FlashcardButton preset="show" variant="green">
				显示答案
			</FlashcardButton>,
		);

		expect(html).toContain("flashcard-btn-show");
		expect(html).toContain("flashcard-btn-green");
	});

	it("adds a rating class from the rating prop", () => {
		const html = renderToStaticMarkup(<FlashcardButton preset="rating" rating={3} />);
		expect(html).toContain("flashcard-rating-btn");
		expect(html).toContain("flashcard-rating-3");
	});

	it("adds the active class for toggle state", () => {
		const html = renderToStaticMarkup(<FlashcardButton active>练习</FlashcardButton>);
		expect(html).toMatch(/class="[^"]* flashcard-btn-md active"/);
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
