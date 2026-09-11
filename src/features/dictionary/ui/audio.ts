const DICTIONARY_AUDIO_HOSTS = new Set(["dict.youdao.com", "dictionary.cambridge.org"]);

/** Only HTTPS audio hosted by a supported dictionary source may be played. */
export function canPlayDictionaryAudio(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	return parsed.protocol === "https:" && DICTIONARY_AUDIO_HOSTS.has(parsed.hostname);
}

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
 * The pronunciation list routes playback through this presentation helper;
 * sandbox documents keep their separate blob/data audio policy.
 *
 * Resolves `true` when playback started, `false` when the URL was rejected or
 * the browser refused to play it.
 */
export async function playDictionaryAudio(url: string): Promise<boolean> {
	if (!canPlayDictionaryAudio(url)) return false;
	stopDictionaryAudio();
	let audio: HTMLAudioElement;
	try {
		audio = new Audio(url);
	} catch {
		return false;
	}
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
