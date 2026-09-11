import type { AiSnapshot } from "../../../core/ai";
import type { LocalDictionaryListItem } from "../domain/local-administration";
import type { DictionarySettings, DictionarySourceKind, YoudaoAccessMode } from "../domain/types";
import { dictionaryStrings, type DictionaryStrings } from "../strings/dictionary";
import type { Language } from "../../../core/shared/types";
import type {
	SettingsActionResult,
	SettingsViewModelControl,
	SettingsViewModelDefinition,
	SettingsViewModelSetting,
} from "../../flashcards/settings/viewModel";

export interface DictionarySettingsEditorState {
	/** Committed dictionary settings; the editor never owns a second authority. */
	settings: DictionarySettings;
	aiSnapshot: AiSnapshot;
	localDictionaries: readonly LocalDictionaryListItem[];
	/** Per-dictionary compiled-v2 status text from the non-desktop sync probe. */
	compiledStatus: Readonly<Record<string, string>>;
	desktop: boolean;
	importing: boolean;
	saving: boolean;
	testing: boolean;
}

export interface DictionarySettingsEditorActions {
	setEnabled: (enabled: boolean) => SettingsActionResult;
	setFavoritePath: (path: string) => SettingsActionResult;
	setYoudaoAccessMode: (mode: YoudaoAccessMode) => SettingsActionResult;
	setYoudaoDictionary: (dictionary: "ec" | "ee") => SettingsActionResult;
	setYoudaoSecretId: (secret: "appKey" | "appSecret", secretId: string) => SettingsActionResult;
	testYoudao: () => SettingsActionResult;
	moveSource: (fromIndex: number, toIndex: number) => SettingsActionResult;
	toggleSource: (id: string, enabled: boolean) => SettingsActionResult;
	setAiConfigId: (configId: string | null) => SettingsActionResult;
	pickLocalDictionaryFiles: () => SettingsActionResult;
	pickLocalDictionaryFolder: () => SettingsActionResult;
	deleteLocalDictionary: (id: string) => SettingsActionResult;
}

/** Compiled-v2 byte sizes, matching the source tool's KiB/MiB reporting. */
export function formatDictionaryBytes(bytes: number): string {
	if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1_024))} KiB`;
	return `${(bytes / 1_048_576).toFixed(bytes < 10 * 1_048_576 ? 1 : 0)} MiB`;
}

function sourceKindLabel(kind: DictionarySourceKind, t: DictionaryStrings): string {
	if (kind === "local") return t.local;
	if (kind === "ai") return t.ai;
	return t.sourceOnline;
}

/** Compiled status line for one catalog entry, preferring a probe result. */
export function localDictionaryStatusText(
	local: LocalDictionaryListItem,
	compiledStatus: Readonly<Record<string, string>>,
	t: DictionaryStrings,
): string {
	const probed = compiledStatus[local.id];
	if (probed) return probed;
	const compiled = local.compiled;
	if (compiled && !local.requiresReimport) {
		return t.compiledReady(
			compiled.entryCount,
			formatDictionaryBytes(compiled.totalBytes),
			compiled.engineVersion,
		);
	}
	return t.compiledReimportRequired;
}

export function buildDictionarySettingsViewModel(
	state: DictionarySettingsEditorState,
	actions: DictionarySettingsEditorActions,
	language: Language,
): SettingsViewModelDefinition {
	const t = dictionaryStrings(language);
	const { settings } = state;
	const busy = state.saving || state.testing || state.importing;
	const accessModeDescription =
		settings.youdao.accessMode === "free"
			? t.freeModeDescription
			: t.officialCredentialsDescription;
	const aiConfigs = state.aiSnapshot.settings.configs;
	const items: SettingsViewModelSetting[] = [];
	const row = (
		name: string,
		controls?: SettingsViewModelControl[],
		desc?: string,
	): SettingsViewModelSetting => ({ type: "setting", name, controls, desc });
	const actionButton = (
		label: string,
		onClick: () => SettingsActionResult,
		disabled: boolean = busy,
	): SettingsViewModelControl => ({ type: "button", label, disabled, onClick });

	items.push(
		row(
			t.settingName,
			[
				{
					type: "toggle",
					value: settings.enabled,
					disabled: state.saving,
					onChange: actions.setEnabled,
				},
			],
			t.description,
		),
	);

	items.push(
		row(
			t.favoritePath,
			[
				{
					type: "text",
					value: settings.favoritePath,
					placeholder: t.favoritePathPlaceholder,
					disabled: state.saving,
					onChange: actions.setFavoritePath,
				},
			],
			t.favoritePathDescription,
		),
	);

	items.push(
		row(
			t.youdaoAccessMode,
			[
				{
					type: "select",
					value: settings.youdao.accessMode,
					disabled: state.saving,
					options: [
						{ value: "official", label: t.officialMode },
						{ value: "free", label: t.freeMode },
					],
					onChange: (value) =>
						actions.setYoudaoAccessMode(value === "free" ? "free" : "official"),
				},
			],
			accessModeDescription,
		),
	);

	if (settings.youdao.accessMode === "official") {
		items.push(
			row(
				t.officialAppKey,
				[
					{
						type: "secret",
						value: settings.youdao.appKeySecretId,
						disabled: state.saving,
						onChange: (secretId) => actions.setYoudaoSecretId("appKey", secretId),
					},
				],
				t.officialCredentialsDescription,
			),
			row(
				t.officialAppSecret,
				[
					{
						type: "secret",
						value: settings.youdao.appSecretSecretId,
						disabled: state.saving,
						onChange: (secretId) => actions.setYoudaoSecretId("appSecret", secretId),
					},
				],
				t.officialCredentialsDescription,
			),
			row(
				t.youdaoDictionary,
				[
					{
						type: "select",
						value: settings.youdao.dictionaries.includes("ee") ? "ee" : "ec",
						disabled: state.saving,
						options: [
							{ value: "ec", label: t.youdaoEc },
							{ value: "ee", label: t.youdaoEe },
						],
						onChange: (value) =>
							actions.setYoudaoDictionary(value === "ee" ? "ee" : "ec"),
					},
				],
				t.youdaoDictionaryDescription,
			),
		);
	}

	items.push(
		row(
			t.testConnection,
			[actionButton(state.testing ? t.testing : t.testConnection, actions.testYoudao, busy)],
			accessModeDescription,
		),
	);

	items.push(
		row(t.orderHeading, [
			{
				type: "reorderableList",
				allowDrag: true,
				items: settings.sources.map((source) => ({
					id: source.id,
					label: source.label,
					enabled: source.enabled,
					kindLabel: sourceKindLabel(source.kind, t),
					onToggle: (enabled) => actions.toggleSource(source.id, enabled),
				})),
				onMove: actions.moveSource,
				tooltips: {
					drag: t.orderDescription,
					moveUp: t.sourceMoveUp,
					moveDown: t.sourceMoveDown,
					remove: t.localDelete,
				},
			},
		]),
	);

	const aiConfigId = settings.ai.configId ?? "";
	items.push(
		row(
			t.aiEngine,
			[
				{
					type: "select",
					value: aiConfigId,
					disabled: state.saving || aiConfigs.length === 0,
					options: [
						{ value: "", label: t.sourceDisabled },
						...(aiConfigId && !aiConfigs.some((config) => config.id === aiConfigId)
							? [{ value: aiConfigId, label: aiConfigId }]
							: []),
						...aiConfigs.map((config) => ({ value: config.id, label: config.name })),
					],
					onChange: (value) => actions.setAiConfigId(value || null),
				},
			],
			t.aiEngineDescription,
		),
	);

	if (state.desktop) {
		items.push(
			row(
				t.import,
				[actionButton(t.import, actions.pickLocalDictionaryFiles)],
				t.importDescription,
			),
			row(
				t.folderImport,
				[actionButton(t.folderImport, actions.pickLocalDictionaryFolder)],
				t.folderImportDescription,
			),
		);
	} else {
		items.push(
			row(t.import, [{ type: "status", text: t.localUnsupported }], t.importDescription),
		);
	}

	if (state.localDictionaries.length === 0) {
		items.push(row(t.local, [{ type: "status", text: t.localEmpty }]));
	} else {
		for (const local of state.localDictionaries) {
			const description = [
				...local.files.map((file) => file.name),
				localDictionaryStatusText(local, state.compiledStatus, t),
			].join(" · ");
			items.push(
				row(
					local.name,
					state.desktop
						? [
								{
									type: "button",
									label: t.localDelete,
									disabled: busy,
									variant: "warning",
									onClick: () => actions.deleteLocalDictionary(local.id),
								},
							]
						: undefined,
					description,
				),
			);
		}
	}

	return { type: "group", heading: t.settingsHeading, items };
}
