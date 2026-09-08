import { Notice, Platform, Plugin, WorkspaceLeaf } from "obsidian";
import "../styles/index.scss";
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
import { createSessionLifecycle, type SessionLifecycle } from "../sessions/sessionLifecycle";
import { createObsidianContinuitySourceStore } from "./cardIdentityContinuityAdapters";
import {
	CardIdentityMigrationModal,
	CardIdentityRepairModal,
} from "./cardIdentityContinuityModals";
import { describeSynchronizationOutcome } from "../identity/synchronizationFeedback";
import { createPronunciationRuntime, type PronunciationRuntime } from "../pronunciation";
import {
	createDeckHome,
	type DeckHome,
	type DeckHomeEvent,
	type DeckHomeSettingsPatch,
} from "../decks/deckHome";
import { exportDeckToPdf } from "../decks/deckPdfExporter";

const OPEN_COMMAND_ID = "open-flashcard-view";
const SYNC_COMMAND_ID = "sync-flashcard-decks";
const MIGRATE_IDENTITIES_COMMAND_ID = "migrate-card-identities";
const REPAIR_IDENTITIES_COMMAND_ID = "repair-card-identities";

interface ObsidianSettingsManager {
	open(): void;
	openTabById(id: string): void;
}

export default class FlashcardPlugin extends Plugin {
	settings: FlashcardSettings = DEFAULT_SETTINGS;
	dataStore!: DataStore;
	cardIdentityContinuity!: CardIdentityContinuity;
	sessionLifecycle!: SessionLifecycle;
	pronunciationRuntime!: PronunciationRuntime;
	deckHome!: DeckHome;
	private ribbonIconEl: HTMLElement | null = null;
	private settingsWriteQueue: Promise<void> = Promise.resolve();
	private deckExportProgressNotice: Notice | null = null;

	async onload() {
		this.dataStore = new DataStore(this);
		// loadSettings() performs a single disk read: settings + decks + history.
		// load() is a no-op when called right after (data already in memory).
		this.settings = await this.dataStore.loadSettings();
		this.t = createTranslator(this.settings.language);
		this.pronunciationRuntime = createPronunciationRuntime(
			this.app,
			this.settings.pronunciation,
			{ persistSettings: this.persistPronunciationSettings },
		);
		await this.dataStore.load();
		const sessionLifecycleWiring = createSessionLifecycle(this.dataStore);
		this.sessionLifecycle = sessionLifecycleWiring.lifecycle;
		this.cardIdentityContinuity = createCardIdentityContinuity({
			sources: createObsidianContinuitySourceStore(this.app),
			state: this.dataStore.createContinuityStateStore(),
			sessions: sessionLifecycleWiring.continuitySessions,
			createIdentity: createCardIdentity,
		});
		this.deckHome = createDeckHome({
			repository: this.dataStore,
			identity: this.cardIdentityContinuity,
			saveSettingsPatch: this.saveDeckSettingsPatch,
			saveDeckOrder: this.saveDeckOrder,
			exportDeck: async (deck, onProgress) => {
				if (!Platform.isDesktopApp) {
					throw new Error(this.t("notice.pdfExportDesktopOnly"));
				}
				return exportDeckToPdf(
					this.app,
					deck,
					{
						frontColumn: this.t("common.cardFront"),
						backColumn: this.t("common.cardBack"),
						cardCount: (count) => this.t("pdf.cardCount", { count }),
						saveDialogTitle: this.t("pdf.saveDialogTitle"),
					},
					{ onProgress },
				);
			},
			report: this.reportDeckHomeEvent,
		});

		// Register view
		this.registerView(
			VIEW_TYPE_FLASHCARD,
			(leaf) =>
				new FlashcardView(
					leaf,
					this.cardIdentityContinuity,
					this.sessionLifecycle,
					this.pronunciationRuntime,
					this.deckHome,
					this.settings,
					this.openSettings,
				),
		);

		this.registerLocalizedControls();

		// Add settings tab
		this.addSettingTab(new FlashcardSettingTab(this.app, this));
	}

	private openSettings = (): void => {
		const settingsManager = (this.app as typeof this.app & { setting: ObsidianSettingsManager })
			.setting;
		settingsManager.open();
		settingsManager.openTabById(this.manifest.id);
	};

	onunload() {
		this.deckHome?.dispose();
		this.deckExportProgressNotice?.hide();
		this.pronunciationRuntime?.dispose();
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
		const outcome = await this.deckHome.act({ kind: "refresh" });
		if (
			outcome.kind === "applied" &&
			this.cardIdentityContinuity.inspect().issues.length === 0
		) {
			new Notice(this.t("identity.syncCurrent"));
		}
	}

	private async openIdentityMigration(): Promise<void> {
		const ownerId = "command:migrate-card-identities";
		const request = await this.deckHome.act({
			kind: "request-migration",
			ownerId,
		});
		if (request.kind === "rejected" && request.reason === "migration-unavailable") {
			new Notice(this.t("identity.noMigration"));
			return;
		}
		if (request.kind !== "confirmation-required") return;
		const preview = this.cardIdentityContinuity.inspect().migration;
		if (!preview) {
			await this.deckHome.act({
				kind: "continue",
				ownerId,
				continuation: request.continuation,
				confirmed: false,
			});
			return;
		}
		new CardIdentityMigrationModal(
			this.app,
			preview,
			this.t,
			() => {
				void this.deckHome.act({
					kind: "continue",
					ownerId,
					continuation: request.continuation,
					confirmed: true,
				});
			},
			() => {
				void this.deckHome.act({
					kind: "continue",
					ownerId,
					continuation: request.continuation,
					confirmed: false,
				});
			},
		).open();
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
			return;
		}
		if (outcome.kind === "resumable") {
			new Notice(this.t("identity.operationResumable"));
			return;
		}
		if (outcome.kind === "failed") {
			new Notice(
				this.t("identity.operationFailed", {
					message: outcome.message,
				}),
			);
			return;
		}
		new Notice(
			this.t(
				outcome.reason === "active-session"
					? "identity.migrationBlocked"
					: outcome.reason === "legacy-source-mismatch"
						? "identity.migrationSourceMismatch"
						: "identity.previewExpired",
			),
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

	async saveSettings(newSettings?: FlashcardSettings): Promise<FlashcardSettings> {
		const requestedSettings = cloneFlashcardSettings(newSettings ?? this.settings);
		return this.enqueueSettingsWrite(() => ({
			...requestedSettings,
			deckStudySettings: cloneDeckStudySettings(this.settings.deckStudySettings),
			wordLearningDecks: { ...this.settings.wordLearningDecks },
			deckOrder: [...this.settings.deckOrder],
			pronunciation: { ...this.settings.pronunciation },
		}));
	}

	private persistPronunciationSettings = async (
		pronunciation: FlashcardSettings["pronunciation"],
	): Promise<void> => {
		await this.enqueueSettingsWrite(() => ({
			...this.settings,
			pronunciation: { ...pronunciation },
		}));
	};

	private saveDeckSettingsPatch = async (patch: DeckHomeSettingsPatch): Promise<void> => {
		await this.enqueueSettingsWrite(() => {
			const deckStudySettings = { ...this.settings.deckStudySettings };
			if (patch.overrides === null) {
				delete deckStudySettings[patch.deckId];
			} else {
				deckStudySettings[patch.deckId] = patch.overrides;
			}
			const wordLearningDecks = { ...this.settings.wordLearningDecks };
			if (patch.wordLearningEnabled) {
				wordLearningDecks[patch.deckId] = true;
			} else {
				delete wordLearningDecks[patch.deckId];
			}
			return {
				...this.settings,
				deckStudySettings,
				wordLearningDecks,
			};
		});
	};

	private saveDeckOrder = async (deckOrder: readonly string[]): Promise<void> => {
		await this.enqueueSettingsWrite(() => ({
			...this.settings,
			deckOrder: [...deckOrder],
		}));
	};

	private reportDeckHomeEvent = (event: DeckHomeEvent): void => {
		if (event.kind === "refresh-completed") {
			const message = describeSynchronizationOutcome(
				event.outcome,
				this.cardIdentityContinuity.inspect(),
				this.settings.language,
			);
			if (message) new Notice(message, 12000);
			return;
		}
		if (event.kind === "migration-completed") {
			this.showIdentityResolutionOutcome(event.outcome);
			return;
		}
		if (event.kind === "settings-save-failed") {
			new Notice(
				this.t("notice.deckSettingsSaveFailed", {
					message: event.message,
				}),
			);
			return;
		}
		if (event.kind === "export-progress") {
			const message =
				event.progress.phase === "rendering"
					? this.t("notice.pdfExportRendering", {
							completed: event.progress.completed,
							total: event.progress.total,
						})
					: this.t("notice.pdfExportGenerating");
			if (this.deckExportProgressNotice) {
				this.deckExportProgressNotice.setMessage(message);
			} else {
				this.deckExportProgressNotice = new Notice(message, 0);
			}
			return;
		}
		this.deckExportProgressNotice?.hide();
		this.deckExportProgressNotice = null;
		if (event.kind === "export-completed") {
			if (event.result.kind === "saved") {
				new Notice(
					this.t("notice.pdfExportSaved", {
						filePath: event.result.filePath,
					}),
					8000,
				);
			}
			return;
		}
		new Notice(this.t("notice.pdfExportFailed", { message: event.message }));
	};

	private showIdentityResolutionOutcome(outcome: ResolutionOutcome): void {
		if (outcome.kind === "applied") {
			new Notice(this.t("identity.migrationApplied"));
			return;
		}
		if (outcome.kind === "resumable") {
			new Notice(this.t("identity.operationResumable"));
			return;
		}
		if (outcome.kind === "failed") {
			new Notice(
				this.t("identity.operationFailed", {
					message: outcome.message,
				}),
			);
			return;
		}
		new Notice(
			this.t(
				outcome.reason === "active-session"
					? "identity.migrationBlocked"
					: outcome.reason === "legacy-source-mismatch"
						? "identity.migrationSourceMismatch"
						: "identity.previewExpired",
			),
		);
	}

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
		this.t = createTranslator(settings.language);
		try {
			this.updateLocalizedControls();
		} catch (error) {
			console.error("Failed to refresh localized plugin controls:", error);
		}

		this.app.workspace.getLeavesOfType(VIEW_TYPE_FLASHCARD).forEach((leaf) => {
			const view = leaf.view as FlashcardView;
			if (view && typeof view.updateSettings === "function") {
				try {
					view.updateSettings(settings);
				} catch (error) {
					console.error(
						"Failed to refresh a flashcard view after saving settings:",
						error,
					);
				}
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

function cloneFlashcardSettings(settings: FlashcardSettings): FlashcardSettings {
	return {
		...settings,
		flashcardTags: [...settings.flashcardTags],
		wordLearningDecks: { ...settings.wordLearningDecks },
		deckOrder: [...settings.deckOrder],
		practicePerfectMessages: [...settings.practicePerfectMessages],
		practiceErrorMessages: [...settings.practiceErrorMessages],
		fsrsParameters: { ...settings.fsrsParameters },
		deckStudySettings: cloneDeckStudySettings(settings.deckStudySettings),
		pronunciation: { ...settings.pronunciation },
	};
}

function cloneDeckStudySettings(
	settings: FlashcardSettings["deckStudySettings"],
): FlashcardSettings["deckStudySettings"] {
	return Object.fromEntries(
		Object.entries(settings).map(([deckId, overrides]) => [
			deckId,
			{
				...overrides,
				fsrsParameters: overrides.fsrsParameters && {
					...overrides.fsrsParameters,
				},
			},
		]),
	);
}
