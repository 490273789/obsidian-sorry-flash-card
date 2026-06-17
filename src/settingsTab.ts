import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
} from "obsidian";
import type FlashcardPlugin from "./main";
import { findAllFlashcardTags } from "./parser";
import type { Language } from "./types";
import { createTranslator } from "./i18n";

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
const LANGUAGE_OPTIONS: readonly Language[] = ["zh", "en"];

export class FlashcardSettingTab extends PluginSettingTab {
	plugin: FlashcardPlugin;
	private availableTags: string[] = [];
	private isLoadingTags = false;
	private hasLoadedTags = false;

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
		const t = createTranslator(this.getSelectedLanguage());

		const flashcardItems: FlashcardSettingDefinition[] = [
			{
				name: t("settings.flashcardTagsName"),
				desc: t("settings.flashcardTagsDesc"),
				render: (setting: Setting) => {
					setting.addButton((button) => {
						button
							.setButtonText(
								this.isLoadingTags
									? t("settings.refreshingTags")
									: t("settings.refreshAndCleanTags"),
							)
							.setDisabled(this.isLoadingTags)
							.onClick(() => {
								void this.refreshAvailableTags({
									cleanConfiguredTags: true,
								});
							});
					});

					this.renderEditableTextList(setting.descEl, {
						values: this.plugin.settings.flashcardTags,
						listClass: "flashcard-tags-list-settings",
						itemClass: "flashcard-tag-item-settings",
						inputClass: "flashcard-tag-input",
						removeButtonClass: "flashcard-tag-remove-btn",
						addButtonClass: "flashcard-tag-add-btn",
						placeholder: t("settings.flashcardTagPlaceholder"),
						addLabel: t("settings.addTag"),
						removeAriaLabel: t("settings.delete"),
						onChange: (index, value) => {
							this.plugin.settings.flashcardTags[index] = value;
							void this.saveSettings(true);
						},
						onAdd: () => {
							this.plugin.settings.flashcardTags.push("");
							void this.saveSettings(true);
						},
						onRemove: (index) => {
							this.plugin.settings.flashcardTags.splice(index, 1);
							void this.saveSettings(true);
						},
					});
				},
			},
		];

		const unusedTags = this.getUnusedTags();
		flashcardItems.push({
			name: t("settings.discoveredTagsName"),
			desc: t("settings.discoveredTagsDesc"),
			render: (setting: Setting) => {
				setting.addButton((button) => {
					button
						.setButtonText(
							this.isLoadingTags
								? t("settings.refreshingTags")
								: t("settings.refreshTags"),
						)
						.setDisabled(this.isLoadingTags)
						.onClick(() => {
							void this.refreshAvailableTags({
								cleanConfiguredTags: false,
							});
						});
				});

				if (unusedTags.length > 0) {
					const tagsContainer = setting.descEl.createDiv({
						cls: "flashcard-tags-container",
					});
					for (const tag of unusedTags) {
						const tagBtn = tagsContainer.createEl("button", {
							text: tag,
							cls: "flashcard-tag-button",
						});
						tagBtn.addEventListener("click", () => {
							this.plugin.settings.flashcardTags.push(tag);
							void this.saveSettings(true);
						});
					}
					return;
				}

				setting.descEl.createDiv({
					text: this.hasLoadedTags
						? t("settings.noDiscoveredTags")
						: t("settings.discoveredTagsNotLoaded"),
					cls: "flashcard-tags-empty",
				});
			},
		});

		const definitions: FlashcardSettingItem[] = [
			{
				type: "group",
				heading: t("settings.flashcardGroup"),
				items: flashcardItems,
			},
			{
				type: "group",
				heading: t("settings.interfaceGroup"),
				items: [
					{
						name: t("settings.languageName"),
						desc: t("settings.languageDesc"),
						render: (setting: Setting) => {
							setting.addDropdown((dropdown) => {
								for (const language of LANGUAGE_OPTIONS) {
									dropdown.addOption(
										language,
										language === "zh"
											? t("settings.languageZh")
											: t("settings.languageEn"),
									);
								}
								dropdown
									.setValue(this.getSelectedLanguage())
									.onChange(async (value: string) => {
										this.plugin.settings.language =
											this.parseLanguage(value);
										await this.saveSettings(true);
									});
							});
						},
					},
				],
			},
			{
				type: "group",
				heading: t("settings.defaultStudyGroup"),
				items: [
					{
						name: t("settings.scopeName"),
						desc: t("settings.scopeDesc"),
					},
					{
						name: t("settings.dailyNewName"),
						desc: t("settings.dailyNewDesc"),
						render: (setting: Setting) => {
							setting.addSlider((slider) =>
								slider
									.setLimits(1, 200, 1)
									.setValue(
										this.plugin.settings.dailyNewCards,
									)
									.onChange(async (value) => {
										this.plugin.settings.dailyNewCards =
											value;
										await this.saveSettings();
									}),
							);
						},
					},
					{
						name: t("settings.dailyReviewName"),
						desc: t("settings.dailyReviewDesc"),
						render: (setting: Setting) => {
							setting.addSlider((slider) =>
								slider
									.setLimits(1, 500, 10)
									.setValue(
										this.plugin.settings.dailyReviewCards,
									)
									.onChange(async (value) => {
										this.plugin.settings.dailyReviewCards =
											value;
										await this.saveSettings();
									}),
							);
						},
					},
					{
						name: t("settings.studyOrderName"),
						desc: t("settings.studyOrderDesc"),
						render: (setting: Setting) => {
							setting.addDropdown((dropdown) =>
								dropdown
									.addOption(
										"sequential",
										t("order.sequential"),
									)
									.addOption("random", t("order.random"))
									.setValue(this.plugin.settings.studyOrder)
									.onChange(async (value) => {
										this.plugin.settings.studyOrder =
											value as "sequential" | "random";
										await this.saveSettings();
									}),
							);
						},
					},
				],
			},
			{
				type: "group",
				heading: t("settings.fsrsGroup"),
				items: [
					{
						name: t("settings.retentionName"),
						desc: t("settings.retentionDesc"),
						render: (setting: Setting) => {
							setting.addSlider((slider) =>
								slider
									.setLimits(0.7, 0.99, 0.01)
									.setValue(
										this.plugin.settings.fsrsParameters
											.requestRetention,
									)
									.onChange(async (value) => {
										this.plugin.settings.fsrsParameters.requestRetention =
											value;
										await this.saveSettings();
									}),
							);
						},
					},
					{
						name: t("settings.maxIntervalName"),
						desc: t("settings.maxIntervalDesc"),
						render: (setting: Setting) => {
							setting.addText((text) =>
								text
									.setPlaceholder("365")
									.setValue(
										String(
											this.plugin.settings.fsrsParameters
												.maximumInterval,
										),
									)
									.onChange(async (value) => {
										const num = parseInt(value, 10);
										if (
											!isNaN(num) &&
											num >= 30 &&
											num <= 3650
										) {
											this.plugin.settings.fsrsParameters.maximumInterval =
												num;
											await this.saveSettings();
										}
									}),
							);
						},
					},
				],
			},
			{
				type: "group",
				heading: t("settings.helpGroup"),
				items: [
					{
						name: t("settings.helpName"),
						desc: this.createHelpDescription(),
					},
				],
			},
		];
		return definitions as SettingDefinitionItem[];
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

		// Use tags already cached from the last syncFromVault() call
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

	private getUnusedTags(): string[] {
		const configuredTags = this.plugin.settings.flashcardTags;
		return this.availableTags.filter(
			(tag) => !configuredTags.includes(tag),
		);
	}

	private async refreshAvailableTags(options: {
		cleanConfiguredTags: boolean;
	}): Promise<void> {
		if (this.isLoadingTags) {
			return;
		}

		const t = createTranslator(this.getSelectedLanguage());
		this.isLoadingTags = true;
		this.refreshDefinitions();

		try {
			await this.plugin.dataStore.syncFromVault();
			this.availableTags = this.plugin.dataStore.getAvailableTags();
			this.hasLoadedTags = true;

			let removedCount = 0;
			if (options.cleanConfiguredTags) {
				removedCount = this.removeMissingConfiguredTags(
					this.availableTags,
				);
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
		const availableTagSet = new Set(
			availableTags.map((tag) => tag.trim().toLowerCase()),
		);
		const originalTags = this.plugin.settings.flashcardTags;
		const cleanedTags = originalTags.filter((tag) => {
			const normalizedTag = tag.trim();
			return (
				normalizedTag.length === 0 ||
				availableTagSet.has(normalizedTag.toLowerCase())
			);
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
		containerEl.empty();
		containerEl.addClass("flashcard-settings-tab");

		for (const definition of this.getSettingDefinitions() as FlashcardSettingItem[]) {
			if (!this.isVisible(definition.visible)) {
				continue;
			}

			if (this.isGroupDefinition(definition)) {
				if (definition.heading) {
					new Setting(containerEl)
						.setName(definition.heading)
						.setHeading();
				}

				for (const item of definition.items ?? []) {
					this.renderSettingDefinition(containerEl, item);
				}
				continue;
			}

			this.renderSettingDefinition(containerEl, definition);
		}
	}

	private isGroupDefinition(
		definition: FlashcardSettingItem,
	): definition is FlashcardSettingGroup {
		return "type" in definition && definition.type === "group";
	}

	private renderSettingDefinition(
		parentEl: HTMLElement,
		definition: unknown,
	): void {
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

	private createHelpDescription(): DocumentFragment {
		const t = createTranslator(this.plugin.settings.language);
		const fragment = activeDocument.createDocumentFragment();
		const helpDiv = fragment.createDiv({ cls: "flashcard-help" });

		helpDiv.createEl("p", { text: t("settings.cardFormatTitle") });

		const codeBlock = helpDiv.createEl("pre");
		codeBlock.createEl("code").textContent = t(
			"settings.cardFormatExample",
		);

		helpDiv.createEl("p", { text: t("settings.shortcutsTitle") });

		const shortcutsList = helpDiv.createEl("ul");
		const shortcuts = [
			t("settings.shortcutSpace"),
			t("settings.shortcutAgain"),
			t("settings.shortcutHard"),
			t("settings.shortcutGood"),
			t("settings.shortcutEasy"),
			t("settings.shortcutTrash"),
			t("settings.shortcutPrevious"),
		];

		for (const shortcut of shortcuts) {
			shortcutsList.createEl("li", { text: shortcut });
		}

		return fragment;
	}
}
