import type { SettingsViewModelDefinition } from "../../../core/settings/viewModel";
import type { Language } from "../../../core/shared/types";
import type { SelectionPopupModifier, SelectionPopupSettings } from "../domain/types";
import { selectionPopupStrings } from "../strings/selectionPopup";

export interface SelectionPopupSettingsActions {
	setEnabled: (enabled: boolean) => Promise<void>;
	setModifier: (modifier: SelectionPopupModifier) => Promise<void>;
}

export function buildSelectionPopupSettingsViewModel(
	settings: SelectionPopupSettings,
	actions: SelectionPopupSettingsActions,
	language: Language,
): SettingsViewModelDefinition {
	const strings = selectionPopupStrings(language);

	return {
		type: "group",
		heading: strings.settingsHeading,
		items: [
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
		],
	};
}
