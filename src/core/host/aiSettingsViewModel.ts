import { aiStrings } from "../i18n/ai";
import type { Language } from "../shared/types";
import type { AiEngineConfig, AiModel, AiProvider, AiSnapshot } from "../ai";
import type {
	SettingsViewModelDefinition,
	SettingsViewModelSetting,
	SettingsViewModelControl,
	SettingsActionResult,
} from "../../features/flashcards/settings/viewModel";

export type AiViewMode = "list" | "form";

export interface AiEditorState {
	snapshot: AiSnapshot;
	draft: AiEngineConfig;
	models: readonly AiModel[];
	saving: boolean;
	view?: AiViewMode;
	draftIsNew?: boolean;
}
export interface AiEditorActions {
	select?: (id: string) => SettingsActionResult;
	add?: () => SettingsActionResult;
	toAdd?: () => SettingsActionResult;
	toEdit?: (id: string) => SettingsActionResult;
	back?: () => SettingsActionResult;
	selectModel: (model: string) => SettingsActionResult;
	patch: (patch: Partial<AiEngineConfig>) => SettingsActionResult;
	provider: (provider: AiProvider) => SettingsActionResult;
	setDefault: (id: string) => SettingsActionResult;
	save: () => SettingsActionResult;
	remove: (id?: string) => SettingsActionResult;
	loadModels: () => SettingsActionResult;
	test: () => SettingsActionResult;
}

export function buildAiSettingsViewModel(
	state: AiEditorState,
	actions: AiEditorActions,
	language: Language,
): SettingsViewModelDefinition {
	const t = aiStrings(language);
	const { draft, snapshot, saving, view = "list", draftIsNew = false } = state;
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
		variant?: "default" | "warning",
	): SettingsViewModelControl => ({ type: "button", label, onClick, disabled, variant });

	if (view === "list") {
		const items: SettingsViewModelSetting[] = [
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
				t.engineList,
				[button(t.addEngine, () => (actions.toAdd ? actions.toAdd() : actions.add?.()))],
				t.engineListDesc,
			),
		];

		if (snapshot.settings.configs.length === 0) {
			items.push(row(t.noConfigs, [], t.noConfigsDesc));
		} else {
			for (const config of snapshot.settings.configs) {
				const isDefault = config.id === snapshot.settings.defaultConfigId;
				const name = isDefault ? `${config.name} ${t.defaultBadge}` : config.name;
				const providerLabel = t[config.provider] ?? config.provider;
				const desc = `${providerLabel} · ${config.model || t.none}`;
				items.push(
					row(
						name,
						[
							button(t.edit, () =>
								actions.toEdit
									? actions.toEdit(config.id)
									: actions.select?.(config.id),
							),
							button(t.delete, () => actions.remove(config.id), saving, "warning"),
						],
						desc,
					),
				);
			}
		}

		return {
			type: "group",
			heading: t.heading,
			items,
		};
	}

	return {
		type: "group",
		heading: `${t.heading} - ${draftIsNew ? t.addEngineHeading : t.editEngineHeading}`,
		items: [
			row(t.back, [button(t.back, () => actions.back?.())], t.backDesc),
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
			row(
				t.test,
				[button(testing ? t.testing : t.test, actions.test, saving || testing)],
				t.testHelp,
			),
			row(t.configuration, [
				button(t.save, actions.save),
				button(t.cancel, () => actions.back?.()),
				...(!draftIsNew
					? [button(t.remove, () => actions.remove(draft.id), saving, "warning" as const)]
					: []),
			]),
		],
	};
}
