/** Shared, renderer-agnostic vocabulary for all workbench settings sections. */
export type SettingsActionResult = void | Promise<void>;

export type SettingsViewModelDefinition = SettingsViewModelGroup;

export interface SettingsViewModelGroup {
	type: "group";
	heading: string;
	items: SettingsViewModelSetting[];
	visible?: SettingsVisibleState;
}

export interface SettingsViewModelSetting {
	type: "setting";
	name: string;
	desc?: string;
	help?: SettingsHelpModel;
	controls?: SettingsViewModelControl[];
	visible?: SettingsVisibleState;
	cls?: string;
}

export type SettingsVisibleState = boolean | (() => boolean);

export type SettingsViewModelControl =
	| SettingsButtonControl
	| SettingsEditableTextListControl
	| SettingsTagButtonsControl
	| SettingsSelectControl
	| SettingsSliderControl
	| SettingsIntegerTextControl
	| SettingsToggleControl
	| SettingsTextareaControl
	| SettingsTextControl
	| SettingsSecretControl
	| SettingsStatusControl
	| SettingsReorderableListControl
	| SettingsProfileCardsControl;

export interface SettingsButtonControl {
	type: "button";
	label: string;
	disabled: boolean;
	onClick: () => SettingsActionResult;
	variant?: "default" | "warning" | "primary";
}

export interface SettingsEditableTextListControl {
	type: "editableTextList";
	variant: "flashcardTags";
	values: string[];
	placeholder: string;
	addLabel: string;
	removeAriaLabel: string;
	onChange: (index: number, value: string) => SettingsActionResult;
	onAdd: () => SettingsActionResult;
	onRemove: (index: number) => SettingsActionResult;
}

export interface SettingsTagButtonsControl {
	type: "tagButtons";
	tags: string[];
	emptyText: string;
	onClick: (tag: string) => SettingsActionResult;
}

export interface SettingsSelectControl {
	type: "select";
	value: string;
	options: SettingsSelectOption[];
	disabled?: boolean;
	onChange: (value: string) => SettingsActionResult;
}

export interface SettingsSelectOption {
	value: string;
	label: string;
}

export interface SettingsSliderControl {
	type: "slider";
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => SettingsActionResult;
}

export interface SettingsIntegerTextControl {
	type: "integerText";
	value: number;
	placeholder: string;
	min: number;
	max: number;
	onChange: (value: number) => SettingsActionResult;
}

export interface SettingsToggleControl {
	type: "toggle";
	value: boolean;
	disabled?: boolean;
	onChange: (value: boolean) => SettingsActionResult;
}

export interface SettingsTextControl {
	type: "text";
	value: string;
	placeholder: string;
	disabled?: boolean;
	onChange: (value: string) => SettingsActionResult;
}

export interface SettingsTextareaControl {
	type: "textarea";
	value: string;
	placeholder: string;
	disabled?: boolean;
	onChange: (value: string) => SettingsActionResult;
}

export interface SettingsSecretControl {
	type: "secret";
	value: string;
	disabled?: boolean;
	onChange: (value: string) => SettingsActionResult;
}

export interface SettingsStatusControl {
	type: "status";
	text: string;
}

export interface SettingsReorderableItem {
	description?: string;
	enabled: boolean;
	id: string;
	kindLabel: string;
	label: string;
	onToggle: (enabled: boolean) => void;
}

export interface SettingsReorderableListControl {
	type: "reorderableList";
	allowDrag: boolean;
	emptyText?: string;
	items: SettingsReorderableItem[];
	onMove: (fromIndex: number, toIndex: number) => void;
	onRemove?: (id: string) => void;
	tooltips: { drag: string; moveDown: string; moveUp: string; remove?: string };
}

export interface SettingsProfileCardItem {
	id: string;
	index: number;
	badge: string;
	name: string;
	enabled: boolean;
	kind: "engine" | "youdao";
	configId: string;
	engineOptions: SettingsSelectOption[];
	noEngineConfigsNotice?: string;
	disabled: boolean;
	canMoveUp: boolean;
	canMoveDown: boolean;
	canRemove: boolean;
	onToggle: (enabled: boolean) => void;
	onNameChange: (name: string) => void;
	onKindChange: (kind: "engine" | "youdao") => void;
	onConfigChange: (configId: string) => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onRemove: () => void;
}

export interface SettingsProfileCardsControl {
	type: "profileCards";
	items: SettingsProfileCardItem[];
	emptyText?: string;
	labels: {
		namePlaceholder: string;
		provider: string;
		engine: string;
		youdao: string;
		engineConfig: string;
		moveUp: string;
		moveDown: string;
		remove: string;
		enabledDesc: string;
	};
}

export interface SettingsHelpModel {
	cardFormatTitle: string;
	cardFormatExample: string;
	shortcutsTitle: string;
	shortcuts: string[];
}
