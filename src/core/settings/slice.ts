/**
 * One owner's slice of the persisted settings document.
 *
 * A slice is the single authority for the settings keys it owns: their defaults,
 * their normalization, and their cloning. Every slice returns a *patch* of the
 * document — an object holding exactly the keys it declares — so the registry can
 * compose the document by spreading the slices.
 *
 * `normalize` receives the whole raw persisted document so a slice can read legacy
 * top-level keys and language-dependent defaults.
 *
 * `clone` must not repair or coerce: it runs on every `getSettings()` call, so it
 * only has to return a value the caller cannot mutate back into committed state.
 */
export interface SettingsSlice<T extends object> {
	/** Stable slice identity, used by diagnostics and the settings-slice tests. */
	readonly id: string;
	/** The settings-document keys this slice owns; slices must not overlap. */
	readonly keys: readonly string[];
	defaults(): T;
	normalize(raw: unknown): T;
	clone(document: T): T;
}

/** Reads a raw persisted document as a plain record without trusting its shape. */
export function settingsRecord(raw: unknown): Record<string, unknown> {
	return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}
