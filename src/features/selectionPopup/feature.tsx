import type { Plugin } from "obsidian";
import type { DictionaryController } from "../dictionary/domain/controller";
import type {
	WorkbenchFeature,
	WorkbenchHost,
	WorkbenchSettingsSection,
} from "../../core/host/workbench";
import { SelectionListener } from "./obsidian/selectionListener";
import { selectionPopupStrings } from "./strings/selectionPopup";
import { buildSelectionPopupSettingsViewModel } from "./settings/viewModel";

export const SELECTION_POPUP_SECTION_ID = "selectionPopup";

export interface SelectionPopupFeatureDeps {
	plugin: Plugin;
	getDictionaryController: () => DictionaryController | null;
	openDictionaryInMainTab: (word: string) => Promise<void>;
	translateInMainTab: (text: string) => Promise<void>;
}

export function createSelectionPopupFeature(deps: SelectionPopupFeatureDeps): WorkbenchFeature {
	let listener: SelectionListener | null = null;

	const section = (host: WorkbenchHost): WorkbenchSettingsSection => ({
		id: SELECTION_POPUP_SECTION_ID,
		order: 4,
		label: (language) => selectionPopupStrings(language).settingsHeading,
		definitions: (language) => {
			const dictionarySettings = host.settings().dictionary;
			const availableDictionaries = dictionarySettings.sources
				.filter((s) => s.enabled)
				.map((s) => ({ id: s.id, label: s.label }));

			return [
				buildSelectionPopupSettingsViewModel(
					host.settings().selectionPopup,
					availableDictionaries,
					{
						setEnabled: async (enabled) => {
							await host.updateSettings({
								selectionPopup: {
									...host.settings().selectionPopup,
									enabled,
								},
							});
							host.settingsTab.refresh();
						},
						setModifier: async (modifier) => {
							await host.updateSettings({
								selectionPopup: {
									...host.settings().selectionPopup,
									modifier,
								},
							});
							host.settingsTab.refresh();
						},
						toggleDictionary: async (id, enabled) => {
							const current = host.settings().selectionPopup.selectedDictionaries;
							const base =
								current.length > 0
									? current
									: availableDictionaries.map((d) => d.id);
							const next = enabled
								? Array.from(new Set([...base, id]))
								: base.filter((item) => item !== id);
							await host.updateSettings({
								selectionPopup: {
									...host.settings().selectionPopup,
									selectedDictionaries: next,
								},
							});
							host.settingsTab.refresh();
						},
					},
					language,
				),
			];
		},
	});

	return {
		id: "selectionPopup",

		render: (host) => {
			if (!listener) {
				listener = new SelectionListener({
					plugin: deps.plugin,
					getSettings: () => host.settings().selectionPopup,
					getLanguage: () => host.settings().language,
					getDictionaryController: () => deps.getDictionaryController(),
					isDictionaryAvailable: () => host.settings().dictionary.enabled,
					isTranslationAvailable: () => host.settings().translation.enabled,
					onLookupStart: (word) => {
						const controller = deps.getDictionaryController();
						if (!controller) return;
						controller.prefill(word);
						void controller.lookup();
					},
					onTranslate: (text) => {
						void deps.translateInMainTab(text);
					},
					onOpenDictionaryInMainTab: (word) => {
						void deps.openDictionaryInMainTab(word);
					},
				});
				listener.start();
			}

			host.settingsSection(section(host));
		},

		stop: () => {
			listener?.stop();
			listener = null;
		},
	};
}
