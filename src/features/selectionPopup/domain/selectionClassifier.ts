/**
 * Determines whether the given text qualifies as an English word or short phrase
 * (1 to 3 words, no sentence punctuation) suitable for dictionary lookup.
 */
export function isEnglishWordOrPhrase(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed || trimmed.length > 60) return false;
	if (/[\r\n]/.test(trimmed)) return false;
	if (!/^[a-zA-Z\s'’\-]+$/.test(trimmed)) return false;

	const words = trimmed.split(/\s+/);
	if (words.length < 1 || words.length > 3) return false;

	return words.every((word) => /[a-zA-Z]/.test(word));
}
