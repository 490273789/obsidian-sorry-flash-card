import { AiSettingsEditor } from "./aiSettingsEditor";
import { App, Notice, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import { createTranslator } from "../i18n";
import type FlashcardPlugin from "./main";
import {
	buildSettingsViewModel,
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
	type SettingsViewModelActions,
	type SettingsViewModelControl,
	type SettingsViewModelDefinition,
	type SettingsViewModelSetting,
} from "../settings/settingsViewModel";
import type { Language, PronunciationSettings } from "../shared/types";

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

export class FlashcardSettingTab extends PluginSettingTab {
	plugin: FlashcardPlugin;
	private availableTags: string[] = [];
	private isLoadingTags = false;
	private hasLoadedTags = false;
	private pronunciationUnsubscribe: (() => void) | null = null;
	private didRetryFailedCacheUsage = false;
	private aiEditor: AiSettingsEditor;
	private activeTab: "flashcards" | "ai" = "flashcards";

	constructor(app: App, plugin: FlashcardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.aiEditor = new AiSettingsEditor(
			plugin.aiService,
			() => this.getSelectedLanguage(),
			() => this.refreshDefinitions(),
		);
		this.containerEl.addClass("flashcard-settings-tab");
	}

	display(): void {
		this.activatePronunciationState();
		this.renderSettings();
	}

	hide(): void {
		this.aiEditor.hide();
		this.pronunciationUnsubscribe?.();
		this.pronunciationUnsubscribe = null;
		this.didRetryFailedCacheUsage = false;
		super.hide();
	}

	private getRenderableDefinitions(): FlashcardSettingItem[] {
		const rawDefinitions =
			this.activeTab === "flashcards"
				? buildSettingsViewModel(
						{
							settings: this.plugin.settings,
							availableTags: this.availableTags,
							isLoadingTags: this.isLoadingTags,
							hasLoadedTags: this.hasLoadedTags,
							language: this.getSelectedLanguage(),
							pronunciation: this.plugin.pronunciationRuntime.getSnapshot(),
						},
						this.createSettingsActions(),
					)
				: [this.aiEditor.definitions()];

		return rawDefinitions.map((definition) => this.toRenderableDefinition(definition));
	}

	private createSettingsActions(): SettingsViewModelActions {
		return {
			refreshTags: (options) => this.refreshAvailableTags(options),
			updateFlashcardTag: (index, value) => {
				this.plugin.settings.flashcardTags[index] = value;
				return this.saveSettings(true);
			},
			addFlashcardTag: () => {
				this.plugin.settings.flashcardTags.push("");
				return this.saveSettings(true);
			},
			removeFlashcardTag: (index) => {
				this.plugin.settings.flashcardTags.splice(index, 1);
				return this.saveSettings(true);
			},
			addDiscoveredTag: (tag) => {
				this.plugin.settings.flashcardTags.push(tag);
				return this.saveSettings(true);
			},
			setLanguage: (language) => {
				this.plugin.settings.language = language;
				return this.saveSettings(true);
			},
			setDailyNewCards: (value) => {
				this.plugin.settings.dailyNewCards = value;
				return this.saveSettings();
			},
			setDailyReviewCards: (value) => {
				this.plugin.settings.dailyReviewCards = value;
				return this.saveSettings();
			},
			setStudyOrder: (value) => {
				this.plugin.settings.studyOrder = value;
				return this.saveSettings();
			},
			setRequestRetention: (value) => {
				this.plugin.settings.fsrsParameters.requestRetention = value;
				return this.saveSettings();
			},
			setMaximumInterval: (value) => {
				this.plugin.settings.fsrsParameters.maximumInterval = value;
				return this.saveSettings();
			},
			setPronunciationAutoPlay: (value) =>
				this.configurePronunciation({ spellingAutoPlay: value }),
			setPronunciationAccent: (value) => this.configurePronunciation({ accent: value }),
			setPronunciationRate: (value) => this.configurePronunciation({ rate: value }),
			setOnlinePronunciationProvider: (value) =>
				this.configurePronunciation({ onlineProvider: value }),
			setAzureCloud: (value) => this.configurePronunciation({ azureCloud: value }),
			setAzureRegion: (value) => this.configurePronunciation({ azureRegion: value }),
			setAzureSecretId: (value) => this.configurePronunciation({ azureSecretId: value }),
			setOpenAiSecretId: (value) => this.configurePronunciation({ openaiSecretId: value }),
			testOnlinePronunciation: () => this.testOnlinePronunciation(),
			clearPronunciationCache: () => this.clearPronunciationCache(),
		};
	}

	private getSelectedLanguage(): Language {
		return this.parseLanguage(this.plugin.settings.language);
	}

	private parseLanguage(value: unknown): Language {
		return value === "en" ? "en" : "zh";
	}

	private ensureAvailableTagsLoaded(): void {
		if (this.hasLoadedTags || this.isLoadingTags) {
			return;
		}

		// Opening settings must stay cheap. A full vault scan is reserved for the
		// explicit refresh action; otherwise large vaults make the first render wait.
		if (!this.plugin.dataStore.hasAvailableTagsSnapshot()) {
			return;
		}

		this.availableTags = this.plugin.dataStore.getAvailableTags();
		this.hasLoadedTags = true;
	}

	private activatePronunciationState(): void {
		this.aiEditor.activate();
		if (!this.pronunciationUnsubscribe) {
			this.pronunciationUnsubscribe = this.plugin.pronunciationRuntime.subscribe(() =>
				this.refreshDefinitions(),
			);
		}
		if (
			!this.didRetryFailedCacheUsage &&
			this.plugin.pronunciationRuntime.getSnapshot().cacheUsage.status === "failed"
		) {
			this.didRetryFailedCacheUsage = true;
			void this.plugin.pronunciationRuntime.refreshCacheUsage();
		}
	}

	private async configurePronunciation(patch: Partial<PronunciationSettings>): Promise<void> {
		const outcome = await this.plugin.pronunciationRuntime.configure(patch);
		if (outcome.status === "applied") return;
		const t = createTranslator(this.getSelectedLanguage());
		new Notice(
			outcome.status === "busy"
				? t("settings.pronunciationBusy")
				: t("settings.pronunciationSaveFailed"),
		);
	}

	private async testOnlinePronunciation(): Promise<void> {
		const t = createTranslator(this.getSelectedLanguage());
		try {
			const outcome = await this.plugin.pronunciationRuntime.testOnlineProvider("hello");
			if (outcome.status === "success") {
				new Notice(t("settings.pronunciationTestSuccess"));
				return;
			}
			if (outcome.status === "cancelled") return;
			if (outcome.status === "busy") {
				new Notice(t("settings.pronunciationBusy"));
				return;
			}
			const key =
				outcome.reason === "offline"
					? "settings.pronunciationTestOffline"
					: outcome.reason === "not-configured"
						? "settings.pronunciationTestNotConfigured"
						: outcome.reason === "unauthorized"
							? "settings.pronunciationTestUnauthorized"
							: outcome.reason === "quota"
								? "settings.pronunciationTestQuota"
								: "settings.pronunciationTestFailed";
			new Notice(t(key));
		} catch {
			new Notice(t("settings.pronunciationTestFailed"));
		}
	}

	private async clearPronunciationCache(): Promise<void> {
		const t = createTranslator(this.getSelectedLanguage());
		try {
			const outcome = await this.plugin.pronunciationRuntime.clearCache();
			new Notice(
				outcome.status === "cleared"
					? t("settings.pronunciationCacheCleared")
					: outcome.status === "busy"
						? t("settings.pronunciationBusy")
						: t("settings.pronunciationCacheClearFailed"),
			);
		} catch {
			new Notice(t("settings.pronunciationCacheClearFailed"));
		}
	}

	private async refreshAvailableTags(options: { cleanConfiguredTags: boolean }): Promise<void> {
		if (this.isLoadingTags) {
			return;
		}

		const t = createTranslator(this.getSelectedLanguage());
		this.isLoadingTags = true;
		this.refreshDefinitions();

		try {
			await this.plugin.cardIdentityContinuity.synchronize();
			this.availableTags = this.plugin.dataStore.getAvailableTags();
			this.hasLoadedTags = true;

			let removedCount = 0;
			if (options.cleanConfiguredTags) {
				removedCount = this.removeMissingConfiguredTags(this.availableTags);
				await this.plugin.saveSettings();
			}

			new Notice(
				options.cleanConfiguredTags
					? t("settings.tagsRefreshedAndCleaned", {
							count: String(removedCount),
						})
					: t("settings.tagsRefreshed"),
			);
		} catch (error) {
			console.error("Failed to refresh flashcard tags:", error);
			new Notice(t("settings.tagsRefreshFailed"));
		} finally {
			this.isLoadingTags = false;
			this.refreshDefinitions();
		}
	}

	private removeMissingConfiguredTags(availableTags: string[]): number {
		const availableTagSet = new Set(availableTags.map((tag) => tag.trim().toLowerCase()));
		const originalTags = this.plugin.settings.flashcardTags;
		const cleanedTags = originalTags.filter((tag) => {
			const normalizedTag = tag.trim();
			return normalizedTag.length === 0 || availableTagSet.has(normalizedTag.toLowerCase());
		});

		this.plugin.settings.flashcardTags = cleanedTags;
		return originalTags.length - cleanedTags.length;
	}

	private async saveSettings(refreshDefinitions = false): Promise<void> {
		await this.plugin.saveSettings();
		if (refreshDefinitions) {
			this.refreshDefinitions();
		}
	}

	private refreshDefinitions(): void {
		this.renderSettings();
	}

	private renderSettings(): void {
		const { containerEl } = this;
		this.ensureAvailableTagsLoaded();
		containerEl.empty();
		containerEl.addClass("flashcard-settings-tab");

		const t = createTranslator(this.getSelectedLanguage());
		const navEl = containerEl.createDiv({ cls: "fc-settings-tab-nav" });
		const tabs: Array<{ id: "flashcards" | "ai"; label: string }> = [
			{ id: "flashcards", label: t("settings.tabFlashcards") },
			{ id: "ai", label: t("settings.tabAi") },
		];

		for (const tab of tabs) {
			const tabBtn = navEl.createEl("button", {
				type: "button",
				text: tab.label,
				cls: `fc-settings-tab-btn ${this.activeTab === tab.id ? "is-active" : ""}`,
			});
			tabBtn.addEventListener("click", () => {
				if (this.activeTab !== tab.id) {
					this.activeTab = tab.id;
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
			case "text":
				this.renderTextControl(setting, control);
				break;
			case "secret":
				this.renderSecretControl(setting, control);
				break;
			case "status":
				this.renderStatusControl(setting, control);
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
