import React from "react";
import { Settings, X } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FlashcardButton } from "../Button";
import { FlashcardCheckbox } from "../Checkbox";
import { FlashcardInput, FlashcardTextarea } from "../Input";
import { FlashcardMenu } from "../Menu";
import { FlashcardSelect } from "../Select";
import { FlashcardSlider } from "../Slider";

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

	it("marks decorative icons as aria-hidden and applies fixed size styles (default 16px or explicit)", () => {
		const html = renderToStaticMarkup(<FlashcardButton icon={X} aria-label="关闭" />);
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain("width:16px");
		expect(html).toContain("height:16px");
		expect(html).toContain("flex-shrink:0");

		const customHtml = renderToStaticMarkup(
			<FlashcardButton icon={X} iconSize={18} aria-label="关闭" />,
		);
		expect(customHtml).toContain("width:18px");
		expect(customHtml).toContain("height:18px");
	});

	it("combines preset shape classes with variant color classes", () => {
		const html = renderToStaticMarkup(
			<FlashcardButton preset="show" variant="primary">
				显示答案
			</FlashcardButton>,
		);

		expect(html).toContain("flashcard-btn-show");
		expect(html).toContain("flashcard-btn-primary");
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

	it("renders custom checkbox with accessible native input, visual box, and label", () => {
		const html = renderToStaticMarkup(
			<FlashcardCheckbox checked disabled invalid label="启用拼写" aria-label="拼写选项" />,
		);

		expect(html).toContain("flashcard-checkbox");
		expect(html).toContain("flashcard-checkbox-native");
		expect(html).toContain("flashcard-checkbox-box");
		expect(html).toContain("flashcard-checkbox-label");
		expect(html).toContain("启用拼写");
		expect(html).toContain("is-disabled");
		expect(html).toContain("is-invalid");
		expect(html).toContain('type="checkbox"');
	});

	it("renders slider with calculated progress css variable and track attributes", () => {
		const html = renderToStaticMarkup(
			<FlashcardSlider
				min={0}
				max={100}
				value={25}
				step={5}
				onChange={vi.fn()}
				aria-label="每日新卡"
			/>,
		);

		expect(html).toContain("flashcard-slider-wrapper");
		expect(html).toContain("flashcard-slider");
		expect(html).toContain('type="range"');
		expect(html).toContain("--slider-progress:25%");
		expect(html).toContain('min="0"');
		expect(html).toContain('max="100"');
	});
});
