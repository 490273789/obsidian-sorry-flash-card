import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type FlashcardPlugin from "./main";
import type { WorkbenchSettingsSection, WorkbenchSettingsTab } from "./workbench";
import {
	type SettingsButtonControl,
	type SettingsEditableTextListControl,
	type SettingsHelpModel,
	type SettingsIntegerTextControl,
	type SettingsSecretControl,
	type SettingsSelectControl,
	type SettingsSliderControl,
	type SettingsStatusControl,
	type SettingsTagButtonsControl,
	type SettingsTextControl,
	type SettingsToggleControl,
	type SettingsReorderableListControl,
	type SettingsViewModelControl,
	type SettingsViewModelDefinition,
	type SettingsViewModelSetting,
} from "../settings/settingsViewModel";
import type { Language } from "../shared/types";

type VisibleDefinition = { visible?: boolean | (() => boolean) };
type FlashcardSettingDefinition = VisibleDefinition & {
	name: string;
	desc?: string | DocumentFragment;
	render?: (setting: Setting) => void | (() => void);
};
type FlashcardSettingGroup = VisibleDefinition & {
	type: "group";
	heading: string;
	items: FlashcardSettingDefinition[];
};
type FlashcardSettingItem = FlashcardSettingDefinition | FlashcardSettingGroup;

interface ObsidianSettingsManager {
	open(): void;
	openTabById(id: string): void;
}

export class FlashcardSettingTab extends PluginSettingTab implements WorkbenchSettingsTab {
	plugin: FlashcardPlugin;
	private activeSectionId = "";

	constructor(app: App, plugin: FlashcardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.containerEl.addClass("flashcard-settings-tab");
	}

	select(sectionId: string): void {
		this.activeSectionId = sectionId;
	}

	open(sectionId?: string): void {
		if (sectionId) this.select(sectionId);
		const settingsManager = (this.app as typeof this.app & { setting: ObsidianSettingsManager })
			.setting;
		settingsManager.open();
		settingsManager.openTabById(this.plugin.manifest.id);
	}

	refresh(): void {
		this.refreshDefinitions();
	}

	display(): void {
		for (const section of this.sections()) section.activate?.();
		this.renderSettings();
	}

	hide(): void {
		for (const section of this.sections()) section.hide?.();
		super.hide();
	}

	/** The settings tab is a host-owned shell: it renders whatever sections are registered. */
	private sections(): WorkbenchSettingsSection[] {
		return (this.plugin.workbench?.settingsSections() ?? []).sort(
			(a, b) => a.order - b.order,
		);
	}

	private activeSection(): WorkbenchSettingsSection | undefined {
		const sections = this.sections();
		return sections.find((section) => section.id === this.activeSectionId) ?? sections[0];
	}

	private getRenderableDefinitions(): FlashcardSettingItem[] {
		const section = this.activeSection();
		if (!section) return [];
		return section
			.definitions(this.getSelectedLanguage())
			.map((definition) => this.toRenderableDefinition(definition));
	}

	private getSelectedLanguage(): Language {
		return this.plugin.settings.language === "en" ? "en" : "zh";
	}

	private refreshDefinitions(): void {
		this.renderSettings();
	}

	private renderSettings(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("flashcard-settings-tab");

		const language = this.getSelectedLanguage();
		const sections = this.sections();
		const activeSection = this.activeSection();
		const navEl = containerEl.createDiv({ cls: "fc-settings-tab-nav" });

		for (const section of sections) {
			const tabBtn = navEl.createEl("button", {
				type: "button",
				text: section.label(language),
				cls: `fc-settings-tab-btn ${activeSection?.id === section.id ? "is-active" : ""}`,
			});
			tabBtn.addEventListener("click", () => {
				if (this.activeSectionId !== section.id) {
					this.activeSectionId = section.id;
					this.refreshDefinitions();
				}
			});
		}

		const contentEl = containerEl.createDiv({ cls: "fc-settings-tab-content" });

		for (const definition of this.getRenderableDefinitions()) {
			if (!this.isVisible(definition.visible)) {
				continue;
			}

			if (this.isGroupDefinition(definition)) {
				if (definition.heading) {
					new Setting(contentEl).setName(definition.heading).setHeading();
				}

				for (const item of definition.items ?? []) {
					this.renderSettingDefinition(contentEl, item);
				}
				continue;
			}

			this.renderSettingDefinition(contentEl, definition);
		}
	}

	private toRenderableDefinition(definition: SettingsViewModelDefinition): FlashcardSettingGroup {
		return {
			type: "group",
			heading: definition.heading,
			visible: definition.visible,
			items: definition.items.map((item) => this.toRenderableSetting(item)),
		};
	}

	private toRenderableSetting(model: SettingsViewModelSetting): FlashcardSettingDefinition {
		return {
			name: model.name,
			desc: model.help ? this.createHelpDescription(model.help) : model.desc,
			visible: model.visible,
			render:
				model.controls && model.controls.length > 0
					? (setting) => {
							for (const control of model.controls ?? []) {
								this.renderControl(setting, control);
							}
						}
					: undefined,
		};
	}

	private renderControl(setting: Setting, control: SettingsViewModelControl): void {
		switch (control.type) {
			case "button":
				this.renderButtonControl(setting, control);
				break;
			case "editableTextList":
				this.renderEditableTextListControl(setting, control);
				break;
			case "tagButtons":
				this.renderTagButtonsControl(setting, control);
				break;
			case "select":
				this.renderSelectControl(setting, control);
				break;
			case "slider":
				this.renderSliderControl(setting, control);
				break;
			case "integerText":
				this.renderIntegerTextControl(setting, control);
				break;
			case "toggle":
				this.renderToggleControl(setting, control);
				break;
			case "textarea":
				setting.addTextArea((text) => {
					text.setPlaceholder(control.placeholder)
						.setValue(control.value)
						.setDisabled(control.disabled ?? false);
					text.inputEl.rows = 5;
					text.inputEl.addEventListener("change", () => {
						void control.onChange(text.getValue());
					});
				});
				break;
			case "text":
				this.renderTextControl(setting, control);
				break;
			case "secret":
				this.renderSecretControl(setting, control);
				break;
			case "status":
				this.renderStatusControl(setting, control);
				break;
			case "reorderableList":
				this.renderReorderableListControl(setting, control);
				break;
		}
	}

	private renderButtonControl(setting: Setting, control: SettingsButtonControl): void {
		setting.addButton((button) => {
			button
				.setButtonText(control.label)
				.setDisabled(control.disabled)
				.onClick(() => {
					void control.onClick();
				});
			if (control.variant === "warning") {
				button.setWarning();
			}
		});
	}

	private renderEditableTextListControl(
		setting: Setting,
		control: SettingsEditableTextListControl,
	): void {
		this.renderEditableTextList(setting.descEl, {
			values: control.values,
			listClass: "flashcard-tags-list-settings",
			itemClass: "flashcard-tag-item-settings",
			inputClass: "flashcard-tag-input",
			removeButtonClass: "flashcard-tag-remove-btn",
			addButtonClass: "flashcard-tag-add-btn",
			placeholder: control.placeholder,
			addLabel: control.addLabel,
			removeAriaLabel: control.removeAriaLabel,
			onChange: (index, value) => {
				void control.onChange(index, value);
			},
			onAdd: () => {
				void control.onAdd();
			},
			onRemove: (index) => {
				void control.onRemove(index);
			},
		});
	}

	private renderTagButtonsControl(setting: Setting, control: SettingsTagButtonsControl): void {
		if (control.tags.length > 0) {
			const tagsContainer = setting.descEl.createDiv({
				cls: "flashcard-tags-container",
			});
			for (const tag of control.tags) {
				const tagBtn = tagsContainer.createEl("button", {
					text: tag,
					cls: "flashcard-tag-button",
				});
				tagBtn.addEventListener("click", () => {
					void control.onClick(tag);
				});
			}
			return;
		}

		setting.descEl.createDiv({
			text: control.emptyText,
			cls: "flashcard-tags-empty",
		});
	}

	private renderSelectControl(setting: Setting, control: SettingsSelectControl): void {
		setting.addDropdown((dropdown) => {
			for (const option of control.options) {
				dropdown.addOption(option.value, option.label);
			}
			dropdown
				.setValue(control.value)
				.setDisabled(control.disabled ?? false)
				.onChange((value) => {
					void control.onChange(value);
				});
		});
	}

	private renderSliderControl(setting: Setting, control: SettingsSliderControl): void {
		setting.addSlider((slider) =>
			slider
				.setLimits(control.min, control.max, control.step)
				.setValue(control.value)
				.onChange((value) => {
					void control.onChange(value);
				}),
		);
	}

	private renderIntegerTextControl(setting: Setting, control: SettingsIntegerTextControl): void {
		setting.addText((text) =>
			text
				.setPlaceholder(control.placeholder)
				.setValue(String(control.value))
				.onChange((value) => {
					const num = Number.parseInt(value, 10);
					if (!Number.isNaN(num) && num >= control.min && num <= control.max) {
						void control.onChange(num);
					}
				}),
		);
	}

	private renderToggleControl(setting: Setting, control: SettingsToggleControl): void {
		setting.addToggle((toggle) =>
			toggle
				.setValue(control.value)
				.setDisabled(control.disabled ?? false)
				.onChange((value) => {
					void control.onChange(value);
				}),
		);
	}

	private renderTextControl(setting: Setting, control: SettingsTextControl): void {
		setting.addText((text) => {
			text.setPlaceholder(control.placeholder)
				.setValue(control.value)
				.setDisabled(control.disabled ?? false);
			text.inputEl.addEventListener("change", () => {
				void control.onChange(text.getValue());
			});
		});
	}

	private renderSecretControl(setting: Setting, control: SettingsSecretControl): void {
		const component = new SecretComponent(this.app, setting.controlEl);
		component
			.setValue(control.value)
			.setDisabled(control.disabled ?? false)
			.onChange((value) => {
				void control.onChange(value);
			});
	}

	private renderStatusControl(setting: Setting, control: SettingsStatusControl): void {
		setting.controlEl.createSpan({
			text: control.text,
			cls: "flashcard-settings-status",
		});
	}

	/**
	 * Renders an ordered source list with drag & drop plus keyboard-reachable
	 * move up/down buttons, mirroring the source tool's reorderable list.
	 */
	private renderReorderableListControl(
		setting: Setting,
		control: SettingsReorderableListControl,
	): void {
		const container = setting.descEl.createDiv({
			cls: "flashcard-dictionary-source-list",
		});
		if (control.items.length === 0) {
			if (control.emptyText) {
				container.createDiv({
					text: control.emptyText,
					cls: "flashcard-dictionary-source-empty",
				});
			}
			return;
		}

		let draggedId: string | null = null;
		const clearDragOver = (): void => {
			for (const el of container.querySelectorAll(".is-drag-over")) {
				el.removeClass("is-drag-over");
			}
		};

		control.items.forEach((item, index) => {
			const row = new Setting(container);
			row.setClass("flashcard-dictionary-source-row");
			row.setName(item.label);
			if (item.description) row.setDesc(item.description);
			row.nameEl.createSpan({
				text: item.kindLabel,
				cls: "flashcard-dictionary-source-kind",
			});

			if (control.allowDrag) {
				row.addExtraButton((button) => {
					button.setIcon("grip-vertical").setTooltip(control.tooltips.drag);
					button.extraSettingsEl.draggable = true;
					button.extraSettingsEl.addEventListener("dragstart", () => {
						draggedId = item.id;
						row.settingEl.addClass("is-dragging");
					});
					button.extraSettingsEl.addEventListener("dragend", () => {
						draggedId = null;
						row.settingEl.removeClass("is-dragging");
						clearDragOver();
					});
				});
				row.settingEl.addEventListener("dragover", (event) => {
					if (!draggedId || draggedId === item.id) return;
					event.preventDefault();
					row.settingEl.addClass("is-drag-over");
				});
				row.settingEl.addEventListener("dragleave", () => {
					row.settingEl.removeClass("is-drag-over");
				});
				row.settingEl.addEventListener("drop", (event) => {
					event.preventDefault();
					row.settingEl.removeClass("is-drag-over");
					const sourceId = draggedId;
					draggedId = null;
					if (!sourceId || sourceId === item.id) return;
					const fromIndex = control.items.findIndex(
						(candidate) => candidate.id === sourceId,
					);
					if (fromIndex < 0) return;
					control.onMove(fromIndex, index);
				});
			}

			row.addExtraButton((button) => {
				button
					.setIcon("arrow-up")
					.setTooltip(control.tooltips.moveUp)
					.setDisabled(index === 0);
				button.onClick(() => control.onMove(index, index - 1));
			});
			row.addExtraButton((button) => {
				button
					.setIcon("arrow-down")
					.setTooltip(control.tooltips.moveDown)
					.setDisabled(index === control.items.length - 1);
				button.onClick(() => control.onMove(index, index + 1));
			});
			if (control.onRemove) {
				const onRemove = control.onRemove;
				const removeTooltip = control.tooltips.remove;
				row.addExtraButton((button) => {
					button.setIcon("trash-2");
					if (removeTooltip) button.setTooltip(removeTooltip);
					button.onClick(() => onRemove(item.id));
				});
			}
			row.addToggle((toggle) => {
				toggle.setValue(item.enabled).onChange((value) => {
					item.onToggle(value);
				});
			});
		});
	}

	private isGroupDefinition(
		definition: FlashcardSettingItem,
	): definition is FlashcardSettingGroup {
		return "type" in definition && definition.type === "group";
	}

	private renderSettingDefinition(parentEl: HTMLElement, definition: unknown): void {
		if (!this.isImperativeSettingDefinition(definition)) {
			return;
		}

		if (!this.isVisible(definition.visible)) {
			return;
		}

		const setting = new Setting(parentEl);
		setting.setName(definition.name);

		if (definition.desc) {
			setting.setDesc(definition.desc);
		}

		definition.render?.(setting);
	}

	private isImperativeSettingDefinition(
		definition: unknown,
	): definition is FlashcardSettingDefinition {
		return (
			typeof definition === "object" &&
			definition !== null &&
			"name" in definition &&
			typeof definition.name === "string"
		);
	}

	private isVisible(visible: VisibleDefinition["visible"]): boolean {
		if (typeof visible === "function") {
			return visible();
		}

		return visible !== false;
	}

	private renderEditableTextList(
		parentEl: HTMLElement,
		options: {
			values: string[];
			listClass: string;
			itemClass: string;
			inputClass: string;
			removeButtonClass: string;
			addButtonClass: string;
			placeholder: string;
			addLabel: string;
			removeAriaLabel: string;
			onChange: (index: number, value: string) => void;
			onAdd: () => void;
			onRemove: (index: number) => void;
		},
	): void {
		const listContainer = parentEl.createDiv({
			cls: `fc-settings-list ${options.listClass}`,
		});

		options.values.forEach((value, index) => {
			const hasRemoveButton = options.values.length > 1;
			const item = listContainer.createDiv({
				cls: [
					"fc-settings-item",
					options.itemClass,
					hasRemoveButton ? "has-remove" : "",
				].join(" "),
			});

			const input = item.createEl("input", {
				type: "text",
				value,
				placeholder: options.placeholder,
				cls: `fc-settings-input ${options.inputClass}`,
			});

			input.addEventListener("change", () => {
				options.onChange(index, input.value);
			});

			if (hasRemoveButton) {
				const removeBtn = item.createEl("button", {
					type: "button",
					text: "✕",
					cls: `fc-btn-remove ${options.removeButtonClass}`,
				});
				removeBtn.setAttr("aria-label", options.removeAriaLabel);
				removeBtn.addEventListener("click", () => {
					options.onRemove(index);
				});
			}
		});

		const addBtn = listContainer.createEl("button", {
			type: "button",
			text: options.addLabel,
			cls: `fc-btn-add ${options.addButtonClass}`,
		});
		addBtn.addEventListener("click", () => {
			options.onAdd();
		});
	}

	private createHelpDescription(help: SettingsHelpModel): DocumentFragment {
		const fragment = activeDocument.createDocumentFragment();
		const helpDiv = fragment.createDiv({ cls: "flashcard-help" });

		helpDiv.createEl("p", { text: help.cardFormatTitle });

		const codeBlock = helpDiv.createEl("pre");
		codeBlock.createEl("code").textContent = help.cardFormatExample;

		helpDiv.createEl("p", { text: help.shortcutsTitle });

		const shortcutsList = helpDiv.createEl("ul");
		for (const shortcut of help.shortcuts) {
			shortcutsList.createEl("li", { text: shortcut });
		}

		return fragment;
	}
}
