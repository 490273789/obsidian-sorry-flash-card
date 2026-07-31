import type { PronunciationOutcome, PronunciationRuntime } from "./types";

const NORMAL_FEEDBACK_DELAY_MS = 550;
const MAX_AUTO_PRONUNCIATION_WAIT_MS = 8000;

export function shouldAutoPronounceSpellingFeedback(feedback: string): boolean {
	return feedback === "retrieval-correct" || feedback === "correction-correct";
}

export async function waitForSpellingPronunciation(
	runtime: PronunciationRuntime,
	text: string,
	options: {
		now?: () => number;
		delay?: (milliseconds: number) => Promise<void>;
	} = {},
): Promise<PronunciationOutcome> {
	const now = options.now ?? Date.now;
	const delay =
		options.delay ??
		((milliseconds: number) =>
			new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds)));
	const startedAt = now();
	let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;
	const timedOutcome = new Promise<PronunciationOutcome>((resolve) => {
		timeout = globalThis.setTimeout(() => {
			runtime.stop();
			resolve({ status: "cancelled" });
		}, MAX_AUTO_PRONUNCIATION_WAIT_MS);
	});
	const speaking = Promise.resolve()
		.then(() => runtime.speak(text, "auto"))
		.catch(
			(): PronunciationOutcome => ({
				status: "failed",
				reason: "playback",
			}),
		);
	const outcome = await Promise.race([speaking, timedOutcome]);
	if (timeout !== null) globalThis.clearTimeout(timeout);

	if (outcome.status !== "success") {
		const remainingDelay = NORMAL_FEEDBACK_DELAY_MS - (now() - startedAt);
		if (remainingDelay > 0) await delay(remainingDelay);
	}
	return outcome;
}
