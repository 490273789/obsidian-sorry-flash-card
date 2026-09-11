import { canPlayDictionaryAudio } from "../domain/controller";

/**
 * Re-exported so the sandbox host and future call sites share the controller's
 * single allow-list decision instead of re-deriving their own.
 */
export { canPlayDictionaryAudio };

/** Playback started through `playDictionaryAudio`, stopped on the next call. */
let activeAudio: HTMLAudioElement | null = null;

/** Stops playback started through `playDictionaryAudio`, if any. */
export function stopDictionaryAudio(): void {
	if (!activeAudio) return;
	activeAudio.pause();
	activeAudio.currentTime = 0;
	activeAudio = null;
}

/**
 * Plays an allow-listed dictionary audio URL through a fresh `Audio` element.
 *
 * The pronunciation list routes playback through `controller.playAudio`; this
 * helper covers raw URLs (for example a sandbox `play-audio` payload) and keeps
 * the allow-list check reusable and testable.
 *
 * Resolves `true` when playback started, `false` when the URL was rejected or
 * the browser refused to play it.
 */
export async function playDictionaryAudio(url: string): Promise<boolean> {
	if (!canPlayDictionaryAudio(url)) return false;
	stopDictionaryAudio();
	const audio = new Audio(url);
	activeAudio = audio;
	const clear = (): void => {
		if (activeAudio === audio) activeAudio = null;
	};
	audio.addEventListener("ended", clear, { once: true });
	audio.addEventListener("error", clear, { once: true });
	try {
		await audio.play();
		return true;
	} catch {
		clear();
		return false;
	}
}
