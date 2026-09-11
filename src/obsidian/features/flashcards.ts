import { Notice, Platform } from "obsidian";
import { createTranslator } from "../../i18n";
import type { FlashcardSettings, Language, PronunciationSettings, StudySettings } from "../../shared/types";
import {
	buildSettingsViewModel,
	type SettingsViewModelActions,
} from "../../settings/settingsViewModel";
import type { DataStore } from "../../storage/dataStore";
import {
	createDeckHome,
	type DeckHome,
	type DeckHomeEvent,
	type DeckHomeSettingsPatch,
} from "../../decks/deckHome";
import { exportDeckToPdf } from "../../decks/deckPdfExporter";
import {
	createCardIdentityContinuity,
	type CardIdentityContinuity,
	type ResolutionOutcome,
} from "../../identity/cardIdentityContinuity";
import { createCardIdentity } from "../../identity/cardIdentity";
import { describeSynchronizationOutcome } from "../../identity/synchronizationFeedback";
import { createPronunciationRuntime, type PronunciationRuntime } from "../../pronunciation";
import { createSessionLifecycle, type SessionLifecycle } from "../../sessions/sessionLifecycle";
import { CardIdentityMigrationModal, CardIdentityRepairModal } from "../cardIdentityContinuityModals";
import { createObsidianContinuitySourceStore } from "../cardIdentityContinuityAdapters";
import { FlashcardView, VIEW_TYPE_FLASHCARD } from "../FlashcardView";
import type { WorkbenchFeature, WorkbenchHost, WorkbenchSettingsSection } from "../workbench";

/** Settings section id this feature contributes. */
export const FLASHCARD_SECTION_ID = "flashcards";

const OPEN_COMMAND_ID = "open-flashcard-view";
const SYNC_COMMAND_ID = "sync-flashcard-decks";
const MIGRATE_IDENTITIES_COMMAND_ID = "migrate-card-identities";
const REPAIR_IDENTITIES_COMMAND_ID = "repair-card-identities";

export interface FlashcardFeatureDeps {
	dataStore: DataStore;
}

interface FlashcardServices {
	sessionLifecycle: SessionLifecycle;
	cardIdentityContinuity: CardIdentityContinuity;
	deckHome: DeckHome;
	pronunciationRuntime: PronunciationRuntime;
}

/**
 * The 闪卡 workbench feature: 题库首页, 学习会话, 刷题会话, 拼写会话, 单词表, PDF 导出,
 * 卡片身份维护, and the flashcards settings section. Owns every deep module that no
 * other feature uses yet; the shared DataStore and settings document stay in the host.
 */
export function createFlashcardFeature(deps: FlashcardFeatureDeps): WorkbenchFeature {
	let services: FlashcardServices | null = null;
	let exportNotice: Notice | null = null;
	let pronunciationUnsubscribe: (() => void) | null = null;
	let didRetryFailedCacheUsage = false;
	// Tag discovery state belongs to the settings section's presentation.
	let availableTags: string[] = [];
	let isLoadingTags = false;
	let hasLoadedTags = false;

	const t = (host: WorkbenchHost) => createTranslator(host.settings().language);

	const ensureServices = (host: WorkbenchHost): FlashcardServices => {
		if (services) return services;
		const sessionLifecycleWiring = createSessionLifecycle(deps.dataStore);
		const cardIdentityContinuity = createCardIdentityContinuity({
			sources: createObsidianContinuitySourceStore(host.app),
			state: deps.dataStore.createContinuityStateStore(),
			sessions: sessionLifecycleWiring.continuitySessions,
			createIdentity: createCardIdentity,
		});
		const pronunciationRuntime = createPronunciationRuntime(
			host.app,
			host.settings().pronunciation,
			{
				persistSettings: async (pronunciation) => {
					await host.updateSettings({ pronunciation: { ...pronunciation } });
				},
			},
		);
		const deckHome = createDeckHome({
			repository: deps.dataStore,
			identity: cardIdentityContinuity,
			saveSettingsPatch: async (patch) => saveDeckSettingsPatch(host, patch),
			saveDeckOrder: async (deckOrder) => {
				await host.updateSettings({ deckOrder: [...deckOrder] });
			},
			exportDeck: async (deck, onProgress) => {
				if (!Platform.isDesktopApp) {
					throw new Error(t(host)("notice.pdfExportDesktopOnly"));
				}
				return exportDeckToPdf(
					host.app,
					deck,
					{
						frontColumn: t(host)("common.cardFront"),
						backColumn: t(host)("common.cardBack"),
						cardCount: (count) => t(host)("pdf.cardCount", { count }),
						saveDialogTitle: t(host)("pdf.saveDialogTitle"),
					},
					{ onProgress },
				);
			},
			report: (event) => reportDeckHomeEvent(host, event),
		});
		services = {
			sessionLifecycle: sessionLifecycleWiring.lifecycle,
			cardIdentityContinuity,
			deckHome,
			pronunciationRuntime,
		};
		return services;
	};

	/** A deck settings patch writes both per-deck maps in one durable commit. */
	const saveDeckSettingsPatch = async (
		host: WorkbenchHost,
		patch: DeckHomeSettingsPatch,
	): Promise<void> => {
		const deckStudySettings = { ...host.settings().deckStudySettings };
		if (patch.overrides === null) {
			delete deckStudySettings[patch.deckId];
		} else {
			deckStudySettings[patch.deckId] = patch.overrides;
		}
		const wordLearningDecks = { ...host.settings().wordLearningDecks };
		if (patch.wordLearningEnabled) {
			wordLearningDecks[patch.deckId] = true;
		} else {
			delete wordLearningDecks[patch.deckId];
		}
		await host.updateSettings({ deckStudySettings, wordLearningDecks });
	};

	// ------------------------------------------------------------------
	// Deck-home reporting and card identity maintenance
	// ------------------------------------------------------------------

	const reportDeckHomeEvent = (host: WorkbenchHost, event: DeckHomeEvent): void => {
		const strings = t(host);
		if (event.kind === "refresh-completed") {
			const message = describeSynchronizationOutcome(
				event.outcome,
				services!.cardIdentityContinuity.inspect(),
				host.settings().language,
			);
			if (message) new Notice(message, 12000);
			return;
		}
		if (event.kind === "migration-completed") {
			showIdentityResolutionOutcome(host, event.outcome);
			return;
		}
		if (event.kind === "settings-save-failed") {
			new Notice(strings("notice.deckSettingsSaveFailed", { message: event.message }));
			return;
		}
		if (event.kind === "export-progress") {
			const message =
				event.progress.phase === "rendering"
					? strings("notice.pdfExportRendering", {
							completed: event.progress.completed,
							total: event.progress.total,
						})
					: strings("notice.pdfExportGenerating");
			if (exportNotice) {
				exportNotice.setMessage(message);
			} else {
				exportNotice = new Notice(message, 0);
			}
			return;
		}
		exportNotice?.hide();
		exportNotice = null;
		if (event.kind === "export-completed") {
			if (event.result.kind === "saved") {
				new Notice(
					strings("notice.pdfExportSaved", { filePath: event.result.filePath }),
					8000,
				);
			}
			return;
		}
		new Notice(strings("notice.pdfExportFailed", { message: event.message }));
	};

	const showIdentityResolutionOutcome = (
		host: WorkbenchHost,
		outcome: ResolutionOutcome,
	): void => {
		const strings = t(host);
		if (outcome.kind === "applied") {
			new Notice(strings("identity.migrationApplied"));
			return;
		}
		if (outcome.kind === "resumable") {
			new Notice(strings("identity.operationResumable"));
			return;
		}
		if (outcome.kind === "failed") {
			new Notice(strings("identity.operationFailed", { message: outcome.message }));
			return;
		}
		new Notice(
			strings(
				outcome.reason === "active-session"
					? "identity.migrationBlocked"
					: outcome.reason === "legacy-source-mismatch"
						? "identity.migrationSourceMismatch"
						: "identity.previewExpired",
			),
		);
	};

	const applyIdentityResolution = async (
		host: WorkbenchHost,
		resolution: Promise<ResolutionOutcome>,
		type: "migration" | "repair",
	): Promise<void> => {
		const outcome = await resolution;
		const strings = t(host);
		if (outcome.kind === "applied") {
			new Notice(
				strings(
					type === "migration" ? "identity.migrationApplied" : "identity.repairApplied",
				),
			);
			return;
		}
		if (outcome.kind === "resumable") {
			new Notice(strings("identity.operationResumable"));
			return;
		}
		if (outcome.kind === "failed") {
			new Notice(strings("identity.operationFailed", { message: outcome.message }));
			return;
		}
		new Notice(
			strings(
				outcome.reason === "active-session"
					? "identity.migrationBlocked"
					: outcome.reason === "legacy-source-mismatch"
						? "identity.migrationSourceMismatch"
						: "identity.previewExpired",
			),
		);
	};

	const openIdentityMigration = async (host: WorkbenchHost): Promise<void> => {
		const { cardIdentityContinuity, deckHome } = ensureServices(host);
		const ownerId = "command:migrate-card-identities";
		const request = await deckHome.act({ kind: "request-migration", ownerId });
		if (request.kind === "rejected" && request.reason === "migration-unavailable") {
			new Notice(t(host)("identity.noMigration"));
			return;
		}
		if (request.kind !== "confirmation-required") return;
		const preview = cardIdentityContinuity.inspect().migration;
		if (!preview) {
			await deckHome.act({
				kind: "continue",
				ownerId,
				continuation: request.continuation,
				confirmed: false,
			});
			return;
		}
		new CardIdentityMigrationModal(
			host.app,
			preview,
			t(host),
			() => {
				void deckHome.act({
					kind: "continue",
					ownerId,
					continuation: request.continuation,
					confirmed: true,
				});
			},
			() => {
				void deckHome.act({
					kind: "continue",
					ownerId,
					continuation: request.continuation,
					confirmed: false,
				});
			},
		).open();
	};

	const openIdentityRepair = async (host: WorkbenchHost): Promise<void> => {
		const { cardIdentityContinuity } = ensureServices(host);
		const outcome = await cardIdentityContinuity.synchronize();
		if (outcome.kind === "failed") {
			new Notice(t(host)("identity.syncFailed", { message: outcome.message }));
			return;
		}
		const issue = cardIdentityContinuity.inspect().issues[0];
		if (!issue) {
			new Notice(t(host)("identity.noRepair"));
			return;
		}
		new CardIdentityRepairModal(
			host.app,
			issue,
			t(host),
			(successors) => {
				void applyIdentityResolution(
					host,
					cardIdentityContinuity.resolve({
						kind: "repair",
						ticket: issue.ticket,
						issueId: issue.id,
						successors,
					}),
					"repair",
				);
			},
			() => new Notice(t(host)("identity.duplicateAssignment")),
		).open();
	};

	const runIdentitySynchronization = async (host: WorkbenchHost): Promise<void> => {
		const { cardIdentityContinuity, deckHome } = ensureServices(host);
		const outcome = await deckHome.act({ kind: "refresh" });
		if (
			outcome.kind === "applied" &&
			cardIdentityContinuity.inspect().issues.length === 0
		) {
			new Notice(t(host)("identity.syncCurrent"));
		}
	};

	// ------------------------------------------------------------------
	// Flashcards settings section
	// ------------------------------------------------------------------

	const writeSettings = async (
		host: WorkbenchHost,
		patch: Partial<FlashcardSettings>,
		refreshSection: boolean,
	): Promise<void> => {
		await host.updateSettings(patch);
		if (refreshSection) host.settingsTab.refresh();
	};

	const ensureAvailableTagsLoaded = (): void => {
		if (hasLoadedTags || isLoadingTags) return;
		// Opening settings must stay cheap. A full vault scan is reserved for the
		// explicit refresh action; otherwise large vaults make the first render wait.
		if (!deps.dataStore.hasAvailableTagsSnapshot()) return;
		availableTags = deps.dataStore.getAvailableTags();
		hasLoadedTags = true;
	};

	const cleanMissingConfiguredTags = (
		host: WorkbenchHost,
		nextAvailableTags: string[],
	): { flashcardTags: string[]; removedCount: number } => {
		const availableTagSet = new Set(nextAvailableTags.map((tag) => tag.trim().toLowerCase()));
		const originalTags = host.settings().flashcardTags;
		const flashcardTags = originalTags.filter((tag) => {
			const normalizedTag = tag.trim();
			return normalizedTag.length === 0 || availableTagSet.has(normalizedTag.toLowerCase());
		});
		return { flashcardTags, removedCount: originalTags.length - flashcardTags.length };
	};

	const refreshAvailableTags = async (
		host: WorkbenchHost,
		options: { cleanConfiguredTags: boolean },
	): Promise<void> => {
		if (isLoadingTags) return;
		const strings = t(host);
		isLoadingTags = true;
		host.settingsTab.refresh();

		try {
			await ensureServices(host).cardIdentityContinuity.synchronize();
			availableTags = deps.dataStore.getAvailableTags();
			hasLoadedTags = true;

			let removedCount = 0;
			if (options.cleanConfiguredTags) {
				const cleaned = cleanMissingConfiguredTags(host, availableTags);
				removedCount = cleaned.removedCount;
				await host.updateSettings({ flashcardTags: cleaned.flashcardTags });
			}

			new Notice(
				options.cleanConfiguredTags
					? strings("settings.tagsRefreshedAndCleaned", {
							count: String(removedCount),
						})
					: strings("settings.tagsRefreshed"),
			);
		} catch (error) {
			console.error("Failed to refresh flashcard tags:", error);
			new Notice(strings("settings.tagsRefreshFailed"));
		} finally {
			isLoadingTags = false;
			host.settingsTab.refresh();
		}
	};

	const configurePronunciation = async (
		host: WorkbenchHost,
		patch: Partial<PronunciationSettings>,
	): Promise<void> => {
		const outcome = await ensureServices(host).pronunciationRuntime.configure(patch);
		if (outcome.status === "applied") return;
		const strings = t(host);
		new Notice(
			outcome.status === "busy"
				? strings("settings.pronunciationBusy")
				: strings("settings.pronunciationSaveFailed"),
		);
	};

	const testOnlinePronunciation = async (host: WorkbenchHost): Promise<void> => {
		const strings = t(host);
		try {
			const outcome = await ensureServices(host).pronunciationRuntime.testOnlineProvider(
				"hello",
			);
			if (outcome.status === "success") {
				new Notice(strings("settings.pronunciationTestSuccess"));
				return;
			}
			if (outcome.status === "cancelled") return;
			if (outcome.status === "busy") {
				new Notice(strings("settings.pronunciationBusy"));
				return;
			}
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
			new Notice(strings(key));
		} catch {
			new Notice(strings("settings.pronunciationTestFailed"));
		}
	};

	const clearPronunciationCache = async (host: WorkbenchHost): Promise<void> => {
		const strings = t(host);
		try {
			const outcome = await ensureServices(host).pronunciationRuntime.clearCache();
			new Notice(
				outcome.status === "cleared"
					? strings("settings.pronunciationCacheCleared")
					: outcome.status === "busy"
						? strings("settings.pronunciationBusy")
						: strings("settings.pronunciationCacheClearFailed"),
			);
		} catch {
			new Notice(strings("settings.pronunciationCacheClearFailed"));
		}
	};

	const createSettingsActions = (host: WorkbenchHost): SettingsViewModelActions => {
		const patchTags = (mutate: (tags: string[]) => void) => {
			const flashcardTags = [...host.settings().flashcardTags];
			mutate(flashcardTags);
			return writeSettings(host, { flashcardTags }, true);
		};
		const patchStudy = (patch: Partial<StudySettings>) =>
			writeSettings(host, patch, false);

		return {
			refreshTags: (options) => refreshAvailableTags(host, options),
			updateFlashcardTag: (index, value) =>
				patchTags((tags) => {
					tags[index] = value;
				}),
			addFlashcardTag: () => patchTags((tags) => tags.push("")),
			removeFlashcardTag: (index) =>
				patchTags((tags) => {
					tags.splice(index, 1);
				}),
			addDiscoveredTag: (tag) => patchTags((tags) => tags.push(tag)),
			setLanguage: (language) => writeSettings(host, { language }, true),
			setDailyNewCards: (value) => patchStudy({ dailyNewCards: value }),
			setDailyReviewCards: (value) => patchStudy({ dailyReviewCards: value }),
			setStudyOrder: (value) => patchStudy({ studyOrder: value }),
			setRequestRetention: (value) =>
				writeSettings(
					host,
					{
						fsrsParameters: {
							...host.settings().fsrsParameters,
							requestRetention: value,
						},
					},
					false,
				),
			setMaximumInterval: (value) =>
				writeSettings(
					host,
					{
						fsrsParameters: {
							...host.settings().fsrsParameters,
							maximumInterval: value,
						},
					},
					false,
				),
			setPronunciationAutoPlay: (value) =>
				configurePronunciation(host, { spellingAutoPlay: value }),
			setPronunciationAccent: (value) => configurePronunciation(host, { accent: value }),
			setPronunciationRate: (value) => configurePronunciation(host, { rate: value }),
			setOnlinePronunciationProvider: (value) =>
				configurePronunciation(host, { onlineProvider: value }),
			setAzureCloud: (value) => configurePronunciation(host, { azureCloud: value }),
			setAzureRegion: (value) => configurePronunciation(host, { azureRegion: value }),
			setAzureSecretId: (value) => configurePronunciation(host, { azureSecretId: value }),
			setOpenAiSecretId: (value) => configurePronunciation(host, { openaiSecretId: value }),
			testOnlinePronunciation: () => testOnlinePronunciation(host),
			clearPronunciationCache: () => clearPronunciationCache(host),
		};
	};

	const section = (host: WorkbenchHost): WorkbenchSettingsSection => ({
		id: FLASHCARD_SECTION_ID,
		order: 0,
		label: (language: Language) => createTranslator(language)("settings.tabFlashcards"),
		definitions: (language) => {
			ensureAvailableTagsLoaded();
			return buildSettingsViewModel(
				{
					settings: host.settings(),
					availableTags,
					isLoadingTags,
					hasLoadedTags,
					language,
					pronunciation: ensureServices(host).pronunciationRuntime.getSnapshot(),
				},
				createSettingsActions(host),
			);
		},
		activate: () => {
			const { pronunciationRuntime } = ensureServices(host);
			pronunciationUnsubscribe ??= pronunciationRuntime.subscribe(() =>
				host.settingsTab.refresh(),
			);
			if (
				!didRetryFailedCacheUsage &&
				pronunciationRuntime.getSnapshot().cacheUsage.status === "failed"
			) {
				didRetryFailedCacheUsage = true;
				void pronunciationRuntime.refreshCacheUsage();
			}
		},
		hide: () => {
			pronunciationUnsubscribe?.();
			pronunciationUnsubscribe = null;
			didRetryFailedCacheUsage = false;
		},
	});

	return {
		id: "flashcards",

		render: (host) => {
			const {
				sessionLifecycle,
				cardIdentityContinuity,
				deckHome,
				pronunciationRuntime,
			} = ensureServices(host);

			host.registerView(
				VIEW_TYPE_FLASHCARD,
				(leaf) =>
					new FlashcardView(
						leaf,
						cardIdentityContinuity,
						sessionLifecycle,
						pronunciationRuntime,
						deckHome,
						host.settings(),
						() => host.settingsTab.open(),
					),
			);

			// The ribbon joins the rebuildable chrome: every feature removes and
			// re-adds its own ribbon during its render, so the icons keep the
			// composition order while still relabelling on a language change.
			const strings = t(host);
			host.chrome((chrome) => {
				chrome.ribbon("layers", strings("main.ribbonOpenFlashcards"), () => {
					void host.activateView(VIEW_TYPE_FLASHCARD);
				});
				chrome.command({
					id: OPEN_COMMAND_ID,
					name: strings("main.commandOpenFlashcards"),
					run: () => {
						void host.activateView(VIEW_TYPE_FLASHCARD);
					},
				});
				chrome.command({
					id: SYNC_COMMAND_ID,
					name: strings("main.commandSyncDecks"),
					run: () => {
						void runIdentitySynchronization(host);
					},
				});
				chrome.command({
					id: MIGRATE_IDENTITIES_COMMAND_ID,
					name: strings("main.commandMigrateCardIdentities"),
					run: () => {
						void openIdentityMigration(host);
					},
				});
				chrome.command({
					id: REPAIR_IDENTITIES_COMMAND_ID,
					name: strings("main.commandRepairCardIdentities"),
					run: () => {
						void openIdentityRepair(host);
					},
				});
			});

			host.settingsSection(section(host));
		},

		stop: () => {
			pronunciationUnsubscribe?.();
			pronunciationUnsubscribe = null;
			exportNotice?.hide();
			exportNotice = null;
			services?.deckHome.dispose();
			services?.pronunciationRuntime.dispose();
			services = null;
		},
	};
}
