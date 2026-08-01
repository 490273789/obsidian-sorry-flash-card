import {
	DEFAULT_SETTINGS,
	type OnlinePronunciationProvider,
	type PronunciationAccent,
	type PronunciationRate,
	type PronunciationSettings,
} from "../shared/types";

const PRONUNCIATION_ACCENTS = new Set<PronunciationAccent>(["system", "en-US", "en-GB"]);
const PRONUNCIATION_RATES = new Set<PronunciationRate>(["normal", "slow"]);
const ONLINE_PROVIDERS = new Set<OnlinePronunciationProvider>(["none", "azure", "openai"]);
const AZURE_CHINA_REGIONS = new Set(["chinaeast2", "chinanorth2", "chinanorth3"]);

export function normalizePronunciationSettings(
	settings: Partial<PronunciationSettings> | null | undefined,
): PronunciationSettings {
	const defaults = DEFAULT_SETTINGS.pronunciation;
	const accent = PRONUNCIATION_ACCENTS.has(settings?.accent as PronunciationAccent)
		? (settings?.accent as PronunciationAccent)
		: defaults.accent;
	const rate = PRONUNCIATION_RATES.has(settings?.rate as PronunciationRate)
		? (settings?.rate as PronunciationRate)
		: defaults.rate;
	const onlineProvider = ONLINE_PROVIDERS.has(
		settings?.onlineProvider as OnlinePronunciationProvider,
	)
		? (settings?.onlineProvider as OnlinePronunciationProvider)
		: defaults.onlineProvider;
	const azureCloud = settings?.azureCloud === "global" ? "global" : "china";
	let azureRegion =
		typeof settings?.azureRegion === "string"
			? settings.azureRegion.trim().toLowerCase()
			: defaults.azureRegion;

	if (azureCloud === "china" && !AZURE_CHINA_REGIONS.has(azureRegion)) {
		azureRegion = "chinaeast2";
	}
	if (azureCloud === "global" && AZURE_CHINA_REGIONS.has(azureRegion)) {
		azureRegion = "eastus";
	}

	return {
		spellingAutoPlay:
			typeof settings?.spellingAutoPlay === "boolean"
				? settings.spellingAutoPlay
				: defaults.spellingAutoPlay,
		accent,
		rate,
		onlineProvider,
		azureCloud,
		azureRegion,
		azureSecretId:
			typeof settings?.azureSecretId === "string"
				? settings.azureSecretId
				: defaults.azureSecretId,
		openaiSecretId:
			typeof settings?.openaiSecretId === "string"
				? settings.openaiSecretId
				: defaults.openaiSecretId,
	};
}
