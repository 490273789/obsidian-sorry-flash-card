import { App, PluginSettingTab, Setting } from "obsidian";
import type FlashcardPlugin from "./main";
import { findAllFlashcardTags } from "./parser";

export class FlashcardSettingTab extends PluginSettingTab {
	plugin: FlashcardPlugin;
	private availableTags: string[] = [];

	constructor(app: App, plugin: FlashcardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Load tags asynchronously
		void this.loadTagsAndRender();
	}

	private async loadTagsAndRender(): Promise<void> {
		this.availableTags = await findAllFlashcardTags(this.app.vault);
		this.renderSettings();
	}

	private renderSettings(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Header
		new Setting(containerEl).setName("闪卡设置").setHeading();

		// Flashcard tags section
		new Setting(containerEl)
			.setName("闪卡标签")
			.setDesc("每个标签代表一个题库，插件会扫描所有带有这些标签的文件");

		// Create tags list container
		const tagsListContainer = containerEl.createDiv({
			cls: "flashcard-tags-list-settings",
		});

		const renderTagsList = () => {
			tagsListContainer.empty();

			const tags = this.plugin.settings.flashcardTags;
			tags.forEach((tag: string, index: number) => {
				const tagItem = tagsListContainer.createDiv({
					cls: "flashcard-tag-item-settings",
				});

				const input = tagItem.createEl("input", {
					type: "text",
					value: tag,
					placeholder: "#标签名",
					cls: "flashcard-tag-input",
				});

				input.addEventListener("change", () => {
					this.plugin.settings.flashcardTags[index] = input.value;
					void this.plugin.saveSettings();
				});

				if (tags.length > 1) {
					const removeBtn = tagItem.createEl("button", {
						text: "✕",
						cls: "flashcard-tag-remove-btn",
					});
					removeBtn.addEventListener("click", () => {
						this.plugin.settings.flashcardTags.splice(index, 1);
						void this.plugin.saveSettings().then(() => {
							renderTagsList();
						});
					});
				}
			});

			// Add tag button
			const addBtn = tagsListContainer.createEl("button", {
				text: "+ 添加标签",
				cls: "flashcard-tag-add-btn",
			});
			addBtn.addEventListener("click", () => {
				this.plugin.settings.flashcardTags.push("");
				void this.plugin.saveSettings().then(() => {
					renderTagsList();
				});
			});
		};

		renderTagsList();

		// Show available tags
		if (this.availableTags.length > 0) {
			const configuredTags = this.plugin.settings.flashcardTags;
			const unusedTags = this.availableTags.filter(
				(tag: string) => !configuredTags.includes(tag),
			);

			if (unusedTags.length > 0) {
				const tagSetting = new Setting(containerEl)
					.setName("已发现的标签")
					.setDesc("点击标签可快速添加");

				const tagsContainer = tagSetting.controlEl.createDiv({
					cls: "flashcard-tags-container",
				});
				for (const tag of unusedTags) {
					const tagBtn = tagsContainer.createEl("button", {
						text: tag,
						cls: "flashcard-tag-button",
					});
					tagBtn.addEventListener("click", () => {
						this.plugin.settings.flashcardTags.push(tag);
						void this.plugin.saveSettings().then(() => {
							this.renderSettings();
						});
					});
				}
			}
		}

		// UI settings heading
		new Setting(containerEl).setName("界面设置").setHeading();

		// Show welcome message toggle
		new Setting(containerEl)
			.setName("显示欢迎弹窗")
			.setDesc("每次打开插件时显示欢迎消息（持续3秒）")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showWelcomeMessage)
					.onChange(async (value) => {
						this.plugin.settings.showWelcomeMessage = value;
						await this.plugin.saveSettings();
					}),
			);

		// Welcome message
		new Setting(containerEl)
			.setName("欢迎消息")
			.setDesc("自定义欢迎弹窗显示的文案")
			.addText((text) =>
				text
					.setPlaceholder("输入欢迎消息")
					.setValue(this.plugin.settings.welcomeMessage)
					.onChange(async (value) => {
						this.plugin.settings.welcomeMessage = value;
						await this.plugin.saveSettings();
					}),
			);

		// Practice completion messages - Perfect
		new Setting(containerEl)
			.setName("刷题全对文案")
			.setDesc("刷题全部答对时随机显示的文案，一行一个");

		const perfectMessagesContainer = containerEl.createDiv({
			cls: "flashcard-messages-list-settings",
		});

		const renderPerfectMessages = () => {
			perfectMessagesContainer.empty();

			const messages = this.plugin.settings.practicePerfectMessages;
			messages.forEach((msg: string, index: number) => {
				const msgItem = perfectMessagesContainer.createDiv({
					cls: "flashcard-message-item-settings",
				});

				const input = msgItem.createEl("input", {
					type: "text",
					value: msg,
					placeholder: "输入全对时的文案",
					cls: "flashcard-message-input",
				});

				input.addEventListener("change", () => {
					this.plugin.settings.practicePerfectMessages[index] =
						input.value;
					void this.plugin.saveSettings();
				});

				if (messages.length > 1) {
					const removeBtn = msgItem.createEl("button", {
						text: "✕",
						cls: "flashcard-message-remove-btn",
					});
					removeBtn.addEventListener("click", () => {
						this.plugin.settings.practicePerfectMessages.splice(
							index,
							1,
						);
						void this.plugin.saveSettings().then(() => {
							renderPerfectMessages();
						});
					});
				}
			});

			const addBtn = perfectMessagesContainer.createEl("button", {
				text: "+ 添加文案",
				cls: "flashcard-message-add-btn",
			});
			addBtn.addEventListener("click", () => {
				this.plugin.settings.practicePerfectMessages.push("");
				void this.plugin.saveSettings().then(() => {
					renderPerfectMessages();
				});
			});
		};

		renderPerfectMessages();

		// Practice completion messages - Error
		new Setting(containerEl)
			.setName("刷题有错文案")
			.setDesc("刷题有错题时随机显示的文案，一行一个");

		const errorMessagesContainer = containerEl.createDiv({
			cls: "flashcard-messages-list-settings",
		});

		const renderErrorMessages = () => {
			errorMessagesContainer.empty();

			const messages = this.plugin.settings.practiceErrorMessages;
			messages.forEach((msg: string, index: number) => {
				const msgItem = errorMessagesContainer.createDiv({
					cls: "flashcard-message-item-settings",
				});

				const input = msgItem.createEl("input", {
					type: "text",
					value: msg,
					placeholder: "输入有错题时的文案",
					cls: "flashcard-message-input",
				});

				input.addEventListener("change", () => {
					this.plugin.settings.practiceErrorMessages[index] =
						input.value;
					void this.plugin.saveSettings();
				});

				if (messages.length > 1) {
					const removeBtn = msgItem.createEl("button", {
						text: "✕",
						cls: "flashcard-message-remove-btn",
					});
					removeBtn.addEventListener("click", () => {
						this.plugin.settings.practiceErrorMessages.splice(
							index,
							1,
						);
						void this.plugin.saveSettings().then(() => {
							renderErrorMessages();
						});
					});
				}
			});

			const addBtn = errorMessagesContainer.createEl("button", {
				text: "+ 添加文案",
				cls: "flashcard-message-add-btn",
			});
			addBtn.addEventListener("click", () => {
				this.plugin.settings.practiceErrorMessages.push("");
				void this.plugin.saveSettings().then(() => {
					renderErrorMessages();
				});
			});
		};

		renderErrorMessages();

		// Study settings heading
		new Setting(containerEl).setName("学习设置").setHeading();

		// Daily new cards
		new Setting(containerEl)
			.setName("每日新卡数量")
			.setDesc("每天学习的新卡片最大数量")
			.addSlider((slider) =>
				slider
					.setLimits(1, 100, 1)
					.setValue(this.plugin.settings.dailyNewCards)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.dailyNewCards = value;
						await this.plugin.saveSettings();
					}),
			);

		// Daily review cards
		new Setting(containerEl)
			.setName("每日复习数量")
			.setDesc("每天复习的卡片最大数量")
			.addSlider((slider) =>
				slider
					.setLimits(1, 500, 10)
					.setValue(this.plugin.settings.dailyReviewCards)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.dailyReviewCards = value;
						await this.plugin.saveSettings();
					}),
			);

		// Study order
		new Setting(containerEl)
			.setName("学习顺序")
			.setDesc("选择卡片的出现顺序")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("sequential", "顺序学习")
					.addOption("random", "乱序学习")
					.setValue(this.plugin.settings.studyOrder)
					.onChange(async (value) => {
						this.plugin.settings.studyOrder = value as
							| "sequential"
							| "random";
						await this.plugin.saveSettings();
					}),
			);

		// FSRS settings heading
		new Setting(containerEl).setName("Fsrs 算法参数").setHeading();

		// Request retention
		new Setting(containerEl)
			.setName("目标记忆保持率")
			.setDesc("期望的长期记忆保持率 (0.7-0.99)")
			.addSlider((slider) =>
				slider
					.setLimits(0.7, 0.99, 0.01)
					.setValue(
						this.plugin.settings.fsrsParameters.requestRetention,
					)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.fsrsParameters.requestRetention =
							value;
						await this.plugin.saveSettings();
					}),
			);

		// Maximum interval
		new Setting(containerEl)
			.setName("最大复习间隔 (天)")
			.setDesc("卡片复习间隔的最大天数")
			.addText((text) =>
				text
					.setPlaceholder("365")
					.setValue(
						String(
							this.plugin.settings.fsrsParameters.maximumInterval,
						),
					)
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num >= 30 && num <= 3650) {
							this.plugin.settings.fsrsParameters.maximumInterval =
								num;
							await this.plugin.saveSettings();
						}
					}),
			);

		// Help section heading
		new Setting(containerEl).setName("使用说明").setHeading();

		const helpDiv = containerEl.createDiv({ cls: "flashcard-help" });
		helpDiv.createEl("p", {
			text: "卡片格式说明:",
		});

		const codeBlock = helpDiv.createEl("pre");
		const codeContent =
			"#wordTag\n\n问题写在这个地方\n---div---\n答案写在这个地方\n<->\n\n问题写在这个地方\n---div---\n答案写在这个地方\n<->";
		codeBlock.createEl("code").textContent = codeContent;

		helpDiv.createEl("p", {
			text: "快捷键说明:",
		});

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
	}
}
