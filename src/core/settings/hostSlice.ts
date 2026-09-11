import { DEFAULT_LANGUAGE, normalizeLanguage } from "../i18n";
import type { Language } from "../shared/types";
import { settingsRecord, type SettingsSlice } from "./slice";

/** Settings the workbench host owns because every feature reads them. */
export interface HostSettings {
	/** Interface language. */
	language: Language;
}

export const hostSettingsSlice: SettingsSlice<HostSettings> = {
	id: "host",
	keys: ["language"],

	defaults: () => ({ language: DEFAULT_LANGUAGE }),

	normalize: (raw) => ({ language: normalizeLanguage(settingsRecord(raw).language) }),

	clone: (document) => ({ language: document.language }),
};
