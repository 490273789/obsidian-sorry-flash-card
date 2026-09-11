import { Plugin } from "obsidian";
import { createWorkbench, type Workbench } from "./workbench";
import { createWorkbenchFeatures } from "../../features";
import { createAiEngineSection } from "./aiEngineSection";
import { attachWorkbenchHome } from "./workbenchHome";
import { createObsidianAiService } from "./aiAdapter";
import { normalizeAiSettings } from "../ai/configuration";
import type { AiService, AiSettings } from "../ai";
import "../styles/index.scss";
import { FlashcardSettings } from "../shared/types";
import { DEFAULT_SETTINGS } from "./settingsSlices";
import { DataStore } from "../storage/dataStore";
import { FlashcardSettingTab } from "./settingsTab";
import { createOutboundPort, type OutboundPort } from "../net";

/**
 * The composition root: it owns the settings document, its write queue, and the
 * shared services every feature may use. Feature behavior lives in
 * `src/obsidian/features/`, reached through the workbench seam.
 */
export default class StudyStudioPlugin extends Plugin {
	settings: FlashcardSettings = DEFAULT_SETTINGS;
	dataStore!: DataStore;
	aiService!: AiService;
	net!: OutboundPort;
	workbench!: Workbench;
	private pluginSettingsTab: FlashcardSettingTab | null = null;
	private settingsWriteQueue: Promise<void> = Promise.resolve();

	async onload() {
		this.dataStore = new DataStore(this);
		// loadSettings() performs a single disk read: settings + decks + history.
		// load() is a no-op when called right after (data already in memory).
		this.settings = await this.dataStore.loadSettings();
		this.net = createOutboundPort({ app: this.app, defaultTimeoutMs: 0 });
		this.aiService = createObsidianAiService(
			this.app,
			this.settings.ai,
			this.persistAiSettings,
			this.net,
		);
		await this.dataStore.load();

		this.workbench = createWorkbench({
			app: this.app,
			plugin: this,
			readSettings: () => this.settings,
			commitSettings: this.commitSettings,
			createFeatures: () =>
				createWorkbenchFeatures({
					ai: this.aiService,
					dataStore: this.dataStore,
					net: this.net,
					plugin: this,
				}),
		});
		this.workbench.addSettingsSection(
			createAiEngineSection({
				ai: this.aiService,
				refresh: () => this.workbench.settingsTab.refresh(),
			}),
		);

		this.pluginSettingsTab = new FlashcardSettingTab(this.app, this);
		this.workbench.setSettingsTab(this.pluginSettingsTab);
		this.addSettingTab(this.pluginSettingsTab);

		// The workbench's own entry point: one ribbon and a feature list.
		attachWorkbenchHome({
			plugin: this,
			workbench: this.workbench,
			readSettings: () => this.settings,
		});

		this.workbench.refresh();
	}

	onunload() {
		this.workbench?.dispose();
		this.aiService?.dispose();
	}

	/** Obsidian Sync changed data.json; reload the authoritative document as one transition. */
	async onExternalSettingsChange(): Promise<void> {
		if (!this.dataStore) return;
		await this.settingsWriteQueue;
		try {
			await this.dataStore.reloadExternalSettings();
			const settings = this.dataStore.getSettings();
			this.aiService?.replaceSettings(settings.ai);
			this.publishSettings(settings);
		} catch (error) {
			console.error("Failed to reload externally synchronized StudyStudio settings:", error);
		}
	}

	/**
	 * Commits a feature-owned settings patch. The patch is applied to the settings
	 * committed at write time, so a queued write never resurrects a stale slice.
	 */
	private commitSettings = async (patch: Partial<FlashcardSettings>): Promise<void> => {
		await this.enqueueSettingsWrite(() => ({ ...this.settings, ...patch }));
	};

	private persistAiSettings = async (ai: AiSettings): Promise<void> => {
		await this.commitSettings({ ai: normalizeAiSettings(ai) });
	};

	private enqueueSettingsWrite(
		createNextSettings: () => FlashcardSettings,
	): Promise<FlashcardSettings> {
		const write = this.settingsWriteQueue.then(async () => {
			const nextSettings = createNextSettings();
			await this.dataStore.saveSettings(nextSettings);
			this.publishSettings(nextSettings);
			return nextSettings;
		});
		this.settingsWriteQueue = write.then(
			() => undefined,
			() => undefined,
		);
		return write;
	}

	private publishSettings(settings: FlashcardSettings): void {
		this.settings = settings;
		try {
			this.workbench?.refresh();
		} catch (error) {
			console.error("Failed to refresh the workbench after saving settings:", error);
		}
	}
}
