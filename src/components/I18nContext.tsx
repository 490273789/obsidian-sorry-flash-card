import React, { createContext, useContext, useMemo } from "react";
import type { Language } from "../types";
import {
	createTranslator,
	type TranslationKey,
} from "../i18n";

interface I18nContextValue {
	language: Language;
	t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{
	language: Language;
	children: React.ReactNode;
}> = ({ language, children }) => {
	const value = useMemo<I18nContextValue>(
		() => ({
			language,
			t: createTranslator(language),
		}),
		[language],
	);

	return (
		<I18nContext.Provider value={value}>{children}</I18nContext.Provider>
	);
};

export function useI18n(): I18nContextValue {
	const value = useContext(I18nContext);
	if (!value) {
		throw new Error("useI18n must be used within I18nProvider");
	}
	return value;
}
