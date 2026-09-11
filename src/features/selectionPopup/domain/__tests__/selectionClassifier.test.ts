import { describe, expect, it } from "vitest";
import { isEnglishWordOrPhrase } from "../selectionClassifier";

describe("isEnglishWordOrPhrase", () => {
	it("accepts a single English word", () => {
		expect(isEnglishWordOrPhrase("apple")).toBe(true);
		expect(isEnglishWordOrPhrase("Serendipity")).toBe(true);
		expect(isEnglishWordOrPhrase("  knowledge  ")).toBe(true);
	});

	it("accepts words with hyphens and apostrophes", () => {
		expect(isEnglishWordOrPhrase("state-of-the-art")).toBe(true);
		expect(isEnglishWordOrPhrase("don't")).toBe(true);
		expect(isEnglishWordOrPhrase("user's")).toBe(true);
		expect(isEnglishWordOrPhrase("it’s")).toBe(true);
	});

	it("accepts 2 or 3 words English phrases", () => {
		expect(isEnglishWordOrPhrase("look up")).toBe(true);
		expect(isEnglishWordOrPhrase("give up")).toBe(true);
		expect(isEnglishWordOrPhrase("take care of")).toBe(true);
	});

	it("rejects phrases with more than 3 words", () => {
		expect(isEnglishWordOrPhrase("this is a test")).toBe(false);
		expect(isEnglishWordOrPhrase("one two three four")).toBe(false);
	});

	it("rejects text with sentence punctuation", () => {
		expect(isEnglishWordOrPhrase("apple.")).toBe(false);
		expect(isEnglishWordOrPhrase("hello, world")).toBe(false);
		expect(isEnglishWordOrPhrase("really?")).toBe(false);
		expect(isEnglishWordOrPhrase("wow!")).toBe(false);
		expect(isEnglishWordOrPhrase("a: b")).toBe(false);
	});

	it("rejects non-English text or Chinese", () => {
		expect(isEnglishWordOrPhrase("你好")).toBe(false);
		expect(isEnglishWordOrPhrase("苹果")).toBe(false);
		expect(isEnglishWordOrPhrase("apple 苹果")).toBe(false);
		expect(isEnglishWordOrPhrase("café")).toBe(false);
	});

	it("rejects empty or whitespace-only text", () => {
		expect(isEnglishWordOrPhrase("")).toBe(false);
		expect(isEnglishWordOrPhrase("   ")).toBe(false);
		expect(isEnglishWordOrPhrase("\n")).toBe(false);
	});

	it("rejects text exceeding length threshold", () => {
		const longWord = "a".repeat(61);
		expect(isEnglishWordOrPhrase(longWord)).toBe(false);
	});

	it("rejects isolated punctuation or hyphen without letters", () => {
		expect(isEnglishWordOrPhrase("-")).toBe(false);
		expect(isEnglishWordOrPhrase("---")).toBe(false);
		expect(isEnglishWordOrPhrase("a - b")).toBe(false);
	});
});
