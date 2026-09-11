import React, { createContext, useContext, useMemo } from "react";
import { createSharedTranslator, type TranslationVars, type Translator } from "../../i18n";
import type { Language } from "../../shared/types";

export interface I18nContextValue<K extends string = string> {
	language: Language;
	t: (key: K, vars?: TranslationVars) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Provides the view's language and translator. The host owns the mechanism and
 * defaults to the shared dictionary; a feature view injects its own composed
 * dictionary through the mount seam so its keys resolve inside the same context.
 */
export const I18nProvider: React.FC<{
	language: Language;
	translator?: (language: Language) => Translator;
	children: React.ReactNode;
}> = ({ language, translator = createSharedTranslator, children }) => {
	const value = useMemo<I18nContextValue>(
		() => ({
			language,
			t: translator(language),
		}),
		[language, translator],
	);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

/** Narrows the shared translator to one dictionary's key union at the call site. */
export function useI18n<K extends string = string>(): I18nContextValue<K> {
	const value = useContext(I18nContext);
	if (!value) {
		throw new Error("useI18n must be used within I18nProvider");
	}
	return value as I18nContextValue<K>;
}
