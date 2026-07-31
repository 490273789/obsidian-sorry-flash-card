import { requestUrl, type App, type RequestUrlParam } from "obsidian";
import type { PronunciationAccent, PronunciationSettings } from "../shared/types";
import { extractSpellingWord } from "../cards/spellingWord";
import { IndexedDbPronunciationAudioCache, createPronunciationCacheKey } from "./audioCache";
import {
	PronunciationProviderError,
	createPronunciationRequestDescriptor,
	synthesizeAzureSpeech,
	synthesizeOpenAiSpeech,
	type PronunciationRequester,
} from "./providers";
import type {
	PronunciationAudioCache,
	PronunciationFailureReason,
	PronunciationOutcome,
	PronunciationRequestDescriptor,
	PronunciationRuntime,
	PronunciationSnapshot,
	SynthesizedAudio,
} from "./types";

interface ActivePlayback {
	cancel(): void;
}

export interface PronunciationRuntimeDependencies {
	speechSynthesis?: SpeechSynthesis | null;
	createUtterance?: ((text: string) => SpeechSynthesisUtterance) | null;
	createAudio?: ((url: string) => HTMLAudioElement) | null;
	createObjectUrl?: ((blob: Blob) => string) | null;
	revokeObjectUrl?: ((url: string) => void) | null;
	requester?: PronunciationRequester;
	cache?: PronunciationAudioCache;
	isOnline?: () => boolean;
	now?: () => number;
	getSecret?: (id: string) => string | null;
	requestTimeoutMs?: number;
	voiceLoadTimeoutMs?: number;
	getSystemLanguage?: () => string;
	subscribeConnectivity?: (listener: () => void) => () => void;
}

export function createPronunciationRuntime(
	app: App,
	settings: PronunciationSettings,
	dependencies: PronunciationRuntimeDependencies = {},
): PronunciationRuntime {
	return new BrowserPronunciationRuntime(settings, {
		speechSynthesis:
			dependencies.speechSynthesis ??
			(typeof window === "undefined" ? null : window.speechSynthesis),
		createUtterance:
			dependencies.createUtterance ??
			(typeof SpeechSynthesisUtterance === "undefined"
				? null
				: (text) => new SpeechSynthesisUtterance(text)),
		createAudio:
			dependencies.createAudio ??
			(typeof Audio === "undefined" ? null : (url) => new Audio(url)),
		createObjectUrl:
			dependencies.createObjectUrl ??
			(typeof URL === "undefined" || typeof URL.createObjectURL !== "function"
				? null
				: (blob) => URL.createObjectURL(blob)),
		revokeObjectUrl:
			dependencies.revokeObjectUrl ??
			(typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function"
				? null
				: (url) => URL.revokeObjectURL(url)),
		requester: dependencies.requester ?? ((request: RequestUrlParam) => requestUrl(request)),
		cache: dependencies.cache ?? new IndexedDbPronunciationAudioCache(),
		isOnline:
			dependencies.isOnline ??
			(() => typeof navigator === "undefined" || navigator.onLine !== false),
		now: dependencies.now ?? Date.now,
		getSecret: dependencies.getSecret ?? ((id) => app.secretStorage.getSecret(id)),
		requestTimeoutMs: dependencies.requestTimeoutMs ?? 8000,
		voiceLoadTimeoutMs: dependencies.voiceLoadTimeoutMs ?? 400,
		getSystemLanguage:
			dependencies.getSystemLanguage ??
			(() => (typeof navigator === "undefined" ? "en-US" : navigator.language)),
		subscribeConnectivity:
			dependencies.subscribeConnectivity ??
			((listener) => {
				if (typeof window === "undefined") return () => undefined;
				window.addEventListener("online", listener);
				window.addEventListener("offline", listener);
				return () => {
					window.removeEventListener("online", listener);
					window.removeEventListener("offline", listener);
				};
			}),
	});
}

class BrowserPronunciationRuntime implements PronunciationRuntime {
	private settings: PronunciationSettings;
	private readonly listeners = new Set<() => void>();
	private voices: SpeechSynthesisVoice[] = [];
	private voicesLoaded = false;
	private speakingText: string | null = null;
	private cacheUsageBytes: number | null = null;
	private revision = 0;
	private activePlayback: ActivePlayback | null = null;
	private operationId = 0;
	private readonly voiceLoadWaiters = new Set<() => void>();
	private providerBlockedUntil = new Map<"azure" | "openai", number>();
	private readonly providerCooldownTimers = new Map<
		"azure" | "openai",
		ReturnType<typeof globalThis.setTimeout>
	>();
	private readonly voiceChangeListener = () => this.refreshVoices();
	private readonly unsubscribeConnectivity: () => void;

	constructor(
		settings: PronunciationSettings,
		private readonly dependencies: Required<PronunciationRuntimeDependencies>,
	) {
		this.settings = settings;
		this.refreshVoices();
		this.dependencies.speechSynthesis?.addEventListener(
			"voiceschanged",
			this.voiceChangeListener,
		);
		this.unsubscribeConnectivity = this.dependencies.subscribeConnectivity(() => this.bump());
		void this.refreshCacheUsage();
	}

	getSnapshot(): PronunciationSnapshot {
		return {
			revision: this.revision,
			hasLocalEnglishVoice: this.hasLocalEnglishVoice(),
			voicesLoaded: this.voicesLoaded,
			speakingText: this.speakingText,
			cacheUsageBytes: this.cacheUsageBytes,
		};
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	updateSettings(settings: PronunciationSettings): void {
		this.stop();
		this.settings = settings;
		this.providerBlockedUntil.clear();
		this.clearProviderCooldownTimers();
		this.bump();
	}

	async canSpeak(text: string): Promise<boolean> {
		const normalizedText = extractSpellingWord(text);
		if (!normalizedText) return false;
		await this.ensureVoicesLoaded();
		if (this.hasLocalEnglishVoice()) return true;
		const descriptor = this.createOnlineDescriptor(normalizedText);
		if (!descriptor) return false;
		const cacheKey = await this.tryCreateCacheKey(descriptor);
		if (cacheKey && (await this.dependencies.cache.get(cacheKey))) return true;
		return (
			Boolean(this.getProviderSecret(descriptor)) &&
			this.dependencies.isOnline() &&
			!this.isProviderBlocked(descriptor.provider)
		);
	}

	async speak(text: string, _intent: "manual" | "auto"): Promise<PronunciationOutcome> {
		this.stop();
		const operationId = ++this.operationId;
		const normalizedText = extractSpellingWord(text);
		if (!normalizedText) return { status: "unavailable", reason: "unsupported" };

		await this.ensureVoicesLoaded();
		if (operationId !== this.operationId) return { status: "cancelled" };
		const voice = selectLocalEnglishVoice(this.voices, this.settings.accent);
		if (voice) {
			return this.playLocal(normalizedText, voice, operationId);
		}

		const descriptor = this.createOnlineDescriptor(normalizedText);
		if (!descriptor) return { status: "unavailable", reason: "not-configured" };
		const cacheKey = await this.tryCreateCacheKey(descriptor);
		if (operationId !== this.operationId) return { status: "cancelled" };
		if (cacheKey) {
			const cached = await this.dependencies.cache.get(cacheKey);
			if (operationId !== this.operationId) return { status: "cancelled" };
			if (cached) {
				return this.playAudio(
					normalizedText,
					cached.data,
					cached.mimeType,
					"cache",
					operationId,
				);
			}
		}

		if (!this.dependencies.isOnline()) {
			return { status: "unavailable", reason: "offline" };
		}
		if (this.isProviderBlocked(descriptor.provider)) {
			return { status: "unavailable", reason: "network" };
		}
		const secret = this.getProviderSecret(descriptor);
		if (!secret) return { status: "unavailable", reason: "not-configured" };

		try {
			const audio = await withTimeout(
				this.synthesizeOnline(descriptor, secret),
				this.dependencies.requestTimeoutMs,
			);
			if (operationId !== this.operationId) return { status: "cancelled" };
			if (cacheKey) {
				await this.dependencies.cache.put(cacheKey, {
					data: audio.data,
					mimeType: audio.mimeType,
				});
				void this.refreshCacheUsage();
			}
			if (operationId !== this.operationId) return { status: "cancelled" };
			return this.playAudio(
				normalizedText,
				audio.data,
				audio.mimeType,
				audio.source,
				operationId,
			);
		} catch (error) {
			if (operationId !== this.operationId) return { status: "cancelled" };
			const reason = this.handleProviderError(descriptor.provider, error);
			return { status: "failed", reason };
		}
	}

	async testOnlineProvider(text: string): Promise<PronunciationOutcome> {
		this.stop();
		const operationId = ++this.operationId;
		const testWord = extractSpellingWord(text);
		if (!testWord) return { status: "unavailable", reason: "unsupported" };
		const descriptor = this.createOnlineDescriptor(testWord);
		if (!descriptor) return { status: "unavailable", reason: "not-configured" };
		const secret = this.getProviderSecret(descriptor);
		if (!secret) return { status: "unavailable", reason: "not-configured" };
		if (!this.dependencies.isOnline()) {
			return { status: "unavailable", reason: "offline" };
		}
		try {
			const audio = await withTimeout(
				this.synthesizeOnline(descriptor, secret),
				this.dependencies.requestTimeoutMs,
			);
			if (operationId !== this.operationId) return { status: "cancelled" };
			return this.playAudio(
				descriptor.text,
				audio.data,
				audio.mimeType,
				audio.source,
				operationId,
			);
		} catch (error) {
			if (operationId !== this.operationId) return { status: "cancelled" };
			const reason = this.handleProviderError(descriptor.provider, error);
			return { status: "failed", reason };
		}
	}

	stop(): void {
		this.operationId++;
		this.activePlayback?.cancel();
		this.activePlayback = null;
		if (this.speakingText !== null) {
			this.speakingText = null;
			this.bump();
		}
	}

	async getCacheUsageBytes(): Promise<number> {
		const usage = await this.dependencies.cache.getUsageBytes();
		this.cacheUsageBytes = usage;
		this.bump();
		return usage;
	}

	async clearCache(): Promise<void> {
		await this.dependencies.cache.clear();
		this.cacheUsageBytes = 0;
		this.bump();
	}

	dispose(): void {
		this.stop();
		this.dependencies.speechSynthesis?.removeEventListener(
			"voiceschanged",
			this.voiceChangeListener,
		);
		this.unsubscribeConnectivity();
		this.clearProviderCooldownTimers();
		for (const finish of this.voiceLoadWaiters) finish();
		this.voiceLoadWaiters.clear();
		this.listeners.clear();
	}

	private refreshVoices(): void {
		const synthesis = this.dependencies.speechSynthesis;
		this.voices = synthesis?.getVoices() ?? [];
		if (this.voices.length > 0 || synthesis === null) {
			this.voicesLoaded = true;
			for (const finish of this.voiceLoadWaiters) finish();
			this.voiceLoadWaiters.clear();
		}
		this.bump();
	}

	private async ensureVoicesLoaded(): Promise<void> {
		if (this.voicesLoaded) return;
		await new Promise<void>((resolve) => {
			let settled = false;
			const timer = globalThis.setTimeout(
				() => finish(),
				this.dependencies.voiceLoadTimeoutMs,
			);
			const finish = () => {
				if (settled) return;
				settled = true;
				globalThis.clearTimeout(timer);
				this.voiceLoadWaiters.delete(finish);
				resolve();
			};
			this.voiceLoadWaiters.add(finish);
		});
		if (this.voicesLoaded) return;
		this.voicesLoaded = true;
		this.bump();
	}

	private hasLocalEnglishVoice(): boolean {
		return selectLocalEnglishVoice(this.voices, this.settings.accent) !== null;
	}

	private async playLocal(
		text: string,
		voice: SpeechSynthesisVoice,
		operationId: number,
	): Promise<PronunciationOutcome> {
		const synthesis = this.dependencies.speechSynthesis;
		const createUtterance = this.dependencies.createUtterance;
		if (!synthesis || !createUtterance) {
			return { status: "unavailable", reason: "unsupported" };
		}
		let utterance: SpeechSynthesisUtterance;
		try {
			utterance = createUtterance(text);
		} catch {
			return { status: "failed", reason: "playback" };
		}
		utterance.voice = voice;
		utterance.lang = this.settings.accent === "system" ? voice.lang : this.settings.accent;
		utterance.rate = this.settings.rate === "slow" ? 0.75 : 1;
		return new Promise((resolve) => {
			let settled = false;
			const finish = (outcome: PronunciationOutcome) => {
				if (settled) return;
				settled = true;
				if (operationId === this.operationId) {
					this.activePlayback = null;
					this.speakingText = null;
					this.bump();
				}
				resolve(outcome);
			};
			this.activePlayback = {
				cancel: () => {
					try {
						synthesis.cancel();
					} catch {
						// Continue settling this plugin's active request.
					} finally {
						finish({ status: "cancelled" });
					}
				},
			};
			this.speakingText = text;
			this.bump();
			utterance.onend = () => finish({ status: "success", source: "local" });
			utterance.onerror = (event) =>
				finish(
					event.error === "canceled" || event.error === "interrupted"
						? { status: "cancelled" }
						: { status: "failed", reason: "playback" },
				);
			try {
				synthesis.speak(utterance);
			} catch {
				finish({ status: "failed", reason: "playback" });
			}
		});
	}

	private async playAudio(
		text: string,
		data: ArrayBuffer,
		mimeType: string,
		source: "cache" | "azure" | "openai",
		operationId: number,
	): Promise<PronunciationOutcome> {
		const createAudio = this.dependencies.createAudio;
		const createObjectUrl = this.dependencies.createObjectUrl;
		const revokeObjectUrl = this.dependencies.revokeObjectUrl;
		if (!createAudio || !createObjectUrl || !revokeObjectUrl) {
			return { status: "unavailable", reason: "unsupported" };
		}
		let objectUrl: string;
		let audio: HTMLAudioElement;
		try {
			objectUrl = createObjectUrl(new Blob([data], { type: mimeType }));
			audio = createAudio(objectUrl);
		} catch {
			return { status: "failed", reason: "playback" };
		}
		return new Promise((resolve) => {
			let settled = false;
			const finish = (outcome: PronunciationOutcome) => {
				if (settled) return;
				settled = true;
				audio.onended = null;
				audio.onerror = null;
				try {
					revokeObjectUrl(objectUrl);
				} catch {
					// A failed URL cleanup must not leave playback promises pending.
				}
				if (operationId === this.operationId) {
					this.activePlayback = null;
					this.speakingText = null;
					this.bump();
				}
				resolve(outcome);
			};
			this.activePlayback = {
				cancel: () => {
					try {
						audio.pause();
						audio.currentTime = 0;
					} catch {
						// Continue settling this plugin's active request.
					} finally {
						finish({ status: "cancelled" });
					}
				},
			};
			this.speakingText = text;
			this.bump();
			audio.onended = () => finish({ status: "success", source });
			audio.onerror = () => finish({ status: "failed", reason: "playback" });
			try {
				void Promise.resolve(audio.play()).catch(() =>
					finish({ status: "failed", reason: "playback" }),
				);
			} catch {
				finish({ status: "failed", reason: "playback" });
			}
		});
	}

	private async synthesizeOnline(
		descriptor: PronunciationRequestDescriptor,
		secret: string,
	): Promise<SynthesizedAudio> {
		return descriptor.provider === "azure"
			? synthesizeAzureSpeech(this.dependencies.requester, descriptor, this.settings, secret)
			: synthesizeOpenAiSpeech(this.dependencies.requester, descriptor, secret);
	}

	private createOnlineDescriptor(text: string): PronunciationRequestDescriptor | null {
		return createPronunciationRequestDescriptor(
			text,
			this.settings,
			this.dependencies.getSystemLanguage(),
		);
	}

	private getProviderSecret(descriptor: PronunciationRequestDescriptor): string | null {
		const secretId =
			descriptor.provider === "azure"
				? this.settings.azureSecretId
				: this.settings.openaiSecretId;
		if (!secretId.trim()) return null;
		try {
			return this.dependencies.getSecret(secretId)?.trim() || null;
		} catch {
			return null;
		}
	}

	private isProviderBlocked(provider: "azure" | "openai"): boolean {
		return (this.providerBlockedUntil.get(provider) ?? 0) > this.dependencies.now();
	}

	private handleProviderError(
		provider: "azure" | "openai",
		error: unknown,
	): PronunciationFailureReason {
		if (error instanceof TimeoutError) {
			this.blockProvider(provider, this.dependencies.now() + 30_000);
			return "timeout";
		}
		const status = error instanceof PronunciationProviderError ? error.status : null;
		if (status === 401 || status === 403) {
			this.blockProvider(provider, Number.POSITIVE_INFINITY);
			return "unauthorized";
		}
		if (status === 429) {
			this.blockProvider(provider, this.dependencies.now() + 60_000);
			return "quota";
		}
		this.blockProvider(provider, this.dependencies.now() + 30_000);
		return "network";
	}

	private blockProvider(provider: "azure" | "openai", until: number): void {
		const previousTimer = this.providerCooldownTimers.get(provider);
		if (previousTimer !== undefined) globalThis.clearTimeout(previousTimer);
		this.providerCooldownTimers.delete(provider);
		this.providerBlockedUntil.set(provider, until);
		if (Number.isFinite(until)) {
			const timer = globalThis.setTimeout(
				() => {
					if (this.providerBlockedUntil.get(provider) !== until) return;
					this.providerBlockedUntil.delete(provider);
					this.providerCooldownTimers.delete(provider);
					this.bump();
				},
				Math.max(0, until - this.dependencies.now()),
			);
			this.providerCooldownTimers.set(provider, timer);
		}
		this.bump();
	}

	private clearProviderCooldownTimers(): void {
		for (const timer of this.providerCooldownTimers.values()) {
			globalThis.clearTimeout(timer);
		}
		this.providerCooldownTimers.clear();
	}

	private async tryCreateCacheKey(
		descriptor: PronunciationRequestDescriptor,
	): Promise<string | null> {
		try {
			return await createPronunciationCacheKey(descriptor);
		} catch {
			return null;
		}
	}

	private async refreshCacheUsage(): Promise<void> {
		this.cacheUsageBytes = await this.dependencies.cache.getUsageBytes();
		this.bump();
	}

	private bump(): void {
		this.revision++;
		for (const listener of this.listeners) listener();
	}
}

export function selectLocalEnglishVoice(
	voices: readonly SpeechSynthesisVoice[],
	accent: PronunciationAccent,
): SpeechSynthesisVoice | null {
	const localEnglishVoices = voices.filter(
		(voice) => voice.localService && voice.lang.toLowerCase().startsWith("en"),
	);
	if (localEnglishVoices.length === 0) return null;
	if (accent !== "system") {
		const exact = localEnglishVoices.find(
			(voice) => voice.lang.toLowerCase() === accent.toLowerCase(),
		);
		if (exact) return exact;
	}
	return localEnglishVoices.find((voice) => voice.default) ?? localEnglishVoices[0] ?? null;
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = globalThis.setTimeout(() => reject(new TimeoutError()), timeoutMs);
		void promise.then(
			(value) => {
				globalThis.clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				globalThis.clearTimeout(timer);
				reject(error);
			},
		);
	});
}
