import { Plugin, WorkspaceLeaf } from "obsidian";
import { FlashcardSettings, DEFAULT_SETTINGS } from "./types";
import { DataStore } from "./dataStore";
import { FlashcardView, VIEW_TYPE_FLASHCARD } from "./FlashcardView";
import { FlashcardSettingTab } from "./settingsTab";

export default class FlashcardPlugin extends Plugin {
	settings: FlashcardSettings = DEFAULT_SETTINGS;
	dataStore!: DataStore;

	async onload() {
		this.dataStore = new DataStore(this);
		// loadSettings() performs a single disk read: settings + decks + history.
		// load() is a no-op when called right after (data already in memory).
		this.settings = await this.dataStore.loadSettings();
		await this.dataStore.load();

		// Register view
		this.registerView(
			VIEW_TYPE_FLASHCARD,
			(leaf) =>
				new FlashcardView(
					leaf,
					this.dataStore,
					this.settings,
					this.saveSettings.bind(this),
				),
		);

		// Add ribbon icon
		this.addRibbonIcon("layers", "打开闪卡", () => {
			void this.activateView();
		});

		// Add command to open flashcard view
		this.addCommand({
			id: "open-flashcard-view",
			name: "打开闪卡学习",
			callback: () => {
				void this.activateView();
			},
		});

		// Add command to sync decks
		this.addCommand({
			id: "sync-flashcard-decks",
			name: "同步闪卡题库",
			callback: async () => {
				await this.dataStore.syncFromVault();
			},
		});

		// Add settings tab
		this.addSettingTab(new FlashcardSettingTab(this.app, this));
	}

	onunload() {
		// Plugin cleanup is handled automatically by Obsidian
	}

	async saveSettings(newSettings?: FlashcardSettings) {
		if (newSettings) {
			this.settings = newSettings;
		}

		// Save through DataStore to preserve all data (decks + settings)
		if (this.dataStore) {
			await this.dataStore.saveSettings(this.settings);
		}

		// Update active views
		this.app.workspace
			.getLeavesOfType(VIEW_TYPE_FLASHCARD)
			.forEach((leaf) => {
				const view = leaf.view as FlashcardView;
				if (view && typeof view.updateSettings === "function") {
					view.updateSettings(this.settings);
				}
			});
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_FLASHCARD);

		if (leaves.length > 0) {
			// View already exists, activate it
			leaf = leaves[0]!;
		} else {
			// Create new leaf in the main area
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({
				type: VIEW_TYPE_FLASHCARD,
				active: true,
			});
		}

		// Focus the leaf
		await workspace.revealLeaf(leaf);
	}
}
