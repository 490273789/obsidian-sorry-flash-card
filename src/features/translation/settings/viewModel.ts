import type { AiEngineConfig, AiSnapshot } from "../../../core/ai";
import { translationSettingsStrings } from "../strings/settings";
import type { Language } from "../../../core/shared/types";
import type { TranslationProfile, TranslationSnapshot } from "../domain/types";
import type {
	SettingsActionResult,
	SettingsProfileCardItem,
	SettingsViewModelControl,
	SettingsViewModelDefinition,
	SettingsViewModelSetting,
} from "../../../core/settings/viewModel";

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
): SettingsViewModelDefinition[] {
	const t = translationSettingsStrings(language);
	const { draft, saving, snapshot } = state;
	const aiConfigs = state.aiSnapshot.settings.configs.filter(
		(config) => config.provider === "deepseek" || config.provider === "bailian",
	);
	const row = (
		name: string,
		controls: SettingsViewModelControl[],
		desc?: string,
		cls?: string,
	): SettingsViewModelSetting => ({ type: "setting", name, controls, desc, cls });
	const button = (
		label: string,
		onClick: () => SettingsActionResult,
		disabled = saving,
		variant?: "default" | "warning" | "primary",
	): SettingsViewModelControl => ({
		type: "button",
		label,
		disabled,
		onClick,
		variant,
	});

	const profileCardItems: SettingsProfileCardItem[] = draft.profiles.map((profile, index) => {
		const engineOptions = [
			{ value: "", label: t.selectEngine },
			...(profile.configId && !aiConfigs.some((config) => config.id === profile.configId)
				? [{ value: profile.configId, label: t.missingEngineConfig }]
				: []),
			...aiConfigs.map((config) => ({ value: config.id, label: config.name })),
		];
		return {
			id: profile.id,
			index,
			badge: t.profile(index + 1),
			name: profile.name,
			enabled: profile.enabled,
			kind: profile.kind,
			configId: profile.configId,
			engineOptions,
			noEngineConfigsNotice: aiConfigs.length ? undefined : t.noEngineConfigs,
			disabled: saving,
			canMoveUp: index > 0,
			canMoveDown: index < draft.profiles.length - 1,
			canRemove: draft.profiles.length > 1,
			onToggle: (enabled) => actions.patchProfile(profile.id, { enabled }),
			onNameChange: (name) => actions.patchProfile(profile.id, { name }),
			onKindChange: (kind) => {
				if (kind === "engine" || kind === "youdao") {
					actions.patchProfile(profile.id, { kind });
				}
			},
			onConfigChange: (configId) => actions.patchProfile(profile.id, { configId }),
			onMoveUp: () => actions.moveProfile(profile.id, -1),
			onMoveDown: () => actions.moveProfile(profile.id, 1),
			onRemove: () => actions.removeProfile(profile.id),
		};
	});

	return [
		{
			type: "group",
			heading: t.generalHeading,
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
			],
		},
		{
			type: "group",
			heading: t.profilesHeading,
			items: [
				row(
					t.profiles,
					[button(t.addProfile, actions.addProfile, saving, "primary")],
					t.profilesDesc,
				),
				row(
					"",
					[
						{
							type: "profileCards",
							items: profileCardItems,
							emptyText: t.profilesDesc,
							labels: {
								namePlaceholder: t.profileNamePlaceholder,
								provider: t.provider,
								engine: t.engine,
								youdao: t.youdao,
								engineConfig: t.engineConfig,
								moveUp: t.moveUp,
								moveDown: t.moveDown,
								remove: t.remove,
								enabledDesc: t.profileEnabled,
							},
						},
					],
					undefined,
					"fc-profile-cards-setting",
				),
			],
		},
		{
			type: "group",
			heading: t.promptHeading,
			items: [
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
			],
		},
		{
			type: "group",
			heading: t.youdaoHeading,
			items: [
				row(
					t.youdaoEndpoint,
					[
						{
							type: "text",
							value: draft.youdao.baseUrl,
							placeholder: t.youdaoEndpointPlaceholder,
							disabled: saving,
							onChange: (baseUrl) =>
								actions.patch({ youdao: { ...draft.youdao, baseUrl } }),
						},
					],
					t.youdaoEndpointDesc,
				),
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
			],
		},
		{
			type: "group",
			heading: t.saveHeading,
			items: [row(t.save, [button(t.save, actions.save, saving, "primary")], t.saveDesc)],
		},
	];
}
