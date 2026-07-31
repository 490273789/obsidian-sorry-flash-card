import type { App } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type PronunciationSettings } from "../../shared/types";
import { MemoryPronunciationAudioCache, createPronunciationCacheKey } from "../audioCache";
import { createPronunciationRequestDescriptor, type PronunciationRequester } from "../providers";
import { createPronunciationRuntime, selectLocalEnglishVoice } from "../pronunciationRuntime";

vi.mock("obsidian", () => ({
	requestUrl: vi.fn(),
}));

function makeVoice(
	lang: string,
	options: { local?: boolean; default?: boolean; name?: string } = {},
): SpeechSynthesisVoice {
	return {
		default: options.default ?? false,
		lang,
		localService: options.local ?? true,
		name: options.name ?? lang,
		voiceURI: options.name ?? lang,
	} as SpeechSynthesisVoice;
}

class FakeSpeechSynthesis {
	voices: SpeechSynthesisVoice[] = [];
	autoEnd = true;
	spoken: SpeechSynthesisUtterance[] = [];
	cancelled = 0;
	private listener: (() => void) | null = null;

	getVoices(): SpeechSynthesisVoice[] {
		return this.voices;
	}

	addEventListener(_name: string, listener: () => void): void {
		this.listener = listener;
	}

	removeEventListener(): void {
		this.listener = null;
	}

	speak(utterance: SpeechSynthesisUtterance): void {
		this.spoken.push(utterance);
		if (this.autoEnd) {
			queueMicrotask(() => utterance.onend?.({} as SpeechSynthesisEvent));
		}
	}

	cancel(): void {
		this.cancelled++;
		const utterance = this.spoken[this.spoken.length - 1];
		utterance?.onerror?.({ error: "canceled" } as SpeechSynthesisErrorEvent);
	}

	emitVoicesChanged(): void {
		this.listener?.();
	}
}

function makeUtterance(text: string): SpeechSynthesisUtterance {
	return {
		text,
		lang: "",
		rate: 1,
		voice: null,
		onend: null,
		onerror: null,
	} as unknown as SpeechSynthesisUtterance;
}

function makeSettings(overrides: Partial<PronunciationSettings> = {}): PronunciationSettings {
	return {
		...DEFAULT_SETTINGS.pronunciation,
		onlineProvider: "azure",
		azureSecretId: "azure-flashcard",
		...overrides,
	};
}

function makeApp(): App {
	return {
		secretStorage: {
			getSecret: (id: string) => (id ? "secret" : null),
		},
	} as unknown as App;
}

function makeAudioFactory(options: { reject?: boolean } = {}) {
	return vi.fn((url: string) => {
		const audio = {
			src: url,
			currentTime: 0,
			onended: null as ((event: Event) => void) | null,
			onerror: null as ((event: Event) => void) | null,
			pause: vi.fn(),
			play: vi.fn().mockImplementation(async () => {
				if (options.reject) throw new Error("playback failed");
				queueMicrotask(() => audio.onended?.({} as Event));
			}),
		};
		return audio as unknown as HTMLAudioElement;
	});
}

function makeRequester(status = 200): ReturnType<typeof vi.fn<PronunciationRequester>> {
	return vi.fn<PronunciationRequester>().mockResolvedValue({
		status,
		arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
		headers: { "content-type": "audio/mpeg" },
	});
}

afterEach(() => {
	vi.useRealTimers();
});

describe("local voice selection", () => {
	it("uses exact local accent, then default local English, then any local English", () => {
		const remoteExact = makeVoice("en-GB", { local: false, name: "remote" });
		const localUs = makeVoice("en-US", { name: "us" });
		const localGb = makeVoice("en-GB", { name: "gb" });
		const defaultUs = makeVoice("en-US", { default: true, name: "default" });

		expect(selectLocalEnglishVoice([remoteExact, defaultUs, localGb], "en-GB")?.name).toBe(
			"gb",
		);
		expect(selectLocalEnglishVoice([localUs, defaultUs], "en-GB")?.name).toBe("default");
		expect(selectLocalEnglishVoice([localUs], "system")?.name).toBe("us");
		expect(selectLocalEnglishVoice([remoteExact], "en-GB")).toBeNull();
	});

	it("refreshes asynchronously loaded voices after voiceschanged", () => {
		const synthesis = new FakeSpeechSynthesis();
		const runtime = createPronunciationRuntime(makeApp(), makeSettings(), {
			speechSynthesis: synthesis as unknown as SpeechSynthesis,
			createUtterance: makeUtterance,
		});
		expect(runtime.getSnapshot()).toMatchObject({
			voicesLoaded: false,
			hasLocalEnglishVoice: false,
		});

		synthesis.voices = [makeVoice("en-US")];
		synthesis.emitVoicesChanged();

		expect(runtime.getSnapshot()).toMatchObject({
			voicesLoaded: true,
			hasLocalEnglishVoice: true,
		});
		runtime.dispose();
	});
});

describe("pronunciation runtime order and resilience", () => {
	it("uses local speech before cache or network", async () => {
		const synthesis = new FakeSpeechSynthesis();
		synthesis.voices = [makeVoice("en-US")];
		const requester = makeRequester();
		const runtime = createPronunciationRuntime(makeApp(), makeSettings(), {
			speechSynthesis: synthesis as unknown as SpeechSynthesis,
			createUtterance: makeUtterance,
			requester,
		});

		await expect(runtime.speak("hello", "manual")).resolves.toEqual({
			status: "success",
			source: "local",
		});
		expect(requester).not.toHaveBeenCalled();
		expect(synthesis.spoken[0]?.voice?.lang).toBe("en-US");
		runtime.dispose();
	});

	it("waits for Chromium's asynchronous voice list before using cloud fallback", async () => {
		const synthesis = new FakeSpeechSynthesis();
		const requester = makeRequester();
		const runtime = createPronunciationRuntime(makeApp(), makeSettings(), {
			speechSynthesis: synthesis as unknown as SpeechSynthesis,
			createUtterance: makeUtterance,
			requester,
			voiceLoadTimeoutMs: 1000,
		});
		const pending = runtime.speak("hello", "manual");
		expect(requester).not.toHaveBeenCalled();

		synthesis.voices = [makeVoice("en-US")];
		synthesis.emitVoicesChanged();

		await expect(pending).resolves.toEqual({
			status: "success",
			source: "local",
		});
		expect(requester).not.toHaveBeenCalled();
		runtime.dispose();
	});

	it("uses cached cloud audio while offline and without a configured secret", async () => {
		const settings = makeSettings({ azureSecretId: "" });
		const descriptor = createPronunciationRequestDescriptor("hello", settings);
		const cache = new MemoryPronunciationAudioCache();
		if (!descriptor) throw new Error("Expected descriptor");
		await cache.put(await createPronunciationCacheKey(descriptor), {
			data: new Uint8Array([1, 2, 3]).buffer,
			mimeType: "audio/mpeg",
		});
		const runtime = createPronunciationRuntime(makeApp(), settings, {
			speechSynthesis: null,
			cache,
			isOnline: () => false,
			getSecret: () => null,
			createAudio: makeAudioFactory(),
			createObjectUrl: () => "blob:test",
			revokeObjectUrl: vi.fn(),
		});

		expect(await runtime.canSpeak("hello")).toBe(true);
		await expect(runtime.speak("hello", "manual")).resolves.toEqual({
			status: "success",
			source: "cache",
		});
		runtime.dispose();
	});

	it("does not call a provider when offline, disabled, or missing its secret", async () => {
		const requester = makeRequester();
		const commonDependencies = {
			speechSynthesis: null,
			requester,
			createAudio: makeAudioFactory(),
			createObjectUrl: () => "blob:test",
			revokeObjectUrl: vi.fn(),
		};
		const offlineRuntime = createPronunciationRuntime(makeApp(), makeSettings(), {
			...commonDependencies,
			isOnline: () => false,
		});
		await expect(offlineRuntime.speak("hello", "manual")).resolves.toEqual({
			status: "unavailable",
			reason: "offline",
		});
		offlineRuntime.dispose();

		const disabledRuntime = createPronunciationRuntime(
			makeApp(),
			makeSettings({ onlineProvider: "none" }),
			commonDependencies,
		);
		await expect(disabledRuntime.speak("hello", "manual")).resolves.toEqual({
			status: "unavailable",
			reason: "not-configured",
		});
		disabledRuntime.dispose();

		const missingSecretRuntime = createPronunciationRuntime(
			makeApp(),
			makeSettings({ azureSecretId: "" }),
			{
				...commonDependencies,
				getSecret: () => null,
			},
		);
		await expect(missingSecretRuntime.speak("hello", "manual")).resolves.toEqual({
			status: "unavailable",
			reason: "not-configured",
		});
		missingSecretRuntime.dispose();
		expect(requester).not.toHaveBeenCalled();
	});

	it("rejects non-word content before any online request", async () => {
		const requester = makeRequester();
		const runtime = createPronunciationRuntime(makeApp(), makeSettings(), {
			speechSynthesis: null,
			requester,
			createAudio: makeAudioFactory(),
			createObjectUrl: () => "blob:test",
			revokeObjectUrl: vi.fn(),
		});

		await expect(runtime.speak("hello: a private explanation", "manual")).resolves.toEqual({
			status: "unavailable",
			reason: "unsupported",
		});
		expect(requester).not.toHaveBeenCalled();
		runtime.dispose();
	});

	it("uses the selected online provider after local and cache miss, then caches audio", async () => {
		const cache = new MemoryPronunciationAudioCache();
		const requester = makeRequester();
		const runtime = createPronunciationRuntime(makeApp(), makeSettings(), {
			speechSynthesis: null,
			cache,
			requester,
			createAudio: makeAudioFactory(),
			createObjectUrl: () => "blob:test",
			revokeObjectUrl: vi.fn(),
		});

		await expect(runtime.speak("hello", "manual")).resolves.toEqual({
			status: "success",
			source: "azure",
		});
		expect(requester).toHaveBeenCalledTimes(1);
		expect(await cache.getUsageBytes()).toBe(3);
		runtime.dispose();
	});

	it("blocks unauthorized providers until settings change", async () => {
		const settings = makeSettings();
		const runtime = createPronunciationRuntime(makeApp(), settings, {
			speechSynthesis: null,
			requester: makeRequester(401),
			createAudio: makeAudioFactory(),
			createObjectUrl: () => "blob:test",
			revokeObjectUrl: vi.fn(),
			now: () => 100,
		});

		await expect(runtime.speak("hello", "manual")).resolves.toMatchObject({
			status: "failed",
			reason: "unauthorized",
		});
		expect(await runtime.canSpeak("hello")).toBe(false);
		runtime.updateSettings({ ...settings });
		expect(await runtime.canSpeak("hello")).toBe(true);
		runtime.dispose();
	});

	it("applies the 60-second 429 cooldown", async () => {
		let now = 100;
		const runtime = createPronunciationRuntime(makeApp(), makeSettings(), {
			speechSynthesis: null,
			requester: makeRequester(429),
			createAudio: makeAudioFactory(),
			createObjectUrl: () => "blob:test",
			revokeObjectUrl: vi.fn(),
			now: () => now,
		});

		await expect(runtime.speak("hello", "manual")).resolves.toMatchObject({
			status: "failed",
			reason: "quota",
		});
		expect(await runtime.canSpeak("hello")).toBe(false);
		now += 60_001;
		expect(await runtime.canSpeak("hello")).toBe(true);
		runtime.dispose();
	});

	it("cancels active local playback and reports playback errors", async () => {
		const synthesis = new FakeSpeechSynthesis();
		synthesis.voices = [makeVoice("en-US")];
		synthesis.autoEnd = false;
		const localRuntime = createPronunciationRuntime(makeApp(), makeSettings(), {
			speechSynthesis: synthesis as unknown as SpeechSynthesis,
			createUtterance: makeUtterance,
		});
		const pending = localRuntime.speak("hello", "manual");
		localRuntime.stop();
		await expect(pending).resolves.toEqual({ status: "cancelled" });
		localRuntime.dispose();

		const cloudRuntime = createPronunciationRuntime(makeApp(), makeSettings(), {
			speechSynthesis: null,
			requester: makeRequester(),
			createAudio: makeAudioFactory({ reject: true }),
			createObjectUrl: () => "blob:test",
			revokeObjectUrl: vi.fn(),
		});
		await expect(cloudRuntime.speak("hello", "manual")).resolves.toEqual({
			status: "failed",
			reason: "playback",
		});
		cloudRuntime.dispose();
	});

	it("times out cloud requests and applies the network cooldown", async () => {
		let now = 100;
		const requester = vi.fn<PronunciationRequester>(() => new Promise(() => undefined));
		const runtime = createPronunciationRuntime(makeApp(), makeSettings(), {
			speechSynthesis: null,
			requester,
			createAudio: makeAudioFactory(),
			createObjectUrl: () => "blob:test",
			revokeObjectUrl: vi.fn(),
			now: () => now,
			requestTimeoutMs: 5,
		});
		const pending = runtime.speak("hello", "manual");

		await expect(pending).resolves.toMatchObject({
			status: "failed",
			reason: "timeout",
		});
		expect(await runtime.canSpeak("hello")).toBe(false);
		now += 30_001;
		expect(await runtime.canSpeak("hello")).toBe(true);
		runtime.dispose();
	});
});
