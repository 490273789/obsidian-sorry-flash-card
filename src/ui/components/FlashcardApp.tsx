import React, {
	useState,
	useCallback,
	useRef,
	useMemo,
	useReducer,
	useEffect,
	useSyncExternalStore,
} from "react";
import {
	App,
	ButtonComponent,
	Component,
	MarkdownRenderer,
	Modal,
	Notice,
	Platform,
	TFile,
} from "obsidian";
import {
	ViewState,
	FlashcardSettings,
	StudySettings,
	StudySession,
	PracticeSession,
	PracticeResult,
	SpellingResult,
	SpellingSession,
	CardDirection,
} from "../../shared/types";
import { DataStore } from "../../storage/dataStore";
import { createDeckHomeRuntime } from "../../decks/deckHomeRuntime";
import { exportDeckToPdf } from "../../decks/deckPdfExporter";
import {
	createPracticeSessionRuntime,
	type PracticeSessionStartOptions,
} from "../../sessions/practiceSessionRuntime";
import { createStudySessionRuntime } from "../../sessions/studySessionRuntime";
import {
	createSpellingSessionRuntime,
	type SpellingSessionStartOptions,
} from "../../sessions/spellingSessionRuntime";
import { DeckList } from "./DeckList";
import { CardView } from "./CardView";
import { PracticeSetup } from "./PracticeSetup";
import { PracticeView } from "./PracticeView";
import { PracticeSummary } from "./PracticeSummary";
import { WordListView } from "./WordListView";
import { StudySetup } from "./StudySetup";
import { StatsView } from "./StatsView";
import { SpellingSetup } from "./SpellingSetup";
import { SpellingView } from "./SpellingView";
import { SpellingSummary } from "./SpellingSummary";
import { I18nProvider } from "./I18nContext";
import { createTranslator } from "../../i18n";
import { CardEditorModal, type CardEditorSavePayload } from "./CardEditorModal";
import type {
	CardChangeOutcome,
	CardIdentityContinuity,
	ResolutionOutcome,
} from "../../identity/cardIdentityContinuity";
import type { ActiveSessionStore } from "../../sessions/activeSessionStore";
import { validateSpellingDeck } from "../../cards/spellingWord";
import { isStableCardIdentity } from "../../identity/cardIdentity";

interface FlashcardAppProps {
	app: App;
	dataStore: DataStore;
	cardIdentityContinuity: CardIdentityContinuity;
	activeSessionStore: ActiveSessionStore;
	settings: FlashcardSettings;
	onSaveSettings: (settings: FlashcardSettings) => Promise<void>;
	onRefresh: () => Promise<void>;
	onOpenSettings: () => void;
}

type CardEditorState =
	| {
			mode: "create";
			deckId: string | null;
	  }
	| {
			mode: "edit";
			deckId: string;
			cardId: string;
			cardIndex: number;
			front: string;
			back: string;
			explanation: string;
	  };

export const FlashcardApp: React.FC<FlashcardAppProps> = ({
	app,
	dataStore,
	cardIdentityContinuity,
	activeSessionStore,
	settings,
	onSaveSettings,
	onRefresh,
	onOpenSettings,
}) => {
	const t = useMemo(() => createTranslator(settings.language), [settings.language]);
	const [viewState, setViewState] = useState<ViewState>({ type: "home" });
	const activeSessions = useSyncExternalStore(
		(listener) => activeSessionStore.subscribe(listener),
		() => activeSessionStore.getSnapshot(),
		() => activeSessionStore.getSnapshot(),
	);
	const { studySession, practiceSession, practiceResult, spellingSession, spellingResult } =
		activeSessions;
	useEffect(() => {
		if (activeSessions.lastEndReason !== "source-change") return;
		new Notice(t("identity.sessionEndedBySourceChange"));
		setViewState({ type: "home" });
		activeSessionStore.clearEndReason();
	}, [activeSessionStore, activeSessions.lastEndReason, t]);
	const [, bumpSnapshotVersion] = useReducer((version: number) => version + 1, 0);
	const [cardEditor, setCardEditor] = useState<CardEditorState | null>(null);
	// Track when word-list view was opened for duration recording
	const wordListStartTime = useRef<number | null>(null);

	const decks = dataStore.getAllDecks();
	const deckHomeRuntime = useMemo(() => createDeckHomeRuntime(dataStore), [dataStore]);
	const deckHomeSnapshot = deckHomeRuntime.getSnapshot();
	const migrationPreview = cardIdentityContinuity.inspect().migration;
	const studyRuntime = useMemo(() => createStudySessionRuntime(dataStore), [dataStore]);
	const practiceRuntime = useMemo(() => createPracticeSessionRuntime(dataStore), [dataStore]);
	const spellingRuntime = useMemo(() => createSpellingSessionRuntime(dataStore), [dataStore]);

	// Markdown renderer function
	const renderMarkdown = useCallback(
		async (content: string, el: HTMLElement): Promise<void> => {
			const component = new Component();
			await MarkdownRenderer.render(app, content, el, "", component);
		},
		[app],
	);

	const handleBackHome = useCallback(() => {
		setViewState({ type: "home" });
	}, []);

	const handleOpenStats = useCallback(() => {
		setViewState({ type: "stats" });
	}, []);

	const handleOpenAddCard = useCallback(() => {
		const firstDeck = dataStore.getAllDecks()[0];
		if (!firstDeck) {
			new Notice(t("notice.noDecks"));
			return;
		}
		setCardEditor({
			mode: "create",
			deckId: firstDeck.id,
		});
	}, [dataStore, t]);

	const handleCloseCardEditor = useCallback(() => {
		setCardEditor(null);
	}, []);

	const confirmAction = useCallback(
		(title: string, message: string, confirmText: string): Promise<boolean> => {
			return new Promise((resolve) => {
				let isResolved = false;
				const modal = new Modal(app);

				const finish = (confirmed: boolean) => {
					if (isResolved) return;
					isResolved = true;
					modal.close();
					resolve(confirmed);
				};

				modal.titleEl.setText(title);
				const body = modal.contentEl.createDiv({
					cls: "flashcard-confirm-modal",
				});
				body.createEl("p", { text: message });
				const actions = body.createDiv({
					cls: "flashcard-confirm-actions",
				});
				new ButtonComponent(actions)
					.setButtonText(t("common.cancel"))
					.onClick(() => finish(false));
				new ButtonComponent(actions)
					.setButtonText(confirmText)
					.setCta()
					.onClick(() => finish(true));
				modal.onClose = () => finish(false);
				modal.open();
			});
		},
		[app, t],
	);

	const ensureDeckEditable = useCallback(
		async (deckId: string): Promise<boolean> => {
			const snapshot = cardIdentityContinuity.inspect();
			const condition = snapshot.sources[deckId];
			if (!condition || condition.type === "current") return true;
			if (condition.type === "last-known-good") {
				new Notice(t("identity.editNeedsRepair"));
				return false;
			}

			const preview = snapshot.migration;
			const source = preview?.sources.find((candidate) => candidate.deckId === deckId);
			if (!preview || !source) {
				new Notice(t("identity.editNeedsMigration"));
				return false;
			}
			const confirmed = await confirmAction(
				t("identity.migrationTitle"),
				t("identity.editMigrationDescription", {
					deckName: source.deckName,
					cards: source.cardCount,
				}),
				t("identity.migrateNow"),
			);
			if (!confirmed) return false;

			const outcome = await cardIdentityContinuity.resolve({
				kind: "migrate",
				ticket: preview.ticket,
				deckIds: [deckId],
			});
			if (outcome.kind === "applied") return true;
			new Notice(getIdentityResolutionFailureMessage(outcome, t));
			return false;
		},
		[cardIdentityContinuity, confirmAction, t],
	);

	const handleMigrateAllLegacyDecks = useCallback(async (): Promise<void> => {
		for (let attempt = 0; attempt < 2; attempt++) {
			const syncOutcome = await cardIdentityContinuity.synchronize();
			if (syncOutcome.kind === "failed") {
				new Notice(t("identity.syncFailed", { message: syncOutcome.message }));
				return;
			}
			bumpSnapshotVersion();

			const preview = cardIdentityContinuity.inspect().migration;
			if (!preview) {
				new Notice(t("identity.noMigration"));
				return;
			}
			if (attempt > 0) new Notice(t("identity.migrationPlanRefreshed"));
			const confirmed = await confirmAction(
				t("identity.migrationTitle"),
				t("identity.migrationDescription", {
					sources: preview.sourceCount,
					cards: preview.cardCount,
				}),
				t("identity.migrateAllNow"),
			);
			if (!confirmed) return;

			const outcome = await cardIdentityContinuity.resolve({
				kind: "migrate",
				ticket: preview.ticket,
				deckIds: preview.sources.map((source) => source.deckId),
			});
			if (outcome.kind === "applied") {
				new Notice(t("identity.migrationApplied"));
				bumpSnapshotVersion();
				return;
			}
			if (
				attempt === 0 &&
				outcome.kind === "blocked" &&
				(outcome.reason === "preview-expired" || outcome.reason === "source-changing")
			) {
				continue;
			}
			new Notice(getIdentityResolutionFailureMessage(outcome, t));
			return;
		}
	}, [cardIdentityContinuity, confirmAction, t]);

	const handleEnsureDeckIdentity = useCallback(
		async (deckId: string): Promise<boolean> => {
			const ready = await ensureDeckEditable(deckId);
			if (ready) bumpSnapshotVersion();
			return ready;
		},
		[ensureDeckEditable],
	);

	const handleOpenEditCard = useCallback(
		(deckId: string, cardId: string) => {
			void (async () => {
				const card = dataStore.getCard(deckId, cardId);
				if (!card) {
					new Notice(t("notice.cardMissing"));
					return;
				}
				if (!(await ensureDeckEditable(deckId))) return;

				const editableCard =
					dataStore.getCard(deckId, cardId) ??
					dataStore.getDeck(deckId)?.cards[card.indexInFile];
				if (!editableCard) {
					new Notice(t("notice.cardMissing"));
					return;
				}
				setCardEditor({
					mode: "edit",
					deckId,
					cardId: editableCard.id,
					cardIndex: editableCard.indexInFile,
					front: editableCard.front,
					back: editableCard.back,
					explanation: editableCard.explanation ?? "",
				});
			})();
		},
		[dataStore, ensureDeckEditable, t],
	);

	const handleSaveCardEditor = useCallback(
		async ({ deckId, front, back, explanation }: CardEditorSavePayload) => {
			if (!cardEditor) return;
			if (!(await ensureDeckEditable(deckId))) return;

			try {
				const currentCardIdentity =
					cardEditor.mode === "edit"
						? (dataStore.getCard(cardEditor.deckId, cardEditor.cardId)?.id ??
							dataStore.getDeck(cardEditor.deckId)?.cards[cardEditor.cardIndex]?.id)
						: undefined;
				if (cardEditor.mode === "edit" && !currentCardIdentity) {
					throw new Error(t("notice.cardMissing"));
				}
				const outcome =
					cardEditor.mode === "edit"
						? await cardIdentityContinuity.change({
								kind: "edit",
								cardIdentity: currentCardIdentity ?? cardEditor.cardId,
								content: { front, back, explanation },
							})
						: await cardIdentityContinuity.change({
								kind: "add",
								deckId,
								content: { front, back, explanation },
							});
				if (outcome.kind !== "applied") {
					throw new Error(getCardChangeFailureMessage(outcome, t));
				}
				if (cardEditor.mode === "edit") {
					new Notice(t("notice.cardSaved"));
				} else {
					new Notice(t("notice.cardAdded"));
				}
				bumpSnapshotVersion();
				setCardEditor(null);
			} catch (error) {
				const message = error instanceof Error ? error.message : t("cardEditor.saveFailed");
				new Notice(t("notice.cardSaveFailed", { message }));
				throw error;
			}
		},
		[cardEditor, cardIdentityContinuity, dataStore, ensureDeckEditable, t],
	);

	const handleSelectDeck = useCallback(
		(deckId: string) => {
			const deck = dataStore.getDeck(deckId);
			if (deck && deck.cards.length > 0) {
				setViewState({ type: "study-setup", deckId });
			} else {
				new Notice(deck ? t("notice.deckEmpty") : t("notice.deckMissing"));
			}
		},
		[dataStore, t],
	);

	const handleStartStudyFromSetup = useCallback(
		(deckId: string, studyOrder: "sequential" | "random", direction: CardDirection) => {
			const session = dataStore.createStudySession(deckId, studyOrder, direction);
			if (session && session.cardQueue.length > 0) {
				const deck = dataStore.getDeck(deckId);
				activeSessionStore.setStudySession({
					...session,
					originDeck: { id: deckId, name: deck?.name ?? deckId },
				});
				setViewState({ type: "study", deckId });
			} else {
				new Notice(t("notice.todayComplete"));
			}
		},
		[activeSessionStore, dataStore, t],
	);

	const handleStudyDay = useCallback(
		(
			deckId: string,
			dayIndex: number,
			studyOrder: "sequential" | "random",
			direction: CardDirection,
		) => {
			const session = practiceRuntime.createDaySession({
				deckId,
				dayIndex,
				direction,
				studyOrder,
			});
			if (!session) return;
			const deck = dataStore.getDeck(deckId);
			activeSessionStore.setPracticeSession({
				...session,
				originDeck: { id: deckId, name: deck?.name ?? deckId },
			});
			activeSessionStore.setPracticeResult(null);
			setViewState({ type: "practice", deckId });
		},
		[activeSessionStore, dataStore, practiceRuntime],
	);

	const handleSpellingDay = useCallback(
		(deckId: string, dayIndex: number) => {
			const deck = dataStore.getDeck(deckId);
			if (!deck || !settings.wordLearningDecks[deckId]) {
				new Notice(t("spelling.deckNotEnabled"));
				return;
			}
			if (!deck.cards.every((card) => isStableCardIdentity(card.id))) {
				new Notice(t("spelling.identityRequired"));
				return;
			}
			const session = spellingRuntime.createDaySession(deckId, dayIndex);
			if (!session) {
				new Notice(t("spelling.dayInvalid"));
				return;
			}
			activeSessionStore.setSpellingSession({
				...session,
				originDeck: { id: deckId, name: deck.name },
			});
			activeSessionStore.setSpellingResult(null);
			setViewState({ type: "spelling", deckId });
		},
		[activeSessionStore, dataStore, settings.wordLearningDecks, spellingRuntime, t],
	);

	const handleStudyComplete = useCallback(() => {
		activeSessionStore.setStudySession(null);
		setViewState({ type: "home" });
	}, [activeSessionStore]);

	const handleCloseStudy = useCallback(async () => {
		const confirmed = await confirmAction(
			t("study.exitTitle"),
			t("study.exitConfirm"),
			t("common.confirm"),
		);
		if (!confirmed) return;

		if (studySession) {
			await studyRuntime.finish(studySession, "abandoned");
		}
		activeSessionStore.setStudySession(null);
		setViewState({ type: "home" });
	}, [activeSessionStore, confirmAction, studyRuntime, studySession, t]);

	const handleCloseStudyRequest = useCallback(() => {
		void handleCloseStudy();
	}, [handleCloseStudy]);

	const handleSessionUpdate = useCallback(
		(session: StudySession) => {
			activeSessionStore.setStudySession(session);
		},
		[activeSessionStore],
	);

	const handleOpenWordList = useCallback((deckId: string) => {
		wordListStartTime.current = Date.now();
		setViewState({ type: "word-list", deckId });
	}, []);

	const handleCloseWordList = useCallback(
		(deckId: string) => {
			if (wordListStartTime.current !== null) {
				const duration = Math.floor((Date.now() - wordListStartTime.current) / 1000);
				if (duration >= 5) {
					const deck = dataStore.getDeck(deckId);
					void dataStore.recordStudySession(
						deckId,
						deck?.name ?? deckId,
						"word-list",
						0,
						duration,
					);
				}
				wordListStartTime.current = null;
			}
			setViewState({ type: "home" });
		},
		[dataStore],
	);

	// Practice mode handlers
	const handleStartPracticeSetup = useCallback(
		(deckId: string) => {
			const deck = dataStore.getDeck(deckId);
			if (deck && deck.cards.length > 0) {
				setViewState({ type: "practice-setup", deckId });
			} else {
				new Notice(t("notice.deckEmpty"));
			}
		},
		[dataStore, t],
	);

	const handleStartPractice = useCallback(
		(deckId: string, options: PracticeSessionStartOptions) => {
			const session = practiceRuntime.createSession(deckId, options);
			if (!session) return;

			const deck = dataStore.getDeck(deckId);
			activeSessionStore.setPracticeSession({
				...session,
				originDeck: { id: deckId, name: deck?.name ?? deckId },
			});
			activeSessionStore.setPracticeResult(null);
			setViewState({ type: "practice", deckId });
		},
		[activeSessionStore, dataStore, practiceRuntime],
	);

	const handlePracticeSessionUpdate = useCallback(
		(session: PracticeSession) => {
			activeSessionStore.setPracticeSession(session);
		},
		[activeSessionStore],
	);

	const handlePracticeComplete = useCallback(
		(result: PracticeResult) => {
			activeSessionStore.setPracticeResult(result);
			if (practiceSession) {
				setViewState({
					type: "practice-summary",
					deckId: practiceSession.deckId,
				});
			}
		},
		[activeSessionStore, practiceSession],
	);

	const handlePracticeRestart = useCallback(() => {
		if (practiceSession) {
			setViewState({
				type: "practice-setup",
				deckId: practiceSession.deckId,
			});
		}
	}, [practiceSession]);

	const handlePracticeIncorrect = useCallback(() => {
		if (practiceResult && practiceSession && practiceResult.incorrectCardIds.length > 0) {
			const session = practiceRuntime.createIncorrectSession(practiceSession, practiceResult);
			if (!session) return;

			activeSessionStore.setPracticeSession({
				...session,
				originDeck: practiceSession.originDeck ?? {
					id: practiceSession.deckId,
					name: practiceSession.deckId,
				},
			});
			activeSessionStore.setPracticeResult(null);
			setViewState({ type: "practice", deckId: practiceSession.deckId });
		}
	}, [activeSessionStore, practiceResult, practiceRuntime, practiceSession]);

	const handlePracticeClose = useCallback(() => {
		activeSessionStore.setPracticeSession(null);
		activeSessionStore.setPracticeResult(null);
		setViewState({ type: "home" });
	}, [activeSessionStore]);

	const handleStartSpellingSetup = useCallback(
		(deckId: string) => {
			const deck = dataStore.getDeck(deckId);
			if (!deck || !settings.wordLearningDecks[deckId]) {
				new Notice(t("spelling.deckNotEnabled"));
				return;
			}
			const validation = validateSpellingDeck(deck);
			if (!validation.canStart) {
				new Notice(t("spelling.deckInvalid"));
				return;
			}
			if (!deck.cards.every((card) => isStableCardIdentity(card.id))) {
				new Notice(t("spelling.identityRequired"));
				return;
			}
			setViewState({ type: "spelling-setup", deckId });
		},
		[dataStore, settings.wordLearningDecks, t],
	);

	const handleStartSpelling = useCallback(
		(deckId: string, options: SpellingSessionStartOptions) => {
			const deck = dataStore.getDeck(deckId);
			if (!deck || !settings.wordLearningDecks[deckId]) {
				new Notice(t("spelling.deckNotEnabled"));
				return;
			}
			const validation = validateSpellingDeck(deck);
			if (!validation.canStart) {
				new Notice(t("spelling.deckInvalid"));
				return;
			}
			if (!deck.cards.every((card) => isStableCardIdentity(card.id))) {
				new Notice(t("spelling.identityRequired"));
				return;
			}
			const session = spellingRuntime.createSession(deckId, options);
			if (!session) {
				new Notice(t("notice.deckEmpty"));
				return;
			}
			activeSessionStore.setSpellingSession({
				...session,
				originDeck: { id: deckId, name: deck.name },
			});
			activeSessionStore.setSpellingResult(null);
			setViewState({ type: "spelling", deckId });
		},
		[activeSessionStore, dataStore, settings.wordLearningDecks, spellingRuntime, t],
	);

	const handleSpellingSessionUpdate = useCallback(
		(session: SpellingSession) => {
			activeSessionStore.setSpellingSession(session);
		},
		[activeSessionStore],
	);

	const handleSpellingComplete = useCallback(
		(result: SpellingResult) => {
			activeSessionStore.setSpellingResult(result);
			if (spellingSession) {
				setViewState({
					type: "spelling-summary",
					deckId: spellingSession.deckId,
				});
			}
		},
		[activeSessionStore, spellingSession],
	);

	const handleCloseSpelling = useCallback(async () => {
		const confirmed = await confirmAction(
			t("spelling.exitTitle"),
			t("spelling.exitConfirm"),
			t("common.confirm"),
		);
		if (!confirmed) return;
		if (spellingSession) {
			await spellingRuntime.finish(spellingSession);
		}
		activeSessionStore.setSpellingSession(null);
		activeSessionStore.setSpellingResult(null);
		setViewState({ type: "home" });
	}, [activeSessionStore, confirmAction, spellingRuntime, spellingSession, t]);

	const handleSpellingRetryIncorrect = useCallback(() => {
		if (!spellingSession || !spellingResult) return;
		const session = spellingRuntime.createIncorrectSession(spellingSession, spellingResult);
		if (!session) return;
		activeSessionStore.setSpellingSession({
			...session,
			originDeck: spellingSession.originDeck,
		});
		activeSessionStore.setSpellingResult(null);
		setViewState({ type: "spelling", deckId: spellingSession.deckId });
	}, [activeSessionStore, spellingResult, spellingRuntime, spellingSession]);

	const handleSpellingRestart = useCallback(() => {
		if (!spellingSession) return;
		const deckId = spellingSession.deckId;
		activeSessionStore.setSpellingSession(null);
		activeSessionStore.setSpellingResult(null);
		setViewState({ type: "spelling-setup", deckId });
	}, [activeSessionStore, spellingSession]);

	const handleSpellingHome = useCallback(() => {
		activeSessionStore.setSpellingSession(null);
		activeSessionStore.setSpellingResult(null);
		setViewState({ type: "home" });
	}, [activeSessionStore]);

	const handleDeleteCard = useCallback(
		async (deckId: string, cardId: string) => {
			const card = dataStore.getCard(deckId, cardId);
			if (!card) {
				new Notice(t("notice.cardMissing"));
				return;
			}
			const confirmed = await confirmAction(
				t("cardEditor.deleteCurrentTitle"),
				t("cardEditor.deleteConfirm"),
				t("settings.delete"),
			);
			if (!confirmed) return;
			if (!(await ensureDeckEditable(deckId))) return;

			const currentCardIdentity =
				dataStore.getCard(deckId, cardId)?.id ??
				dataStore.getDeck(deckId)?.cards[card.indexInFile]?.id;
			if (!currentCardIdentity) {
				new Notice(t("notice.cardMissing"));
				return;
			}

			try {
				const outcome = await cardIdentityContinuity.change({
					kind: "delete",
					cardIdentity: currentCardIdentity,
				});
				if (outcome.kind !== "applied") {
					throw new Error(getCardChangeFailureMessage(outcome, t));
				}
				bumpSnapshotVersion();
				new Notice(t("notice.cardDeleted"));
			} catch (error) {
				const message =
					error instanceof Error ? error.message : t("cardEditor.deleteFailed");
				new Notice(t("notice.cardDeleteFailed", { message }));
			}
		},
		[cardIdentityContinuity, confirmAction, dataStore, ensureDeckEditable, t],
	);

	const handleDeleteCardRequest = useCallback(
		(deckId: string, cardId: string) => {
			void handleDeleteCard(deckId, cardId);
		},
		[handleDeleteCard],
	);

	const handleOpenSourceFile = useCallback(
		(filePath: string) => {
			const file = app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				void app.workspace.getLeaf(false).openFile(file);
			} else {
				new Notice(t("notice.sourceMissing", { filePath }));
			}
		},
		[app, t],
	);

	const handleExportDeck = useCallback(
		async (deckId: string) => {
			const deck = dataStore.getDeck(deckId);
			if (!deck) {
				new Notice(t("notice.deckMissing"));
				return;
			}
			if (deck.cards.length === 0) {
				new Notice(t("notice.deckEmpty"));
				return;
			}
			if (!Platform.isDesktopApp) {
				new Notice(t("notice.pdfExportDesktopOnly"));
				return;
			}

			const progressNotice = { current: null as Notice | null };
			try {
				const result = await exportDeckToPdf(
					app,
					deck,
					{
						frontColumn: t("common.cardFront"),
						backColumn: t("common.cardBack"),
						cardCount: (count) => t("pdf.cardCount", { count }),
						saveDialogTitle: t("pdf.saveDialogTitle"),
					},
					{
						onProgress: ({ phase, completed, total }) => {
							const message =
								phase === "rendering"
									? t("notice.pdfExportRendering", { completed, total })
									: t("notice.pdfExportGenerating");
							if (progressNotice.current) {
								progressNotice.current.setMessage(message);
							} else {
								progressNotice.current = new Notice(message, 0);
							}
						},
					},
				);
				if (result.kind === "saved") {
					new Notice(t("notice.pdfExportSaved", { filePath: result.filePath }), 8000);
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : t("notice.pdfExportUnknownError");
				new Notice(t("notice.pdfExportFailed", { message }));
			} finally {
				progressNotice.current?.hide();
			}
		},
		[app, dataStore, t],
	);

	const handleUpdateDeckSettings = useCallback(
		async (
			deckId: string,
			overrides: Partial<StudySettings> | null,
			wordLearningEnabled: boolean,
		) => {
			const newDeckStudySettings = {
				...settings.deckStudySettings,
			};
			if (overrides === null) {
				delete newDeckStudySettings[deckId];
			} else {
				newDeckStudySettings[deckId] = overrides;
			}
			const wordLearningDecks = {
				...settings.wordLearningDecks,
			};
			if (wordLearningEnabled) {
				wordLearningDecks[deckId] = true;
			} else {
				delete wordLearningDecks[deckId];
			}
			await onSaveSettings({
				...settings,
				deckStudySettings: newDeckStudySettings,
				wordLearningDecks,
			});
		},
		[onSaveSettings, settings],
	);

	const renderHome = () => (
		<DeckList
			snapshot={deckHomeSnapshot}
			settings={settings}
			legacyMigration={
				migrationPreview
					? {
							sourceCount: migrationPreview.sourceCount,
							cardCount: migrationPreview.cardCount,
						}
					: null
			}
			onSelectDeck={handleSelectDeck}
			onOpenWordList={handleOpenWordList}
			onStartPractice={handleStartPracticeSetup}
			onStartSpelling={handleStartSpellingSetup}
			onExportDeck={handleExportDeck}
			onRefresh={async () => {
				await onRefresh();
				bumpSnapshotVersion();
			}}
			onUpdateDeckSettings={handleUpdateDeckSettings}
			onMigrateDeckIdentity={handleEnsureDeckIdentity}
			onOpenSourceFile={handleOpenSourceFile}
			onOpenStats={handleOpenStats}
			onOpenSettings={onOpenSettings}
			onOpenAddCard={handleOpenAddCard}
			onMigrateLegacyDecks={handleMigrateAllLegacyDecks}
		/>
	);

	const renderContent = (): React.ReactNode => {
		// Render based on view state
		switch (viewState.type) {
			case "study-setup": {
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) {
					return renderHome();
				}
				const dayList = dataStore.getDayList(viewState.deckId);
				const { newCount, reviewCount } = dataStore.getTodayStudyCounts(viewState.deckId);
				const effectiveSettings = dataStore.getEffectiveStudySettings(viewState.deckId);
				return (
					<StudySetup
						key={deck.id}
						deck={deck}
						dayList={dayList}
						todayNewCount={newCount}
						todayReviewCount={reviewCount}
						defaultStudyOrder={effectiveSettings.studyOrder}
						onStart={(order, direction) =>
							handleStartStudyFromSetup(viewState.deckId, order, direction)
						}
						onStartDay={(dayIndex, order, direction) =>
							handleStudyDay(viewState.deckId, dayIndex, order, direction)
						}
						spellingEnabled={Boolean(settings.wordLearningDecks[viewState.deckId])}
						onStartDaySpelling={(dayIndex) =>
							handleSpellingDay(viewState.deckId, dayIndex)
						}
						onBack={handleBackHome}
					/>
				);
			}

			case "study": {
				if (!studySession) {
					return null;
				}
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) {
					return null;
				}
				return (
					<CardView
						key={deck.id}
						studyRuntime={studyRuntime}
						deck={deck}
						session={studySession}
						onSessionUpdate={handleSessionUpdate}
						onComplete={handleStudyComplete}
						onEditCard={handleOpenEditCard}
						onDeleteCard={handleDeleteCardRequest}
						onClose={handleCloseStudyRequest}
						markdownRenderer={renderMarkdown}
					/>
				);
			}

			case "practice-setup": {
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) {
					return renderHome();
				}
				return (
					<PracticeSetup
						key={deck.id}
						deck={deck}
						defaultDirection={
							practiceSession?.deckId === viewState.deckId
								? practiceSession.direction
								: "normal"
						}
						onStartPractice={(options) =>
							handleStartPractice(viewState.deckId, options)
						}
						onBack={handleBackHome}
					/>
				);
			}

			case "practice": {
				if (!practiceSession) {
					return renderHome();
				}
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) {
					return renderHome();
				}
				return (
					<PracticeView
						key={deck.id}
						practiceRuntime={practiceRuntime}
						deck={deck}
						session={practiceSession}
						onSessionUpdate={handlePracticeSessionUpdate}
						onEditCard={handleOpenEditCard}
						onDeleteCard={handleDeleteCardRequest}
						onComplete={handlePracticeComplete}
						onClose={handlePracticeClose}
						markdownRenderer={renderMarkdown}
					/>
				);
			}

			case "practice-summary": {
				if (!practiceResult || !practiceSession) {
					return renderHome();
				}
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) {
					return renderHome();
				}
				return (
					<PracticeSummary
						key={deck.id}
						deck={deck}
						practiceRuntime={practiceRuntime}
						result={practiceResult}
						onRestart={handlePracticeRestart}
						onPracticeIncorrect={handlePracticeIncorrect}
						onHome={handlePracticeClose}
						markdownRenderer={renderMarkdown}
					/>
				);
			}

			case "spelling-setup": {
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) return renderHome();
				return (
					<SpellingSetup
						key={deck.id}
						deck={deck}
						stats={spellingRuntime.getDeckProgressStats(deck.id)}
						onStart={(options) => handleStartSpelling(deck.id, options)}
						onBack={handleBackHome}
					/>
				);
			}

			case "spelling": {
				if (!spellingSession) return renderHome();
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) return renderHome();
				return (
					<SpellingView
						key={deck.id}
						spellingRuntime={spellingRuntime}
						deck={deck}
						session={spellingSession}
						onSessionUpdate={handleSpellingSessionUpdate}
						onEditCard={handleOpenEditCard}
						onDeleteCard={handleDeleteCardRequest}
						onComplete={handleSpellingComplete}
						onClose={() => void handleCloseSpelling()}
						markdownRenderer={renderMarkdown}
					/>
				);
			}

			case "spelling-summary": {
				if (!spellingResult || !spellingSession) return renderHome();
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) return renderHome();
				return (
					<SpellingSummary
						key={deck.id}
						deck={deck}
						spellingRuntime={spellingRuntime}
						result={spellingResult}
						onRetryIncorrect={handleSpellingRetryIncorrect}
						onRestart={handleSpellingRestart}
						onHome={handleSpellingHome}
						markdownRenderer={renderMarkdown}
					/>
				);
			}

			case "word-list": {
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) {
					return renderHome();
				}
				return (
					<WordListView
						key={deck.id}
						deck={deck}
						onBack={() => handleCloseWordList(viewState.deckId)}
					/>
				);
			}

			case "stats":
				return <StatsView history={dataStore.getStudyHistory()} onBack={handleBackHome} />;

			case "home":
			default:
				return renderHome();
		}
	};

	return (
		<I18nProvider language={settings.language}>
			{renderContent()}
			{cardEditor && (
				<CardEditorModal
					mode={cardEditor.mode}
					decks={decks}
					initialDeckId={cardEditor.deckId}
					initialFront={cardEditor.mode === "edit" ? cardEditor.front : ""}
					initialBack={cardEditor.mode === "edit" ? cardEditor.back : ""}
					initialExplanation={cardEditor.mode === "edit" ? cardEditor.explanation : ""}
					onSave={handleSaveCardEditor}
					onClose={handleCloseCardEditor}
				/>
			)}
		</I18nProvider>
	);
};

function getCardChangeFailureMessage(
	outcome: Exclude<CardChangeOutcome, { kind: "applied" }>,
	t: ReturnType<typeof createTranslator>,
): string {
	switch (outcome.kind) {
		case "blocked":
			return outcome.reason === "migration-required"
				? t("identity.editNeedsMigration")
				: t("identity.editNeedsRepair");
		case "source-changing":
			return t("identity.sourceChanging");
		case "failed":
			return outcome.message;
	}
}

function getIdentityResolutionFailureMessage(
	outcome: Exclude<ResolutionOutcome, { kind: "applied" }>,
	t: ReturnType<typeof createTranslator>,
): string {
	switch (outcome.kind) {
		case "resumable":
			return t("identity.operationResumable");
		case "blocked":
			if (outcome.reason === "active-session") return t("identity.migrationBlocked");
			if (outcome.reason === "legacy-source-mismatch") {
				return t("identity.migrationSourceMismatch");
			}
			return t("identity.previewExpired");
		case "failed":
			return t("identity.operationFailed", { message: outcome.message });
	}
}
