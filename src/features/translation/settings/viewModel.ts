import type { AiEngineConfig, AiSnapshot } from "../../../core/ai";
import { translationSettingsStrings } from "../strings/settings";
import type { Language } from "../../../core/shared/types";
import type { TranslationProfile, TranslationSnapshot } from "../domain/types";
import type {
	SettingsActionResult,
	SettingsViewModelControl,
	SettingsViewModelDefinition,
	SettingsViewModelSetting,
} from "../../flashcards/settings/viewModel";

export interface TranslationSettingsEditorState {
	snapshot: TranslationSnapshot;
	draft: TranslationSnapshot["settings"];
	aiSnapshot: AiSnapshot;
	saving: boolean;
}

export interface TranslationSettingsEditorActions {
	patch: (patch: Partial<TranslationSnapshot["settings"]>) => SettingsActionResult;
	patchProfile: (id: string, patch: Partial<TranslationProfile>) => SettingsActionResult;
	addProfile: () => SettingsActionResult;
	removeProfile: (id: string) => SettingsActionResult;
	moveProfile: (id: string, offset: -1 | 1) => SettingsActionResult;
	resetPrompt: () => SettingsActionResult;
	save: () => SettingsActionResult;
	testYoudao: () => SettingsActionResult;
}

export function buildTranslationSettingsViewModel(
	state: TranslationSettingsEditorState,
	actions: TranslationSettingsEditorActions,
	language: Language,
): SettingsViewModelDefinition {
	const t = translationSettingsStrings(language);
	const { draft, saving, snapshot } = state;
	const aiConfigs = state.aiSnapshot.settings.configs.filter(
		(config) => config.provider === "deepseek" || config.provider === "bailian",
	);
	const row = (
		name: string,
		controls: SettingsViewModelControl[],
		desc?: string,
	): SettingsViewModelSetting => ({ type: "setting", name, controls, desc });
	const button = (label: string, onClick: () => SettingsActionResult, disabled = saving) => ({
		type: "button" as const,
		label,
		disabled,
		onClick,
	});
	const profileRows = draft.profiles.flatMap((profile, index) =>
		profileSettings(profile, index, draft.profiles.length, aiConfigs, actions, t, saving),
	);
	return {
		type: "group",
		heading: t.heading,
		items: [
			row(
				t.enabled,
				[
					{
						type: "toggle",
						value: draft.enabled,
						disabled: saving,
						onChange: (enabled) => actions.patch({ enabled }),
					},
				],
				t.enabledDesc,
			),
			row(
				t.thinking,
				[
					{
						type: "toggle",
						value: draft.thinkingEnabled,
						disabled: saving,
						onChange: (thinkingEnabled) => actions.patch({ thinkingEnabled }),
					},
				],
				t.thinkingDesc,
			),
			row(t.profiles, [button(t.addProfile, actions.addProfile)], t.profilesDesc),
			...profileRows,
			row(
				t.prompt,
				[
					{
						type: "textarea",
						value: draft.promptTemplate,
						placeholder: "",
						disabled: saving,
						onChange: (promptTemplate) => actions.patch({ promptTemplate }),
					},
					button(t.resetPrompt, actions.resetPrompt),
				],
				t.promptDesc,
			),
			row(t.youdaoHeading, [], t.youdaoEndpointDesc),
			row(t.youdaoEndpoint, [
				{
					type: "text",
					value: draft.youdao.baseUrl,
					placeholder: t.youdaoEndpointPlaceholder,
					disabled: saving,
					onChange: (baseUrl) => actions.patch({ youdao: { ...draft.youdao, baseUrl } }),
				},
			]),
			row(t.youdaoAppKey, [
				{
					type: "secret",
					value: draft.youdao.appKeySecretId,
					disabled: saving,
					onChange: (appKeySecretId) =>
						actions.patch({ youdao: { ...draft.youdao, appKeySecretId } }),
				},
			]),
			row(t.youdaoAppSecret, [
				{
					type: "secret",
					value: draft.youdao.appSecretSecretId,
					disabled: saving,
					onChange: (appSecretSecretId) =>
						actions.patch({ youdao: { ...draft.youdao, appSecretSecretId } }),
				},
			]),
			row(
				t.testYoudao,
				[
					button(
						snapshot.testing ? t.testing : t.testYoudao,
						actions.testYoudao,
						saving || snapshot.testing,
					),
				],
				t.testYoudaoDesc,
			),
			row(t.heading, [button(t.save, actions.save)]),
		],
	};
}

function profileSettings(
	profile: TranslationProfile,
	index: number,
	count: number,
	aiConfigs: readonly AiEngineConfig[],
	actions: TranslationSettingsEditorActions,
	t: ReturnType<typeof translationSettingsStrings>,
	saving: boolean,
): SettingsViewModelSetting[] {
	const actionButton = (
		label: string,
		onClick: () => SettingsActionResult,
		disabled: boolean,
	): SettingsViewModelControl => ({ type: "button", label, onClick, disabled });
	const rows: SettingsViewModelSetting[] = [
		{
			type: "setting",
			name: t.profile(index + 1),
			desc: t.profileEnabled,
			controls: [
				{
					type: "toggle",
					value: profile.enabled,
					disabled: saving,
					onChange: (enabled) => actions.patchProfile(profile.id, { enabled }),
				},
				{
					type: "text",
					value: profile.name,
					placeholder: t.profileNamePlaceholder,
					disabled: saving,
					onChange: (name) => actions.patchProfile(profile.id, { name }),
				},
			],
		},
		{
			type: "setting",
			name: t.provider,
			controls: [
				{
					type: "select",
					value: profile.kind,
					disabled: saving,
					options: [
						{ value: "engine", label: t.engine },
						{ value: "youdao", label: t.youdao },
					],
					onChange: (kind) => {
						if (kind === "engine" || kind === "youdao")
							return actions.patchProfile(profile.id, { kind });
					},
				},
			],
		},
		{
			type: "setting",
			name: t.profileActions,
			controls: [
				actionButton(
					t.moveUp,
					() => actions.moveProfile(profile.id, -1),
					saving || index === 0,
				),
				actionButton(
					t.moveDown,
					() => actions.moveProfile(profile.id, 1),
					saving || index === count - 1,
				),
				actionButton(
					t.remove,
					() => actions.removeProfile(profile.id),
					saving || count === 1,
				),
			],
		},
	];
	if (profile.kind === "engine") {
		rows.push({
			type: "setting",
			name: t.engineConfig,
			desc: aiConfigs.length ? undefined : t.noEngineConfigs,
			controls: [
				{
					type: "select",
					value: profile.configId,
					disabled: saving || aiConfigs.length === 0,
					options: [
						{ value: "", label: t.selectEngine },
						...(profile.configId &&
						!aiConfigs.some((config) => config.id === profile.configId)
							? [{ value: profile.configId, label: t.missingEngineConfig }]
							: []),
						...aiConfigs.map((config) => ({ value: config.id, label: config.name })),
					],
					onChange: (configId) => actions.patchProfile(profile.id, { configId }),
				},
			],
		});
	}
	return rows;
}
