import type {
	SettingsViewModelDefinition,
	SettingsViewModelSetting,
} from "../../settings/viewModel";
import type { Language } from "../../shared/types";
import type { SelectionHelperModifier, SelectionHelperSettings } from "../domain/types";
import { selectionHelperStrings } from "../strings/selectionPopup";

export interface AvailableDictionaryItem {
	id: string;
	label: string;
}

export interface SelectionHelperSettingsActions {
	setEnabled: (enabled: boolean) => Promise<void>;
	setModifier: (modifier: SelectionHelperModifier) => Promise<void>;
	toggleDictionary: (id: string, enabled: boolean) => Promise<void>;
}

export function buildSelectionHelperSettingsViewModel(
	settings: SelectionHelperSettings,
	availableDictionaries: readonly AvailableDictionaryItem[],
	actions: SelectionHelperSettingsActions,
	language: Language,
): SettingsViewModelDefinition {
	const strings = selectionHelperStrings(language);

	const items: SettingsViewModelSetting[] = [
		{
			type: "setting",
			name: strings.enablePopup,
			desc: strings.enablePopupDesc,
			controls: [
				{
					type: "toggle",
					value: settings.enabled,
					onChange: (value) => actions.setEnabled(value),
				},
			],
		},
		{
			type: "setting",
			name: strings.modifier,
			desc: strings.modifierDesc,
			controls: [
				{
					type: "select",
					value: settings.modifier,
					options: [
						{ value: "none", label: strings.modifierNone },
						{ value: "alt", label: strings.modifierAlt },
						{ value: "shift", label: strings.modifierShift },
						{ value: "ctrl", label: strings.modifierCtrl },
					],
					onChange: (value) => actions.setModifier(value as SelectionHelperModifier),
				},
			],
		},
	];

	if (availableDictionaries.length > 0) {
		items.push({
			type: "setting",
			name: strings.dictSelectionHeading,
			desc: strings.dictSelectionDesc,
		});

		const selectedSet = new Set(
			settings.selectedDictionaries.length > 0
				? settings.selectedDictionaries
				: availableDictionaries.map((d) => d.id),
		);

		for (const dict of availableDictionaries) {
			items.push({
				type: "setting",
				name: dict.label,
				controls: [
					{
						type: "toggle",
						value: selectedSet.has(dict.id),
						onChange: (enabled) => actions.toggleDictionary(dict.id, enabled),
					},
				],
			});
		}
	}

	return {
		type: "group",
		heading: strings.settingsHeading,
		items,
	};
}
