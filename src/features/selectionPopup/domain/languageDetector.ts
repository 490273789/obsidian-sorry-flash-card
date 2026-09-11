/**
 * Automatically detects whether text should be translated from Chinese to English or English to Chinese.
 * If the input contains Chinese characters, returns "zh-en"; otherwise defaults to "en-zh".
 */
export function detectTranslationDirection(text: string): "zh-en" | "en-zh" {
	return /[\u4e00-\u9fa5]/.test(text) ? "zh-en" : "en-zh";
}
