import { Plugin, WorkspaceLeaf } from "obsidian";
import { FlashcardSettings, DEFAULT_SETTINGS } from "./types";
import { DataStore } from "./dataStore";
import { FlashcardView, VIEW_TYPE_FLASHCARD } from "./FlashcardView";
import { FlashcardSettingTab } from "./settingsTab";
import { createTranslator } from "./i18n";

const OPEN_COMMAND_ID = "open-flashcard-view";
const SYNC_COMMAND_ID = "sync-flashcard-decks";

export default class FlashcardPlugin extends Plugin {
	settings: FlashcardSettings = DEFAULT_SETTINGS;
	dataStore!: DataStore;
	private ribbonIconEl: HTMLElement | null = null;

	async onload() {
		this.dataStore = new DataStore(this);
		// loadSettings() performs a single disk read: settings + decks + history.
		// load() is a no-op when called right after (data already in memory).
		this.settings = await this.dataStore.loadSettings();
		this.t = createTranslator(this.settings.language);
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

		this.registerLocalizedControls();

		// Add settings tab
		this.addSettingTab(new FlashcardSettingTab(this.app, this));
	}

	onunload() {
		// Plugin cleanup is handled automatically by Obsidian
	}

	private registerLocalizedControls(): void {
		this.ribbonIconEl = this.addRibbonIcon(
			"layers",
			this.t("main.ribbonOpenFlashcards"),
			() => {
				void this.activateView();
			},
		);
		this.registerCommands();
	}

	private registerCommands(): void {
		this.removeCommand(OPEN_COMMAND_ID);
		this.removeCommand(SYNC_COMMAND_ID);

		this.addCommand({
			id: OPEN_COMMAND_ID,
			name: this.t("main.commandOpenFlashcards"),
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: SYNC_COMMAND_ID,
			name: this.t("main.commandSyncDecks"),
			callback: async () => {
				await this.dataStore.syncFromVault();
			},
		});
	}

	private updateLocalizedControls(): void {
		if (this.ribbonIconEl) {
			this.ribbonIconEl.setAttr(
				"aria-label",
				this.t("main.ribbonOpenFlashcards"),
			);
			this.ribbonIconEl.setAttr(
				"title",
				this.t("main.ribbonOpenFlashcards"),
			);
		}
		this.registerCommands();
	}

	t = createTranslator(DEFAULT_SETTINGS.language);

	async saveSettings(newSettings?: FlashcardSettings) {
		if (newSettings) {
			this.settings = newSettings;
		}

		// Save through DataStore to preserve all data (decks + settings)
		if (this.dataStore) {
			await this.dataStore.saveSettings(this.settings);
		}

		this.t = createTranslator(this.settings.language);
		this.updateLocalizedControls();

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
