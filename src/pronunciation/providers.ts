import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
import type { PronunciationSettings } from "../shared/types";
import type { PronunciationRequestDescriptor, SynthesizedAudio } from "./types";

export type PronunciationRequester = (
	request: RequestUrlParam,
) => Promise<Pick<RequestUrlResponse, "status" | "arrayBuffer" | "headers">>;

export class PronunciationProviderError extends Error {
	constructor(
		message: string,
		readonly status: number | null,
	) {
		super(message);
		this.name = "PronunciationProviderError";
	}
}

const AZURE_VOICES = {
	"en-US": "en-US-JennyNeural",
	"en-GB": "en-GB-SoniaNeural",
} as const;
const AZURE_CHINA_REGIONS = new Set(["chinaeast2", "chinanorth2", "chinanorth3"]);

export const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
export const OPENAI_TTS_VOICE = "marin";

export function createPronunciationRequestDescriptor(
	text: string,
	settings: PronunciationSettings,
	systemLanguage = "en-US",
): PronunciationRequestDescriptor | null {
	const provider = settings.onlineProvider;
	if (provider === "none") return null;
	const accent =
		settings.accent === "en-GB" ||
		(settings.accent === "system" && systemLanguage.toLowerCase().startsWith("en-gb"))
			? "en-GB"
			: "en-US";
	const variant =
		provider === "azure"
			? [settings.azureCloud, settings.azureRegion, AZURE_VOICES[accent], settings.rate].join(
					":",
				)
			: [OPENAI_TTS_MODEL, OPENAI_TTS_VOICE, accent, settings.rate].join(":");
	return {
		provider,
		text: normalizePronunciationText(text),
		accent,
		rate: settings.rate,
		variant,
	};
}

export async function synthesizeAzureSpeech(
	requester: PronunciationRequester,
	descriptor: PronunciationRequestDescriptor,
	settings: PronunciationSettings,
	secret: string,
): Promise<SynthesizedAudio> {
	const region = settings.azureRegion.trim().toLowerCase();
	if (!/^[a-z0-9]+$/.test(region)) {
		throw new PronunciationProviderError("Invalid Azure Speech region", null);
	}
	if (settings.azureCloud === "china" && !AZURE_CHINA_REGIONS.has(region)) {
		throw new PronunciationProviderError("Unsupported Azure China Speech region", null);
	}
	const domain =
		settings.azureCloud === "china" ? "tts.speech.azure.cn" : "tts.speech.microsoft.com";
	const voice = AZURE_VOICES[descriptor.accent];
	const prosodyRate = descriptor.rate === "slow" ? "-25%" : "0%";
	const body = [
		`<speak version="1.0" xml:lang="${descriptor.accent}">`,
		`<voice name="${voice}">`,
		`<prosody rate="${prosodyRate}">${escapeXml(descriptor.text)}</prosody>`,
		"</voice>",
		"</speak>",
	].join("");
	const response = await requester({
		url: `https://${region}.${domain}/cognitiveservices/v1`,
		method: "POST",
		contentType: "application/ssml+xml",
		headers: {
			"Ocp-Apim-Subscription-Key": secret,
			"X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
			"User-Agent": "wsr-flash-card",
		},
		body,
		throw: false,
	});
	assertSuccessfulResponse(response.status);
	return {
		data: response.arrayBuffer,
		mimeType: getContentType(response.headers) ?? "audio/mpeg",
		source: "azure",
	};
}

export async function synthesizeOpenAiSpeech(
	requester: PronunciationRequester,
	descriptor: PronunciationRequestDescriptor,
	secret: string,
): Promise<SynthesizedAudio> {
	const accentDescription =
		descriptor.accent === "en-GB" ? "standard British English" : "standard American English";
	const response = await requester({
		url: "https://api.openai.com/v1/audio/speech",
		method: "POST",
		contentType: "application/json",
		headers: {
			Authorization: `Bearer ${secret}`,
		},
		body: JSON.stringify({
			model: OPENAI_TTS_MODEL,
			voice: OPENAI_TTS_VOICE,
			input: descriptor.text,
			instructions: `Pronounce only the supplied English word or phrase in a clear ${accentDescription} accent. Do not add any other words or sounds.`,
			response_format: "mp3",
			speed: descriptor.rate === "slow" ? 0.75 : 1,
		}),
		throw: false,
	});
	assertSuccessfulResponse(response.status);
	return {
		data: response.arrayBuffer,
		mimeType: getContentType(response.headers) ?? "audio/mpeg",
		source: "openai",
	};
}

export function normalizePronunciationText(text: string): string {
	return text.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function escapeXml(value: string): string {
	return value.replace(/[<>&'"]/g, (character) => {
		switch (character) {
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case "&":
				return "&amp;";
			case "'":
				return "&apos;";
			default:
				return "&quot;";
		}
	});
}

function assertSuccessfulResponse(status: number): void {
	if (status >= 200 && status < 300) return;
	throw new PronunciationProviderError(`Pronunciation provider returned ${status}`, status);
}

function getContentType(headers: Record<string, string>): string | null {
	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() === "content-type") return value.split(";")[0]?.trim() ?? null;
	}
	return null;
}
