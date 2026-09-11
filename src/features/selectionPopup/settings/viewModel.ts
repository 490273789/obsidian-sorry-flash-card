import type {
	SettingsViewModelDefinition,
	SettingsViewModelSetting,
} from "../../../core/settings/viewModel";
import type { Language } from "../../../core/shared/types";
import type { SelectionPopupModifier, SelectionPopupSettings } from "../domain/types";
import { selectionPopupStrings } from "../strings/selectionPopup";

export interface AvailableDictionaryItem {
	id: string;
	label: string;
}

export interface SelectionPopupSettingsActions {
	setEnabled: (enabled: boolean) => Promise<void>;
	setModifier: (modifier: SelectionPopupModifier) => Promise<void>;
	toggleDictionary: (id: string, enabled: boolean) => Promise<void>;
}

export function buildSelectionPopupSettingsViewModel(
	settings: SelectionPopupSettings,
	availableDictionaries: readonly AvailableDictionaryItem[],
	actions: SelectionPopupSettingsActions,
	language: Language,
): SettingsViewModelDefinition {
	const strings = selectionPopupStrings(language);

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
					onChange: (value) => actions.setModifier(value as SelectionPopupModifier),
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
