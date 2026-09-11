import { dictionaryStrings, type DictionaryStrings } from "../strings/dictionary";
import type { Language } from "../../../core/shared/types";

/**
 * Language-aware dictionary copy for the ported domain modules.
 *
 * The source project used a static `UI_TEXT` table; here the active language is
 * set once by the Obsidian boundary (`main.ts` re-applies it whenever settings
 * change), so call sites read `dictionaryText()` at use time.
 */
let current: DictionaryStrings = dictionaryStrings("zh");

export function setDictionaryLanguage(language: Language): void {
	current = dictionaryStrings(language);
}

export function dictionaryText(): DictionaryStrings {
	return current;
}
