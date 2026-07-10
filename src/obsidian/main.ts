import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import "../styles/index.css";
import { FlashcardSettings, DEFAULT_SETTINGS } from "../shared/types";
import { DataStore } from "../storage/dataStore";
import { FlashcardView, VIEW_TYPE_FLASHCARD } from "./FlashcardView";
import { FlashcardSettingTab } from "./settingsTab";
import { createTranslator } from "../i18n";
import {
	createCardIdentityContinuity,
	type CardIdentityContinuity,
	type ResolutionOutcome,
} from "../identity/cardIdentityContinuity";
import { createCardIdentity } from "../identity/cardIdentity";
import { createActiveSessionStore, type ActiveSessionStore } from "../sessions/activeSessionStore";
import { createObsidianContinuitySourceStore } from "./cardIdentityContinuityAdapters";
import {
	CardIdentityMigrationModal,
	CardIdentityRepairModal,
} from "./cardIdentityContinuityModals";

const OPEN_COMMAND_ID = "open-flashcard-view";
const SYNC_COMMAND_ID = "sync-flashcard-decks";
const MIGRATE_IDENTITIES_COMMAND_ID = "migrate-card-identities";
const REPAIR_IDENTITIES_COMMAND_ID = "repair-card-identities";

export default class FlashcardPlugin extends Plugin {
	settings: FlashcardSettings = DEFAULT_SETTINGS;
	dataStore!: DataStore;
	cardIdentityContinuity!: CardIdentityContinuity;
	activeSessionStore!: ActiveSessionStore;
	private ribbonIconEl: HTMLElement | null = null;

	async onload() {
		this.dataStore = new DataStore(this);
		// loadSettings() performs a single disk read: settings + decks + history.
		// load() is a no-op when called right after (data already in memory).
		this.settings = await this.dataStore.loadSettings();
		this.t = createTranslator(this.settings.language);
		await this.dataStore.load();
		this.activeSessionStore = createActiveSessionStore({
			onSourceChangeEnd: async (ending) => {
				if (ending.answerEventCount === 0) return;
				await this.dataStore.recordStudySession(
					ending.originDeck.id,
					ending.originDeck.name,
					ending.type,
					ending.answerEventCount,
					ending.duration,
				);
			},
		});
		this.cardIdentityContinuity = createCardIdentityContinuity({
			sources: createObsidianContinuitySourceStore(this.app.vault),
			state: this.dataStore.createContinuityStateStore(),
			sessions: this.activeSessionStore,
			createIdentity: createCardIdentity,
		});

		// Register view
		this.registerView(
			VIEW_TYPE_FLASHCARD,
			(leaf) =>
				new FlashcardView(
					leaf,
					this.dataStore,
					this.cardIdentityContinuity,
					this.activeSessionStore,
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
		this.removeCommand(MIGRATE_IDENTITIES_COMMAND_ID);
		this.removeCommand(REPAIR_IDENTITIES_COMMAND_ID);

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
				await this.runIdentitySynchronization();
			},
		});

		this.addCommand({
			id: MIGRATE_IDENTITIES_COMMAND_ID,
			name: this.t("main.commandMigrateCardIdentities"),
			callback: () => {
				void this.openIdentityMigration();
			},
		});

		this.addCommand({
			id: REPAIR_IDENTITIES_COMMAND_ID,
			name: this.t("main.commandRepairCardIdentities"),
			callback: () => {
				void this.openIdentityRepair();
			},
		});
	}

	private async runIdentitySynchronization(): Promise<void> {
		const outcome = await this.cardIdentityContinuity.synchronize();
		if (outcome.kind === "failed") {
			new Notice(this.t("identity.syncFailed", { message: outcome.message }));
			return;
		}
		new Notice(
			this.t(
				outcome.kind === "attention-required"
					? "identity.syncAttention"
					: "identity.syncCurrent",
			),
		);
		await this.refreshFlashcardViews();
	}

	private async openIdentityMigration(): Promise<void> {
		const outcome = await this.cardIdentityContinuity.synchronize();
		if (outcome.kind === "failed") {
			new Notice(this.t("identity.syncFailed", { message: outcome.message }));
			return;
		}
		const preview = this.cardIdentityContinuity.inspect().migration;
		if (!preview) {
			new Notice(this.t("identity.noMigration"));
			return;
		}
		new CardIdentityMigrationModal(this.app, preview, this.t, (deckIds) => {
			void this.applyIdentityResolution(
				this.cardIdentityContinuity.resolve({
					kind: "migrate",
					ticket: preview.ticket,
					deckIds,
				}),
				"migration",
			);
		}).open();
	}

	private async openIdentityRepair(): Promise<void> {
		const outcome = await this.cardIdentityContinuity.synchronize();
		if (outcome.kind === "failed") {
			new Notice(this.t("identity.syncFailed", { message: outcome.message }));
			return;
		}
		const issue = this.cardIdentityContinuity.inspect().issues[0];
		if (!issue) {
			new Notice(this.t("identity.noRepair"));
			return;
		}
		new CardIdentityRepairModal(
			this.app,
			issue,
			this.t,
			(successors) => {
				void this.applyIdentityResolution(
					this.cardIdentityContinuity.resolve({
						kind: "repair",
						ticket: issue.ticket,
						issueId: issue.id,
						successors,
					}),
					"repair",
				);
			},
			() => new Notice(this.t("identity.duplicateAssignment")),
		).open();
	}

	private async applyIdentityResolution(
		resolution: Promise<ResolutionOutcome>,
		type: "migration" | "repair",
	): Promise<void> {
		const outcome = await resolution;
		if (outcome.kind === "applied") {
			new Notice(
				this.t(
					type === "migration" ? "identity.migrationApplied" : "identity.repairApplied",
				),
			);
			await this.refreshFlashcardViews();
			return;
		}
		if (outcome.kind === "resumable") {
			new Notice(this.t("identity.operationResumable"));
			return;
		}
		if (outcome.kind === "failed") {
			new Notice(this.t("identity.operationFailed", { message: outcome.message }));
			return;
		}
		new Notice(
			this.t(
				outcome.reason === "active-session"
					? "identity.migrationBlocked"
					: "identity.previewExpired",
			),
		);
	}

	private async refreshFlashcardViews(): Promise<void> {
		await Promise.all(
			this.app.workspace.getLeavesOfType(VIEW_TYPE_FLASHCARD).map((leaf) => {
				const view = leaf.view as FlashcardView;
				return view.refresh();
			}),
		);
	}

	private updateLocalizedControls(): void {
		if (this.ribbonIconEl) {
			this.ribbonIconEl.setAttr("aria-label", this.t("main.ribbonOpenFlashcards"));
			this.ribbonIconEl.setAttr("title", this.t("main.ribbonOpenFlashcards"));
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
		this.app.workspace.getLeavesOfType(VIEW_TYPE_FLASHCARD).forEach((leaf) => {
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
