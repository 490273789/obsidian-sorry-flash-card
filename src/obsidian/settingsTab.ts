import {
	App,
	Notice,
	PluginSettingTab,
	SecretComponent,
	Setting,
	type SettingDefinitionItem,
} from "obsidian";
import { createTranslator } from "../i18n";
import type FlashcardPlugin from "./main";
import { findAllFlashcardTags } from "../cards/parser";
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

export class FlashcardSettingTab extends PluginSettingTab {
	plugin: FlashcardPlugin;
	private availableTags: string[] = [];
	private isLoadingTags = false;
	private hasLoadedTags = false;
	private pronunciationCacheUsageBytes: number | null = null;
	private isLoadingPronunciationCacheUsage = false;
	private hasLoadedPronunciationCacheUsage = false;
	private isTestingPronunciation = false;
	private isClearingPronunciationCache = false;

	constructor(app: App, plugin: FlashcardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.containerEl.addClass("flashcard-settings-tab");
	}

	display(): void {
		this.renderSettings();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		this.ensureAvailableTagsLoaded();
		return this.getRenderableDefinitions() as SettingDefinitionItem[];
	}

	private getRenderableDefinitions(): FlashcardSettingItem[] {
		this.ensurePronunciationCacheUsageLoaded();
		return buildSettingsViewModel(
			{
				settings: this.plugin.settings,
				availableTags: this.availableTags,
				isLoadingTags: this.isLoadingTags,
				hasLoadedTags: this.hasLoadedTags,
				language: this.getSelectedLanguage(),
				pronunciationCacheUsageBytes: this.pronunciationCacheUsageBytes,
				isTestingPronunciation: this.isTestingPronunciation,
				isClearingPronunciationCache: this.isClearingPronunciationCache,
			},
			this.createSettingsActions(),
		).map((definition) => this.toRenderableDefinition(definition));
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
			setPronunciationAutoPlay: (value) => {
				this.plugin.settings.pronunciation.spellingAutoPlay = value;
				return this.saveSettings();
			},
			setPronunciationAccent: (value) => {
				this.plugin.settings.pronunciation.accent = value;
				return this.saveSettings();
			},
			setPronunciationRate: (value) => {
				this.plugin.settings.pronunciation.rate = value;
				return this.saveSettings();
			},
			setOnlinePronunciationProvider: (value) => {
				this.plugin.settings.pronunciation.onlineProvider = value;
				return this.saveSettings(true);
			},
			setAzureCloud: (value) => {
				const pronunciation = this.plugin.settings.pronunciation;
				pronunciation.azureCloud = value;
				const chinaRegions = ["chinaeast2", "chinanorth2", "chinanorth3"];
				if (value === "china" && !chinaRegions.includes(pronunciation.azureRegion)) {
					pronunciation.azureRegion = "chinaeast2";
				}
				if (value === "global" && chinaRegions.includes(pronunciation.azureRegion)) {
					pronunciation.azureRegion = "eastus";
				}
				return this.saveSettings(true);
			},
			setAzureRegion: (value) => {
				this.plugin.settings.pronunciation.azureRegion = value.trim().toLowerCase();
				return this.saveSettings();
			},
			setAzureSecretId: (value) => {
				this.plugin.settings.pronunciation.azureSecretId = value;
				return this.saveSettings();
			},
			setOpenAiSecretId: (value) => {
				this.plugin.settings.pronunciation.openaiSecretId = value;
				return this.saveSettings();
			},
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

		// Use tags already cached from the last identity synchronization.
		const cached = this.plugin.dataStore.getAvailableTags();
		if (cached.length > 0) {
			this.availableTags = cached;
			this.hasLoadedTags = true;
			return;
		}

		// Fall back to a fresh vault scan (e.g. settings opened before view)
		this.isLoadingTags = true;
		void findAllFlashcardTags(this.app.vault)
			.then((tags) => {
				this.availableTags = tags;
				this.hasLoadedTags = true;
				this.refreshDefinitions();
			})
			.finally(() => {
				this.isLoadingTags = false;
			});
	}

	private ensurePronunciationCacheUsageLoaded(): void {
		if (this.hasLoadedPronunciationCacheUsage || this.isLoadingPronunciationCacheUsage) {
			return;
		}
		this.isLoadingPronunciationCacheUsage = true;
		void this.plugin.pronunciationRuntime
			.getCacheUsageBytes()
			.then((usage) => {
				this.pronunciationCacheUsageBytes = usage;
			})
			.catch(() => {
				this.pronunciationCacheUsageBytes = 0;
			})
			.finally(() => {
				this.isLoadingPronunciationCacheUsage = false;
				this.hasLoadedPronunciationCacheUsage = true;
				this.refreshDefinitions();
			});
	}

	private async testOnlinePronunciation(): Promise<void> {
		if (this.isTestingPronunciation) return;
		const t = createTranslator(this.getSelectedLanguage());
		this.isTestingPronunciation = true;
		this.refreshDefinitions();
		try {
			const outcome = await this.plugin.pronunciationRuntime.testOnlineProvider("hello");
			if (outcome.status === "success") {
				new Notice(t("settings.pronunciationTestSuccess"));
				return;
			}
			if (outcome.status === "cancelled") return;
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
		} finally {
			this.isTestingPronunciation = false;
			this.refreshDefinitions();
		}
	}

	private async clearPronunciationCache(): Promise<void> {
		if (this.isClearingPronunciationCache) return;
		const t = createTranslator(this.getSelectedLanguage());
		this.isClearingPronunciationCache = true;
		this.refreshDefinitions();
		try {
			await this.plugin.pronunciationRuntime.clearCache();
			this.pronunciationCacheUsageBytes = 0;
			new Notice(t("settings.pronunciationCacheCleared"));
		} catch {
			new Notice(t("settings.pronunciationCacheClearFailed"));
		} finally {
			this.isClearingPronunciationCache = false;
			this.refreshDefinitions();
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
		const tab = this as PluginSettingTab & { update?: () => void };
		if (typeof tab.update === "function") {
			tab.update();
			return;
		}

		this.renderSettings();
	}

	private renderSettings(): void {
		const { containerEl } = this;
		this.ensureAvailableTagsLoaded();
		containerEl.empty();
		containerEl.addClass("flashcard-settings-tab");

		for (const definition of this.getRenderableDefinitions()) {
			if (!this.isVisible(definition.visible)) {
				continue;
			}

			if (this.isGroupDefinition(definition)) {
				if (definition.heading) {
					new Setting(containerEl).setName(definition.heading).setHeading();
				}

				for (const item of definition.items ?? []) {
					this.renderSettingDefinition(containerEl, item);
				}
				continue;
			}

			this.renderSettingDefinition(containerEl, definition);
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
			dropdown.setValue(control.value).onChange((value) => {
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
			toggle.setValue(control.value).onChange((value) => {
				void control.onChange(value);
			}),
		);
	}

	private renderTextControl(setting: Setting, control: SettingsTextControl): void {
		setting.addText((text) =>
			text
				.setPlaceholder(control.placeholder)
				.setValue(control.value)
				.onChange((value) => {
					void control.onChange(value);
				}),
		);
	}

	private renderSecretControl(setting: Setting, control: SettingsSecretControl): void {
		const component = new SecretComponent(this.app, setting.controlEl);
		component.setValue(control.value).onChange((value) => {
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
