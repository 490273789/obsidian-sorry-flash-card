import type {
	OnlinePronunciationProvider,
	PronunciationAccent,
	PronunciationRate,
	PronunciationSettings,
} from "../shared/types";

export type PronunciationSource = "local" | "cache" | "azure" | "openai";

export type PronunciationFailureReason =
	| "offline"
	| "not-configured"
	| "unauthorized"
	| "quota"
	| "network"
	| "timeout"
	| "playback"
	| "unsupported";

export type PronunciationOutcome =
	| {
			status: "success";
			source: PronunciationSource;
	  }
	| {
			status: "unavailable";
			reason: PronunciationFailureReason;
	  }
	| {
			status: "failed";
			reason: PronunciationFailureReason;
	  }
	| {
			status: "cancelled";
	  };

export interface PronunciationSnapshot {
	revision: number;
	hasLocalEnglishVoice: boolean;
	voicesLoaded: boolean;
	speakingText: string | null;
	cacheUsageBytes: number | null;
}

export interface PronunciationRequestDescriptor {
	provider: Exclude<OnlinePronunciationProvider, "none">;
	text: string;
	accent: Exclude<PronunciationAccent, "system">;
	rate: PronunciationRate;
	variant: string;
}

export interface SynthesizedAudio {
	data: ArrayBuffer;
	mimeType: string;
	source: Exclude<PronunciationSource, "local" | "cache">;
}

export interface PronunciationRuntime {
	getSnapshot(): PronunciationSnapshot;
	subscribe(listener: () => void): () => void;
	updateSettings(settings: PronunciationSettings): void;
	canSpeak(text: string): Promise<boolean>;
	speak(text: string, intent: "manual" | "auto"): Promise<PronunciationOutcome>;
	testOnlineProvider(text: string): Promise<PronunciationOutcome>;
	stop(): void;
	getCacheUsageBytes(): Promise<number>;
	clearCache(): Promise<void>;
	dispose(): void;
}

export interface CachedPronunciationAudio {
	data: ArrayBuffer;
	mimeType: string;
}

export interface PronunciationAudioCache {
	get(key: string): Promise<CachedPronunciationAudio | null>;
	put(key: string, audio: CachedPronunciationAudio): Promise<void>;
	getUsageBytes(): Promise<number>;
	clear(): Promise<void>;
}

export const PRONUNCIATION_CACHE_LIMIT_BYTES = 100 * 1024 * 1024;
