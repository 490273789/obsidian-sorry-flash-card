import { Plugin, WorkspaceLeaf } from "obsidian";
import { FlashcardSettings, DEFAULT_SETTINGS } from "./types";
import { DataStore, StoredData } from "./dataStore";
import { FlashcardView, VIEW_TYPE_FLASHCARD } from "./FlashcardView";
import { FlashcardSettingTab } from "./settingsTab";

export default class FlashcardPlugin extends Plugin {
	settings: FlashcardSettings = DEFAULT_SETTINGS;
	dataStore!: DataStore;

	async onload() {
		await this.loadSettings();

		// Initialize data store
		this.dataStore = new DataStore(this, this.settings);
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

		// Initial sync on load
		await this.dataStore.syncFromVault();
	}

	onunload() {
		// Plugin cleanup is handled automatically by Obsidian
	}

	async loadSettings() {
		const data = (await this.loadData()) as
			| StoredData
			| (Partial<FlashcardSettings> & { flashcardTag?: string })
			| null;

		// Check if data is in new StoredData format
		if (data && "decks" in data && "settings" in data) {
			// New format: load settings from StoredData
			const storedData = data as StoredData;
			if (storedData.settings) {
				this.settings = Object.assign(
					{},
					DEFAULT_SETTINGS,
					storedData.settings,
				);
			}
		} else {
			// Legacy format or old format with settings at root level
			const legacyData = data as
				| (Partial<FlashcardSettings> & { flashcardTag?: string })
				| null;

			// Migrate from old single tag format to new multi-tag format
			if (
				legacyData &&
				"flashcardTag" in legacyData &&
				typeof legacyData.flashcardTag === "string" &&
				!legacyData.flashcardTags
			) {
				legacyData.flashcardTags = [legacyData.flashcardTag];
				delete legacyData.flashcardTag;
			}

			this.settings = Object.assign({}, DEFAULT_SETTINGS, legacyData);
		}
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

		let leaf: WorkspaceLeaf | null = null;
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
