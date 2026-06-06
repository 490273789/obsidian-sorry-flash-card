import {
	App,
	PluginSettingTab,
	Setting,
	type SettingDefinitionGroup,
	type SettingDefinitionItem,
	type SettingDefinitionRender,
} from "obsidian";
import type FlashcardPlugin from "./main";
import { findAllFlashcardTags } from "./parser";

type VisibleDefinition = { visible?: boolean | (() => boolean) };
type GroupDefinition = SettingDefinitionGroup;
type RenderableSettingDefinition = SettingDefinitionRender;
type ImperativeSettingDefinition = VisibleDefinition & {
	name: string;
	desc?: string | DocumentFragment;
	render?: (setting: Setting) => void | (() => void);
};

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

		const flashcardItems: RenderableSettingDefinition[] = [
			{
				name: "闪卡标签",
				desc: "每个标签代表一个题库，插件会扫描所有带有这些标签的文件",
				render: (setting: Setting) => {
					this.renderEditableTextList(setting.descEl, {
						values: this.plugin.settings.flashcardTags,
						listClass: "flashcard-tags-list-settings",
						itemClass: "flashcard-tag-item-settings",
						inputClass: "flashcard-tag-input",
						removeButtonClass: "flashcard-tag-remove-btn",
						addButtonClass: "flashcard-tag-add-btn",
						placeholder: "#标签名",
						addLabel: "+ 添加标签",
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
		if (unusedTags.length > 0) {
			flashcardItems.push({
				name: "已发现的标签",
				desc: "点击标签可快速添加",
				render: (setting: Setting) => {
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
				},
			});
		}

		return [
			{
				type: "group",
				heading: "闪卡设置",
				items: flashcardItems,
			},
			{
				type: "group",
				heading: "界面设置",
				items: [
					{
						name: "刷题全对文案",
						desc: "刷题全部答对时随机显示的文案，一行一个",
						render: (setting: Setting) => {
							this.renderEditableTextList(setting.descEl, {
								values: this.plugin.settings
									.practicePerfectMessages,
								listClass: "flashcard-messages-list-settings",
								itemClass: "flashcard-message-item-settings",
								inputClass: "flashcard-message-input",
								removeButtonClass:
									"flashcard-message-remove-btn",
								addButtonClass: "flashcard-message-add-btn",
								placeholder: "输入全对时的文案",
								addLabel: "+ 添加文案",
								onChange: (index, value) => {
									this.plugin.settings.practicePerfectMessages[
										index
									] = value;
									void this.saveSettings();
								},
								onAdd: () => {
									this.plugin.settings.practicePerfectMessages.push(
										"",
									);
									void this.saveSettings(true);
								},
								onRemove: (index) => {
									this.plugin.settings.practicePerfectMessages.splice(
										index,
										1,
									);
									void this.saveSettings(true);
								},
							});
						},
					},
					{
						name: "刷题有错文案",
						desc: "刷题有错题时随机显示的文案，一行一个",
						render: (setting: Setting) => {
							this.renderEditableTextList(setting.descEl, {
								values: this.plugin.settings
									.practiceErrorMessages,
								listClass: "flashcard-messages-list-settings",
								itemClass: "flashcard-message-item-settings",
								inputClass: "flashcard-message-input",
								removeButtonClass:
									"flashcard-message-remove-btn",
								addButtonClass: "flashcard-message-add-btn",
								placeholder: "输入有错题时的文案",
								addLabel: "+ 添加文案",
								onChange: (index, value) => {
									this.plugin.settings.practiceErrorMessages[
										index
									] = value;
									void this.saveSettings();
								},
								onAdd: () => {
									this.plugin.settings.practiceErrorMessages.push(
										"",
									);
									void this.saveSettings(true);
								},
								onRemove: (index) => {
									this.plugin.settings.practiceErrorMessages.splice(
										index,
										1,
									);
									void this.saveSettings(true);
								},
							});
						},
					},
				],
			},
			{
				type: "group",
				heading: "默认学习设置（全局兜底）",
				items: [
					{
						name: "作用范围",
						desc: "以下设置作为所有题库的默认值，每个题库可在主界面单独覆盖。",
					},
					{
						name: "每日新卡数量",
						desc: "每天学习的新卡片最大数量",
						render: (setting: Setting) => {
							setting.addSlider((slider) =>
								slider
									.setLimits(1, 200, 1)
									.setValue(
										this.plugin.settings.dailyNewCards,
									)
									.setDynamicTooltip()
									.onChange(async (value) => {
										this.plugin.settings.dailyNewCards =
											value;
										await this.saveSettings();
									}),
							);
						},
					},
					{
						name: "每日复习数量",
						desc: "每天复习的卡片最大数量",
						render: (setting: Setting) => {
							setting.addSlider((slider) =>
								slider
									.setLimits(1, 500, 10)
									.setValue(
										this.plugin.settings.dailyReviewCards,
									)
									.setDynamicTooltip()
									.onChange(async (value) => {
										this.plugin.settings.dailyReviewCards =
											value;
										await this.saveSettings();
									}),
							);
						},
					},
					{
						name: "学习顺序",
						desc: "选择卡片的出现顺序",
						render: (setting: Setting) => {
							setting.addDropdown((dropdown) =>
								dropdown
									.addOption("sequential", "顺序学习")
									.addOption("random", "乱序学习")
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
				heading: "Fsrs 算法参数",
				items: [
					{
						name: "目标记忆保持率",
						desc: "期望的长期记忆保持率 (0.7-0.99)",
						render: (setting: Setting) => {
							setting.addSlider((slider) =>
								slider
									.setLimits(0.7, 0.99, 0.01)
									.setValue(
										this.plugin.settings.fsrsParameters
											.requestRetention,
									)
									.setDynamicTooltip()
									.onChange(async (value) => {
										this.plugin.settings.fsrsParameters.requestRetention =
											value;
										await this.saveSettings();
									}),
							);
						},
					},
					{
						name: "最大复习间隔 (天)",
						desc: "卡片复习间隔的最大天数",
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
				heading: "使用说明",
				items: [
					{
						name: "卡片格式和快捷键",
						desc: this.createHelpDescription(),
					},
				],
			},
		];
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

		for (const definition of this.getSettingDefinitions()) {
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
		definition: SettingDefinitionItem,
	): definition is GroupDefinition {
		return (
			"type" in definition &&
			(definition.type === "group" || definition.type === "list")
		);
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
	): definition is ImperativeSettingDefinition {
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
				removeBtn.setAttr("aria-label", "删除");
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
		const fragment = activeDocument.createDocumentFragment();
		const helpDiv = fragment.createDiv({ cls: "flashcard-help" });

		helpDiv.createEl("p", { text: "卡片格式说明:" });

		const codeBlock = helpDiv.createEl("pre");
		codeBlock.createEl("code").textContent =
			"#示例标签\n\n问题写在这个地方\n---div---\n答案写在这个地方\n<->\n\n问题写在这个地方\n---div---\n答案写在这个地方\n<->";

		helpDiv.createEl("p", { text: "快捷键说明:" });

		const shortcutsList = helpDiv.createEl("ul");
		const shortcuts = [
			"空格键: 显示答案 / 良好",
			"数字1: 重来",
			"数字2: 困难",
			"数字3: 良好",
			"数字4: 简单",
			"数字5: 辣鸡",
			"数字6: 上一题",
		];

		for (const shortcut of shortcuts) {
			shortcutsList.createEl("li", { text: shortcut });
		}

		return fragment;
	}
}
