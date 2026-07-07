import { describe, expect, it } from "vitest";
import {
	createTranslator,
	formatCompactDuration,
	formatReviewInterval,
	formatStudyOrder,
	getDefaultPracticeMessages,
	getLocalizedRatingButtons,
	normalizeLanguage,
	translate,
} from "..";

describe("language helpers", () => {
	it("normalizes unsupported values to the default language", () => {
		expect(normalizeLanguage("en")).toBe("en");
		expect(normalizeLanguage("fr")).toBe("zh");
		expect(normalizeLanguage(undefined)).toBe("zh");
	});

	it("translates keys and interpolates variables", () => {
		expect(translate("zh", "home.emptyHint", { tag: "#单词" })).toBe(
			"点击刷新按钮扫描带有 #单词 标签的文件",
		);
		expect(createTranslator("en")("practice.startQuestions", { count: 10 })).toBe(
			"Start · 10 Questions",
		);
	});

	it("returns cloned default practice message arrays", () => {
		const first = getDefaultPracticeMessages("zh");
		const second = getDefaultPracticeMessages("zh");

		first.perfect.push("custom");

		expect(second.perfect).not.toContain("custom");
	});
});

describe("formatting helpers", () => {
	it("formats compact durations by language", () => {
		expect(formatCompactDuration("zh", 59)).toBe("59秒");
		expect(formatCompactDuration("zh", 125)).toBe("2分5秒");
		expect(formatCompactDuration("en", 7200)).toBe("2h");
	});

	it("formats review intervals and study order labels", () => {
		expect(formatReviewInterval("en", "day", 21)).toBe("21 d");
		expect(formatStudyOrder("zh", "random")).toBe("乱序学习");
		expect(formatStudyOrder("en", "sequential")).toBe("Sequential");
	});

	it("localizes rating buttons including the custom trash rating", () => {
		const buttons = getLocalizedRatingButtons("zh");

		expect(buttons).toEqual([
			expect.objectContaining({ label: "重来", shortcut: "1", rating: 1 }),
			expect.objectContaining({ label: "困难", shortcut: "2", rating: 2 }),
			expect.objectContaining({ label: "良好", shortcut: "3/空格", rating: 3 }),
			expect.objectContaining({ label: "简单", shortcut: "4", rating: 4 }),
			expect.objectContaining({
				label: "辣鸡",
				shortcut: "5",
				rating: 5,
				intervalDesc: "21天",
			}),
		]);
	});
});
