import { aiSettingsSlice } from "../ai/configuration";
import { dictionarySettingsSlice } from "../../features/dictionary/domain/configuration";
import { pronunciationSettingsSlice } from "../../features/flashcards/domain/pronunciation/pronunciationSettings";
import type { FlashcardSettings } from "../shared/types";
import { translationSettingsSlice } from "../../features/translation/domain/configuration";
import { flashcardSettingsSlice } from "../../features/flashcards/settings/slice";
import { hostSettingsSlice } from "../settings/hostSlice";
import { selectionPopupSettingsSlice } from "../selectionHelper/settings/slice";

/**
 * Every slice of the persisted settings document, in normalization order.
 *
 * Order matters: the host slice normalizes `language` first, and the 闪卡 slice
 * derives its language-dependent practice-message defaults from the same raw
 * document rather than from another slice's output.
 *
 * This list is the canonical inventory. `DEFAULT_SETTINGS`,
 * `normalizeSettingsDocument`, and `cloneSettingsDocument` below compose the same
 * slices explicitly so their result type stays checkable; the settings-slice test
 * asserts the lists agree.
 */
export const SETTINGS_SLICES = [
	hostSettingsSlice,
	flashcardSettingsSlice,
	pronunciationSettingsSlice,
	aiSettingsSlice,
	translationSettingsSlice,
	dictionarySettingsSlice,
	selectionPopupSettingsSlice,
] as const;

/**
 * Defaults composed from every slice. Each slice is the authority for its own
 * keys, so this aggregate no longer holds a second copy of them.
 */
export const DEFAULT_SETTINGS: FlashcardSettings = {
	...hostSettingsSlice.defaults(),
	...flashcardSettingsSlice.defaults(),
	...pronunciationSettingsSlice.defaults(),
	...aiSettingsSlice.defaults(),
	...translationSettingsSlice.defaults(),
	...dictionarySettingsSlice.defaults(),
	...selectionPopupSettingsSlice.defaults(),
};

/**
 * Merges a raw persisted document with defaults while preserving old-data
 * compatibility. Each slice sees the whole raw document and returns only its own
 * keys, so legacy top-level shapes stay inside the slice that understands them.
 */
export function normalizeSettingsDocument(raw: unknown): FlashcardSettings {
	return {
		...hostSettingsSlice.normalize(raw),
		...flashcardSettingsSlice.normalize(raw),
		...pronunciationSettingsSlice.normalize(raw),
		...aiSettingsSlice.normalize(raw),
		...translationSettingsSlice.normalize(raw),
		...dictionarySettingsSlice.normalize(raw),
		...selectionPopupSettingsSlice.normalize(raw),
	};
}

/**
 * Returns a settings document the caller cannot mutate back into committed state.
 * Each slice decides how deep its own copy must be.
 */
export function cloneSettingsDocument(settings: FlashcardSettings): FlashcardSettings {
	return {
		...hostSettingsSlice.clone(settings),
		...flashcardSettingsSlice.clone(settings),
		...pronunciationSettingsSlice.clone(settings),
		...aiSettingsSlice.clone(settings),
		...translationSettingsSlice.clone(settings),
		...dictionarySettingsSlice.clone(settings),
		...selectionPopupSettingsSlice.clone(settings),
	};
}
