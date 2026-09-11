import initEngine from "./engine/dictionary_engine.js";
import engineUrl from "./engine/dictionary_engine_bg.wasm?url";

let initialized: Promise<unknown> | null = null;

export function ensureDictionaryEngine(): Promise<unknown> {
	return (initialized ??= initEngine({ module_or_path: engineUrl }));
}
