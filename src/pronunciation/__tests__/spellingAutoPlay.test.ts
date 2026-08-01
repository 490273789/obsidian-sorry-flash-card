import { describe, expect, it, vi } from "vitest";
import {
	shouldAutoPronounceSpellingFeedback,
	waitForSpellingPronunciation,
} from "../spellingAutoPlay";
import type { PronunciationRuntime } from "../types";

function makeRuntime(
	outcome: Awaited<ReturnType<PronunciationRuntime["speak"]>>,
): PronunciationRuntime {
	return {
		getSnapshot: vi.fn(),
		subscribe: vi.fn(),
		configure: vi.fn(),
		canSpeak: vi.fn(),
		speak: vi.fn().mockResolvedValue(outcome),
		testOnlineProvider: vi.fn(),
		stop: vi.fn(),
		refreshCacheUsage: vi.fn(),
		clearCache: vi.fn(),
		dispose: vi.fn(),
	} as unknown as PronunciationRuntime;
}

describe("spelling pronunciation", () => {
	it("enables autoplay for both first correct and correction correct feedback", () => {
		expect(shouldAutoPronounceSpellingFeedback("retrieval-correct")).toBe(true);
		expect(shouldAutoPronounceSpellingFeedback("correction-correct")).toBe(true);
		expect(shouldAutoPronounceSpellingFeedback("retrieval-incorrect")).toBe(false);
	});

	it("keeps correct feedback until successful playback ends", async () => {
		const runtime = makeRuntime({ status: "success", source: "local" });
		const delay = vi.fn();

		await waitForSpellingPronunciation(runtime, "hello", { delay });

		const speakMock = (runtime as unknown as { speak: ReturnType<typeof vi.fn> }).speak;
		expect(speakMock).toHaveBeenCalledWith("hello", "auto");
		expect(delay).not.toHaveBeenCalled();
	});

	it("restores the existing 550ms pace after pronunciation failure", async () => {
		const runtime = makeRuntime({ status: "failed", reason: "network" });
		const delay = vi.fn().mockResolvedValue(undefined);

		await waitForSpellingPronunciation(runtime, "hello", {
			now: () => 100,
			delay,
		});

		expect(delay).toHaveBeenCalledWith(550);
	});

	it("stops playback after the eight-second maximum wait", async () => {
		vi.useFakeTimers();
		const runtime = makeRuntime({ status: "success", source: "local" });
		(runtime as unknown as { speak: ReturnType<typeof vi.fn> }).speak.mockReturnValue(
			new Promise(() => undefined),
		);
		const pending = waitForSpellingPronunciation(runtime, "hello", {
			now: () => Date.now(),
			delay: vi.fn().mockResolvedValue(undefined),
		});
		await vi.advanceTimersByTimeAsync(8000);

		await expect(pending).resolves.toEqual({ status: "cancelled" });
		const stopMock = (runtime as unknown as { stop: ReturnType<typeof vi.fn> }).stop;
		expect(stopMock).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});
});
