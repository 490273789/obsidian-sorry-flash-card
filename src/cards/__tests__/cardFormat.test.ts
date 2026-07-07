import { describe, expect, it } from "vitest";
import {
	containsReservedMarkerLine,
	formatCardBlock,
	hasFlashcardSyntax,
	isMarkerLine,
} from "../cardFormat";

describe("card format markers", () => {
	it("recognizes marker lines with surrounding whitespace", () => {
		expect(isMarkerLine("  ??  ", "??")).toBe(true);
		expect(isMarkerLine("prefix ??", "??")).toBe(false);
	});

	it("detects flashcard syntax only when required markers are line markers", () => {
		expect(
			hasFlashcardSyntax(`#单词
front
??
back
;;`),
		).toBe(true);
		expect(hasFlashcardSyntax("#单词\nfront ?? back ;;")).toBe(false);
		expect(hasFlashcardSyntax("#单词\nfront\n??\nback")).toBe(false);
	});

	it("detects reserved marker lines without flagging inline marker text", () => {
		expect(containsReservedMarkerLine("front text\n::\nexplanation")).toBe(true);
		expect(containsReservedMarkerLine("front text with :: inline")).toBe(false);
	});
});

describe("formatCardBlock", () => {
	it("trims card fields and includes explanation only when present", () => {
		expect(formatCardBlock(" front ", " back ", " explanation ")).toBe(
			"front\n??\nback\n::\nexplanation",
		);
		expect(formatCardBlock(" front ", " back ", "   ")).toBe("front\n??\nback");
		expect(formatCardBlock(" front ", " back ")).toBe("front\n??\nback");
	});
});
