import { useI18n, type I18nContextValue } from "../../../core/ui/context/I18nContext";
import type { TranslationKey } from "./index";

/**
 * The flashcard dictionary's typed view of the shared i18n context. Views call
 * this instead of the generic `useI18n` so key typos stay compile errors.
 */
export function useFlashcardI18n(): I18nContextValue<TranslationKey> {
	return useI18n<TranslationKey>();
}
