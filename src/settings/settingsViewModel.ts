import { createTranslator } from "../i18n";
import type {
	FlashcardSettings,
	Language,
	OnlinePronunciationProvider,
	PronunciationAccent,
	PronunciationRate,
	StudySettings,
} from "../shared/types";

export type SettingsActionResult = void | Promise<void>;

export interface SettingsViewModelState {
	settings: FlashcardSettings;
	availableTags: string[];
	isLoadingTags: boolean;
	hasLoadedTags: boolean;
	language: Language;
	pronunciationCacheUsageBytes: number | null;
	isTestingPronunciation: boolean;
	isClearingPronunciationCache: boolean;
}

export interface SettingsViewModelActions {
	refreshTags: (options: { cleanConfiguredTags: boolean }) => SettingsActionResult;
	updateFlashcardTag: (index: number, value: string) => SettingsActionResult;
	addFlashcardTag: () => SettingsActionResult;
	removeFlashcardTag: (index: number) => SettingsActionResult;
	addDiscoveredTag: (tag: string) => SettingsActionResult;
	setLanguage: (language: Language) => SettingsActionResult;
	setDailyNewCards: (value: number) => SettingsActionResult;
	setDailyReviewCards: (value: number) => SettingsActionResult;
	setStudyOrder: (value: StudySettings["studyOrder"]) => SettingsActionResult;
	setRequestRetention: (value: number) => SettingsActionResult;
	setMaximumInterval: (value: number) => SettingsActionResult;
	setPronunciationAutoPlay: (value: boolean) => SettingsActionResult;
	setPronunciationAccent: (value: PronunciationAccent) => SettingsActionResult;
	setPronunciationRate: (value: PronunciationRate) => SettingsActionResult;
	setOnlinePronunciationProvider: (value: OnlinePronunciationProvider) => SettingsActionResult;
	setAzureCloud: (value: "china" | "global") => SettingsActionResult;
	setAzureRegion: (value: string) => SettingsActionResult;
	setAzureSecretId: (value: string) => SettingsActionResult;
	setOpenAiSecretId: (value: string) => SettingsActionResult;
	testOnlinePronunciation: () => SettingsActionResult;
	clearPronunciationCache: () => SettingsActionResult;
}

export type SettingsViewModelDefinition = SettingsViewModelGroup;

export interface SettingsViewModelGroup {
	type: "group";
	heading: string;
	items: SettingsViewModelSetting[];
	visible?: SettingsVisibleState;
}

export interface SettingsViewModelSetting {
	type: "setting";
	name: string;
	desc?: string;
	help?: SettingsHelpModel;
	controls?: SettingsViewModelControl[];
	visible?: SettingsVisibleState;
}

export type SettingsVisibleState = boolean | (() => boolean);

export type SettingsViewModelControl =
	| SettingsButtonControl
	| SettingsEditableTextListControl
	| SettingsTagButtonsControl
	| SettingsSelectControl
	| SettingsSliderControl
	| SettingsIntegerTextControl
	| SettingsToggleControl
	| SettingsTextControl
	| SettingsSecretControl
	| SettingsStatusControl;

export interface SettingsButtonControl {
	type: "button";
	label: string;
	disabled: boolean;
	onClick: () => SettingsActionResult;
}

export interface SettingsEditableTextListControl {
	type: "editableTextList";
	variant: "flashcardTags";
	values: string[];
	placeholder: string;
	addLabel: string;
	removeAriaLabel: string;
	onChange: (index: number, value: string) => SettingsActionResult;
	onAdd: () => SettingsActionResult;
	onRemove: (index: number) => SettingsActionResult;
}

export interface SettingsTagButtonsControl {
	type: "tagButtons";
	tags: string[];
	emptyText: string;
	onClick: (tag: string) => SettingsActionResult;
}

export interface SettingsSelectControl {
	type: "select";
	value: string;
	options: SettingsSelectOption[];
	onChange: (value: string) => SettingsActionResult;
}

export interface SettingsSelectOption {
	value: string;
	label: string;
}

export interface SettingsSliderControl {
	type: "slider";
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => SettingsActionResult;
}

export interface SettingsIntegerTextControl {
	type: "integerText";
	value: number;
	placeholder: string;
	min: number;
	max: number;
	onChange: (value: number) => SettingsActionResult;
}

export interface SettingsToggleControl {
	type: "toggle";
	value: boolean;
	onChange: (value: boolean) => SettingsActionResult;
}

export interface SettingsTextControl {
	type: "text";
	value: string;
	placeholder: string;
	onChange: (value: string) => SettingsActionResult;
}

export interface SettingsSecretControl {
	type: "secret";
	value: string;
	onChange: (value: string) => SettingsActionResult;
}

export interface SettingsStatusControl {
	type: "status";
	text: string;
}

export interface SettingsHelpModel {
	cardFormatTitle: string;
	cardFormatExample: string;
	shortcutsTitle: string;
	shortcuts: string[];
}

const LANGUAGE_OPTIONS: readonly Language[] = ["zh", "en"];

export function buildSettingsViewModel(
	state: SettingsViewModelState,
	actions: SettingsViewModelActions,
): SettingsViewModelDefinition[] {
	const t = createTranslator(state.language);
	const unusedTags = getUnusedTags(state.availableTags, state.settings.flashcardTags);

	return [
		{
			type: "group",
			heading: t("settings.flashcardGroup"),
			items: [
				{
					type: "setting",
					name: t("settings.flashcardTagsName"),
					desc: t("settings.flashcardTagsDesc"),
					controls: [
						{
							type: "button",
							label: state.isLoadingTags
								? t("settings.refreshingTags")
								: t("settings.refreshAndCleanTags"),
							disabled: state.isLoadingTags,
							onClick: () =>
								actions.refreshTags({
									cleanConfiguredTags: true,
								}),
						},
						{
							type: "editableTextList",
							variant: "flashcardTags",
							values: state.settings.flashcardTags,
							placeholder: t("settings.flashcardTagPlaceholder"),
							addLabel: t("settings.addTag"),
							removeAriaLabel: t("settings.delete"),
							onChange: actions.updateFlashcardTag,
							onAdd: actions.addFlashcardTag,
							onRemove: actions.removeFlashcardTag,
						},
					],
				},
				{
					type: "setting",
					name: t("settings.discoveredTagsName"),
					desc: t("settings.discoveredTagsDesc"),
					controls: [
						{
							type: "button",
							label: state.isLoadingTags
								? t("settings.refreshingTags")
								: t("settings.refreshTags"),
							disabled: state.isLoadingTags,
							onClick: () =>
								actions.refreshTags({
									cleanConfiguredTags: false,
								}),
						},
						{
							type: "tagButtons",
							tags: unusedTags,
							emptyText: state.hasLoadedTags
								? t("settings.noDiscoveredTags")
								: t("settings.discoveredTagsNotLoaded"),
							onClick: actions.addDiscoveredTag,
						},
					],
				},
			],
		},
		{
			type: "group",
			heading: t("settings.interfaceGroup"),
			items: [
				{
					type: "setting",
					name: t("settings.languageName"),
					desc: t("settings.languageDesc"),
					controls: [
						{
							type: "select",
							value: state.language,
							options: LANGUAGE_OPTIONS.map((language) => ({
								value: language,
								label:
									language === "zh"
										? t("settings.languageZh")
										: t("settings.languageEn"),
							})),
							onChange: (value) => actions.setLanguage(parseLanguage(value)),
						},
					],
				},
			],
		},
		{
			type: "group",
			heading: t("settings.defaultStudyGroup"),
			items: [
				{
					type: "setting",
					name: t("settings.scopeName"),
					desc: t("settings.scopeDesc"),
				},
				{
					type: "setting",
					name: t("settings.dailyNewName"),
					desc: t("settings.dailyNewDesc"),
					controls: [
						{
							type: "slider",
							min: 1,
							max: 200,
							step: 1,
							value: state.settings.dailyNewCards,
							onChange: actions.setDailyNewCards,
						},
					],
				},
				{
					type: "setting",
					name: t("settings.dailyReviewName"),
					desc: t("settings.dailyReviewDesc"),
					controls: [
						{
							type: "slider",
							min: 1,
							max: 500,
							step: 10,
							value: state.settings.dailyReviewCards,
							onChange: actions.setDailyReviewCards,
						},
					],
				},
				{
					type: "setting",
					name: t("settings.studyOrderName"),
					desc: t("settings.studyOrderDesc"),
					controls: [
						{
							type: "select",
							value: state.settings.studyOrder,
							options: [
								{
									value: "sequential",
									label: t("order.sequential"),
								},
								{
									value: "random",
									label: t("order.random"),
								},
							],
							onChange: (value) => actions.setStudyOrder(parseStudyOrder(value)),
						},
					],
				},
			],
		},
		{
			type: "group",
			heading: t("settings.pronunciationGroup"),
			items: [
				{
					type: "setting",
					name: t("settings.pronunciationAutoName"),
					desc: t("settings.pronunciationAutoDesc"),
					controls: [
						{
							type: "toggle",
							value: state.settings.pronunciation.spellingAutoPlay,
							onChange: actions.setPronunciationAutoPlay,
						},
					],
				},
				{
					type: "setting",
					name: t("settings.pronunciationAccentName"),
					desc: t("settings.pronunciationAccentDesc"),
					controls: [
						{
							type: "select",
							value: state.settings.pronunciation.accent,
							options: [
								{
									value: "system",
									label: t("settings.pronunciationAccentSystem"),
								},
								{
									value: "en-US",
									label: t("settings.pronunciationAccentUs"),
								},
								{
									value: "en-GB",
									label: t("settings.pronunciationAccentGb"),
								},
							],
							onChange: (value) =>
								actions.setPronunciationAccent(parsePronunciationAccent(value)),
						},
					],
				},
				{
					type: "setting",
					name: t("settings.pronunciationRateName"),
					controls: [
						{
							type: "select",
							value: state.settings.pronunciation.rate,
							options: [
								{
									value: "normal",
									label: t("settings.pronunciationRateNormal"),
								},
								{
									value: "slow",
									label: t("settings.pronunciationRateSlow"),
								},
							],
							onChange: (value) =>
								actions.setPronunciationRate(parsePronunciationRate(value)),
						},
					],
				},
				{
					type: "setting",
					name: t("settings.pronunciationProviderName"),
					desc: t("settings.pronunciationProviderDesc"),
					controls: [
						{
							type: "select",
							value: state.settings.pronunciation.onlineProvider,
							options: [
								{
									value: "none",
									label: t("settings.pronunciationProviderNone"),
								},
								{
									value: "azure",
									label: t("settings.pronunciationProviderAzure"),
								},
								{
									value: "openai",
									label: t("settings.pronunciationProviderOpenAi"),
								},
							],
							onChange: (value) =>
								actions.setOnlinePronunciationProvider(
									parseOnlinePronunciationProvider(value),
								),
						},
					],
				},
				{
					type: "setting",
					name: t("settings.pronunciationAzureCloudName"),
					visible: state.settings.pronunciation.onlineProvider === "azure",
					controls: [
						{
							type: "select",
							value: state.settings.pronunciation.azureCloud,
							options: [
								{
									value: "china",
									label: t("settings.pronunciationAzureChina"),
								},
								{
									value: "global",
									label: t("settings.pronunciationAzureGlobal"),
								},
							],
							onChange: (value) =>
								actions.setAzureCloud(value === "global" ? "global" : "china"),
						},
					],
				},
				{
					type: "setting",
					name: t("settings.pronunciationAzureRegionName"),
					desc:
						state.settings.pronunciation.azureCloud === "china"
							? t("settings.pronunciationAzureChinaRegionDesc")
							: t("settings.pronunciationAzureGlobalRegionDesc"),
					visible: state.settings.pronunciation.onlineProvider === "azure",
					controls: [
						{
							type: "text",
							value: state.settings.pronunciation.azureRegion,
							placeholder:
								state.settings.pronunciation.azureCloud === "china"
									? "chinaeast2"
									: "eastus",
							onChange: actions.setAzureRegion,
						},
					],
				},
				{
					type: "setting",
					name: t("settings.pronunciationAzureSecretName"),
					desc: t("settings.pronunciationAzureSecretDesc"),
					visible: state.settings.pronunciation.onlineProvider === "azure",
					controls: [
						{
							type: "secret",
							value: state.settings.pronunciation.azureSecretId,
							onChange: actions.setAzureSecretId,
						},
					],
				},
				{
					type: "setting",
					name: t("settings.pronunciationOpenAiSecretName"),
					desc: t("settings.pronunciationOpenAiSecretDesc"),
					visible: state.settings.pronunciation.onlineProvider === "openai",
					controls: [
						{
							type: "secret",
							value: state.settings.pronunciation.openaiSecretId,
							onChange: actions.setOpenAiSecretId,
						},
					],
				},
				{
					type: "setting",
					name: t("settings.pronunciationOpenAiWarningName"),
					desc: t("settings.pronunciationOpenAiWarningDesc"),
					visible: state.settings.pronunciation.onlineProvider === "openai",
				},
				{
					type: "setting",
					name: t("settings.pronunciationTestName"),
					desc: t("settings.pronunciationTestDesc"),
					visible: state.settings.pronunciation.onlineProvider !== "none",
					controls: [
						{
							type: "button",
							label: state.isTestingPronunciation
								? t("settings.pronunciationTesting")
								: t("settings.pronunciationTestButton"),
							disabled: state.isTestingPronunciation,
							onClick: actions.testOnlinePronunciation,
						},
					],
				},
				{
					type: "setting",
					name: t("settings.pronunciationCacheName"),
					desc: t("settings.pronunciationCacheDesc"),
					controls: [
						{
							type: "status",
							text:
								state.pronunciationCacheUsageBytes === null
									? t("settings.pronunciationCacheLoading")
									: formatBytes(state.pronunciationCacheUsageBytes),
						},
						{
							type: "button",
							label: state.isClearingPronunciationCache
								? t("settings.pronunciationCacheClearing")
								: t("settings.pronunciationCacheClear"),
							disabled: state.isClearingPronunciationCache,
							onClick: actions.clearPronunciationCache,
						},
					],
				},
			],
		},
		{
			type: "group",
			heading: t("settings.fsrsGroup"),
			items: [
				{
					type: "setting",
					name: t("settings.retentionName"),
					desc: t("settings.retentionDesc"),
					controls: [
						{
							type: "slider",
							min: 0.7,
							max: 0.99,
							step: 0.01,
							value: state.settings.fsrsParameters.requestRetention,
							onChange: actions.setRequestRetention,
						},
					],
				},
				{
					type: "setting",
					name: t("settings.maxIntervalName"),
					desc: t("settings.maxIntervalDesc"),
					controls: [
						{
							type: "integerText",
							placeholder: "365",
							min: 30,
							max: 3650,
							value: state.settings.fsrsParameters.maximumInterval,
							onChange: actions.setMaximumInterval,
						},
					],
				},
			],
		},
		{
			type: "group",
			heading: t("settings.helpGroup"),
			items: [
				{
					type: "setting",
					name: t("settings.helpName"),
					help: {
						cardFormatTitle: t("settings.cardFormatTitle"),
						cardFormatExample: t("settings.cardFormatExample"),
						shortcutsTitle: t("settings.shortcutsTitle"),
						shortcuts: [
							t("settings.shortcutSpace"),
							t("settings.shortcutAgain"),
							t("settings.shortcutHard"),
							t("settings.shortcutGood"),
							t("settings.shortcutEasy"),
							t("settings.shortcutTrash"),
							t("settings.shortcutPrevious"),
						],
					},
				},
			],
		},
	];
}

export function getUnusedTags(availableTags: string[], configuredTags: string[]): string[] {
	return availableTags.filter((tag) => !configuredTags.includes(tag));
}

function parseLanguage(value: string): Language {
	return value === "en" ? "en" : "zh";
}

function parseStudyOrder(value: string): StudySettings["studyOrder"] {
	return value === "sequential" ? "sequential" : "random";
}

function parsePronunciationAccent(value: string): PronunciationAccent {
	return value === "en-US" || value === "en-GB" ? value : "system";
}

function parsePronunciationRate(value: string): PronunciationRate {
	return value === "slow" ? "slow" : "normal";
}

function parseOnlinePronunciationProvider(value: string): OnlinePronunciationProvider {
	return value === "azure" || value === "openai" ? value : "none";
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
