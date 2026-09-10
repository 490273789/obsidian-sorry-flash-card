import { aiStrings } from "../i18n/ai";
import type { Language } from "../shared/types";
import type { AiEngineConfig, AiModel, AiProvider, AiSnapshot } from "../ai";
import type {
	SettingsViewModelDefinition,
	SettingsViewModelSetting,
	SettingsViewModelControl,
	SettingsActionResult,
} from "./settingsViewModel";

export interface AiEditorState {
	snapshot: AiSnapshot;
	draft: AiEngineConfig;
	models: readonly AiModel[];
	saving: boolean;
}
export interface AiEditorActions {
	select: (id: string) => SettingsActionResult;
	add: () => SettingsActionResult;
	selectModel: (model: string) => SettingsActionResult;
	patch: (patch: Partial<AiEngineConfig>) => SettingsActionResult;
	provider: (provider: AiProvider) => SettingsActionResult;
	setDefault: (id: string) => SettingsActionResult;
	save: () => SettingsActionResult;
	remove: () => SettingsActionResult;
	loadModels: () => SettingsActionResult;
	test: () => SettingsActionResult;
}

export function buildAiSettingsViewModel(
	state: AiEditorState,
	actions: AiEditorActions,
	language: Language,
): SettingsViewModelDefinition {
	const t = aiStrings(language);
	const { draft, snapshot, saving } = state;
	const saved = snapshot.settings.configs.find((config) => config.id === draft.id);
	const loading = snapshot.loadingModels.includes(draft.id);
	const testing = snapshot.testing.includes(draft.id);
	const row = (
		name: string,
		controls: SettingsViewModelControl[],
		desc?: string,
	): SettingsViewModelSetting => ({ type: "setting", name, controls, desc });
	const text = (
		field: "name" | "baseUrl" | "model",
		placeholder: string,
	): SettingsViewModelControl => ({
		type: "text",
		value: draft[field],
		placeholder,
		disabled: saving,
		onChange: (value) => actions.patch({ [field]: value }),
	});
	const button = (
		label: string,
		onClick: () => SettingsActionResult,
		disabled = saving,
	): SettingsViewModelControl => ({ type: "button", label, onClick, disabled });
	return {
		type: "group",
		heading: t.heading,
		items: [
			row(
				t.defaultConfig,
				[
					{
						type: "select",
						value: snapshot.settings.defaultConfigId ?? "",
						disabled: saving,
						options: [
							{ value: "", label: t.none },
							...snapshot.settings.configs.map((config) => ({
								value: config.id,
								label: config.name,
							})),
						],
						onChange: actions.setDefault,
					},
				],
				t.defaultHelp,
			),
			row(
				t.configuration,
				[
					{
						type: "select",
						value: draft.id,
						disabled: saving,
						options: [
							...(!saved ? [{ value: draft.id, label: t.newDraft }] : []),
							...snapshot.settings.configs.map((config) => ({
								value: config.id,
								label: config.name,
							})),
						],
						onChange: actions.select,
					},
					button(t.newConfig, actions.add),
				],
				t.draftHelp,
			),
			row(t.name, [text("name", t.namePlaceholder)]),
			row(t.provider, [
				{
					type: "select",
					value: draft.provider,
					disabled: saving,
					options: (["deepseek", "bailian", "youdao"] as const).map((provider) => ({
						value: provider,
						label: t[provider],
					})),
					onChange: (value) => {
						if (value === "deepseek" || value === "bailian" || value === "youdao")
							return actions.provider(value);
					},
				},
			]),
			row(t.baseUrl, [text("baseUrl", "https://…")], t.baseHelp),
			row(
				t.secret,
				[
					{
						type: "secret",
						value: draft.secretId,
						disabled: saving,
						onChange: (secretId) => actions.patch({ secretId }),
					},
				],
				t.secretHelp,
			),
			row(t.model, [text("model", t.modelPlaceholder)], t.modelHelp),
			row(t.modelList, [
				button(loading ? t.loading : t.loadModels, actions.loadModels, saving || loading),
				...(state.models.length
					? [
							{
								type: "select" as const,
								value: draft.model,
								disabled: saving,
								options: [
									...(!state.models.some((model) => model.id === draft.model)
										? [{ value: draft.model, label: draft.model || t.none }]
										: []),
									...state.models.map((model) => ({
										value: model.id,
										label: `${model.id} (${t[model.imageInput]})`,
									})),
								],
								onChange: actions.selectModel,
							},
						]
					: []),
			]),
			row(t.configuration, [
				button(t.save, actions.save),
				button(t.remove, actions.remove, saving || !saved),
			]),
			row(
				t.test,
				[button(testing ? t.testing : t.test, actions.test, saving || testing || !saved)],
				t.testHelp,
			),
		],
	};
}
