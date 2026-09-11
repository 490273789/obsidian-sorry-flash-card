import type { WorkbenchHost, WorkbenchModule, WorkbenchSettingsSection } from "../host/workbench";
import { SelectionHelper } from "./domain/selectionHelper";
import type {
	SelectionDictionaryAdapter,
	SelectionHelperSettings,
	SelectionTranslationAdapter,
} from "./domain/types";
import { SelectionListener } from "./obsidian/selectionListener";
import { buildSelectionHelperSettingsViewModel } from "./settings/viewModel";
import { selectionHelperStrings } from "./strings/selectionPopup";

export const SELECTION_HELPER_SECTION_ID = "selectionPopup";

export interface SelectionHelperModuleDeps {
	dictionary: SelectionDictionaryAdapter;
	translation: SelectionTranslationAdapter;
}

/** The 工作台-owned 选区助手 module and its settings section. */
export function createSelectionHelperModule(deps: SelectionHelperModuleDeps): WorkbenchModule {
	let helper: SelectionHelper | null = null;
	let listener: SelectionListener | null = null;

	const section = (host: WorkbenchHost): WorkbenchSettingsSection => ({
		id: SELECTION_HELPER_SECTION_ID,
		order: 4,
		label: (language) => selectionHelperStrings(language).settingsHeading,
		definitions: (language) => {
			const sources = deps.dictionary.sources();
			return [
				buildSelectionHelperSettingsViewModel(
					host.settings().selectionPopup,
					sources.map(({ id, label }) => ({ id, label })),
					{
						setEnabled: async (enabled) => {
							await commitSelectionSettings(host, { enabled });
							host.settingsTab.refresh();
						},
						setModifier: async (modifier) => {
							await commitSelectionSettings(host, { modifier });
							host.settingsTab.refresh();
						},
						toggleDictionary: async (id, enabled) => {
							const current = host.settings().selectionPopup.selectedDictionaries;
							const base =
								current.length > 0 ? current : sources.map((source) => source.id);
							const selectedDictionaries = enabled
								? Array.from(new Set([...base, id]))
								: base.filter((item) => item !== id);
							await commitSelectionSettings(host, { selectedDictionaries });
							host.settingsTab.refresh();
						},
					},
					language,
				),
			];
		},
	});

	return {
		id: "selectionHelper",

		render: (host) => {
			if (!helper) {
				helper = new SelectionHelper({
					settings: () => host.settings().selectionPopup,
					dictionary: deps.dictionary,
					translation: deps.translation,
				});
				listener = new SelectionListener({
					helper,
					getLanguage: () => host.settings().language,
				});
				listener.start();
			}
			helper.refresh();
			host.settingsSection(section(host));
		},

		stop: () => {
			listener?.stop();
			listener = null;
			helper?.dispose();
			helper = null;
		},
	};
}

async function commitSelectionSettings(
	host: WorkbenchHost,
	patch: Partial<SelectionHelperSettings>,
): Promise<void> {
	await host.updateSettings({
		selectionPopup: { ...host.settings().selectionPopup, ...patch },
	});
}
