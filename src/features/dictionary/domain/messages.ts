import { dictionaryStrings, type DictionaryStrings } from "../strings/dictionary";
import type { Language } from "../../../core/shared/types";

/**
 * Pure fallback copy for helpers that are intentionally language-agnostic.
 * Runtime-owned modules receive their active language explicitly; no lookup
 * state is shared across dictionary instances or concurrent queries.
 */
export function dictionaryText(language: Language = "zh"): DictionaryStrings {
	return dictionaryStrings(language);
}
