import React, {
	useState,
	useCallback,
	useRef,
	useMemo,
	useReducer,
	useEffect,
	useSyncExternalStore,
} from "react";
import { App, Component, MarkdownRenderer, Notice, Platform, TFile } from "obsidian";
import { ViewState, FlashcardSettings, StudySettings, CardDirection } from "../../shared/types";
import { DataStore } from "../../storage/dataStore";
import { createDeckHomeRuntime } from "../../decks/deckHomeRuntime";
import { exportDeckToPdf } from "../../decks/deckPdfExporter";
import type { LifecycleOutcome, SessionLifecycle } from "../../sessions/sessionLifecycle";
import { getSpellingDeckProgressStats } from "../../sessions/spellingSessionPlanner";
import { DeckList } from "./DeckList";
import { CardView } from "./CardView";
import { PracticeSetup, type PracticeSessionStartOptions } from "./PracticeSetup";
import { PracticeView } from "./PracticeView";
import { PracticeSummary } from "./PracticeSummary";
import { WordListView } from "./WordListView";
import { StudySetup } from "./StudySetup";
import { StatsView } from "./StatsView";
import { SpellingSetup, type SpellingSessionStartOptions } from "./SpellingSetup";
import { SpellingView } from "./SpellingView";
import { SpellingSummary } from "./SpellingSummary";
import { I18nProvider } from "./I18nContext";
import { createTranslator } from "../../i18n";
import { CardEditorModal, type CardEditorSavePayload } from "./CardEditorModal";
import { ConfirmDialog, type ConfirmDialogTone } from "./ConfirmDialog";
import type {
	CardChangeOutcome,
	CardIdentityContinuity,
	ResolutionOutcome,
} from "../../identity/cardIdentityContinuity";
import { validateSpellingDeck } from "../../cards/spellingWord";
import { isStableCardIdentity } from "../../identity/cardIdentity";
import type { PronunciationRuntime } from "../../pronunciation";
import { ModalProvider } from "../modal";

interface FlashcardAppProps {
	app: App;
	modalHost: HTMLElement;
	dataStore: DataStore;
	cardIdentityContinuity: CardIdentityContinuity;
	sessionLifecycle: SessionLifecycle;
	pronunciationRuntime: PronunciationRuntime;
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

interface ConfirmationState {
	title: string;
	message: string;
	confirmText: string;
	tone: ConfirmDialogTone;
	resolve: (confirmed: boolean) => void;
}

export const FlashcardApp: React.FC<FlashcardAppProps> = ({
	app,
	modalHost,
	dataStore,
	cardIdentityContinuity,
	sessionLifecycle,
	pronunciationRuntime,
	settings,
	onSaveSettings,
	onRefresh,
	onOpenSettings,
}) => {
	const t = useMemo(() => createTranslator(settings.language), [settings.language]);
	const [viewState, setViewState] = useState<ViewState>({ type: "home" });
	const lifecycleSnapshot = useSyncExternalStore(
		(listener) => sessionLifecycle.subscribe(listener),
		() => sessionLifecycle.getSnapshot(),
		() => sessionLifecycle.getSnapshot(),
	);
	const latestLifecycleSnapshotRef = useRef(lifecycleSnapshot);
	latestLifecycleSnapshotRef.current = lifecycleSnapshot;
	const presentationHoldCountRef = useRef(0);
	const [presentedLifecycleSnapshot, setPresentedLifecycleSnapshot] = useState(lifecycleSnapshot);
	useEffect(() => {
		if (presentationHoldCountRef.current === 0) {
			setPresentedLifecycleSnapshot(lifecycleSnapshot);
		}
	}, [lifecycleSnapshot]);
	const holdLifecyclePresentation = useCallback((): (() => void) => {
		presentationHoldCountRef.current++;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			presentationHoldCountRef.current = Math.max(0, presentationHoldCountRef.current - 1);
			if (presentationHoldCountRef.current === 0) {
				setPresentedLifecycleSnapshot(latestLifecycleSnapshotRef.current);
			}
		};
	}, []);
	useEffect(() => {
		if (lifecycleSnapshot.kind !== "idle" || !lifecycleSnapshot.lastEnd) return;
		new Notice(t("identity.sessionEndedBySourceChange"));
		setViewState({ type: "home" });
		void sessionLifecycle.act(lifecycleSnapshot.reference, {
			kind: "acknowledge-end",
			noticeId: lifecycleSnapshot.lastEnd.id,
		});
	}, [lifecycleSnapshot, sessionLifecycle, t]);
	const [, bumpSnapshotVersion] = useReducer((version: number) => version + 1, 0);
	const [cardEditor, setCardEditor] = useState<CardEditorState | null>(null);
	const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
	const confirmationRef = useRef<ConfirmationState | null>(null);
	const [practiceSetupDefaults, setPracticeSetupDefaults] =
		useState<PracticeSessionStartOptions | null>(null);
	const [spellingSetupDefaults, setSpellingSetupDefaults] =
		useState<SpellingSessionStartOptions | null>(null);
	const [studySetupDefaults, setStudySetupDefaults] = useState<{
		deckId: string;
		studyOrder: "sequential" | "random";
		direction: CardDirection;
	} | null>(null);
	// Track when word-list view was opened for duration recording
	const wordListStartTime = useRef<number | null>(null);

	const decks = dataStore.getAllDecks();
	const deckHomeRuntime = useMemo(() => createDeckHomeRuntime(dataStore), [dataStore]);
	const deckHomeSnapshot = deckHomeRuntime.getSnapshot();
	const migrationPreview = cardIdentityContinuity.inspect().migration;

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

	const resolveConfirmation = useCallback((confirmed: boolean) => {
		const current = confirmationRef.current;
		if (!current) return;
		confirmationRef.current = null;
		setConfirmation(null);
		current.resolve(confirmed);
	}, []);
	const handleConfirmDialogConfirm = useCallback(
		() => resolveConfirmation(true),
		[resolveConfirmation],
	);
	const handleConfirmDialogCancel = useCallback(
		() => resolveConfirmation(false),
		[resolveConfirmation],
	);

	const confirmAction = useCallback(
		(
			title: string,
			message: string,
			confirmText: string,
			tone: ConfirmDialogTone = "primary",
		): Promise<boolean> => {
			return new Promise((resolve) => {
				confirmationRef.current?.resolve(false);
				const nextConfirmation = { title, message, confirmText, tone, resolve };
				confirmationRef.current = nextConfirmation;
				setConfirmation(nextConfirmation);
			});
		},
		[],
	);

	useEffect(() => {
		return () => {
			confirmationRef.current?.resolve(false);
			confirmationRef.current = null;
		};
	}, []);

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
				setStudySetupDefaults(null);
				setViewState({ type: "study-setup", deckId });
			} else {
				new Notice(deck ? t("notice.deckEmpty") : t("notice.deckMissing"));
			}
		},
		[dataStore, t],
	);

	const reportLifecycleOutcome = useCallback(
		(outcome: LifecycleOutcome, noEligibleMessage?: string): boolean => {
			if (outcome.kind === "applied") return true;
			if (outcome.kind === "failed") {
				new Notice(outcome.failure.message);
				return false;
			}
			if (outcome.reason === "no-eligible-cards" && noEligibleMessage) {
				new Notice(noEligibleMessage);
			} else if (outcome.reason === "spelling-not-enabled") {
				new Notice(t("spelling.deckNotEnabled"));
			} else if (outcome.reason === "stable-card-identity-required") {
				new Notice(t("spelling.identityRequired"));
			} else if (outcome.reason === "no-retryable-cards") {
				new Notice(t("session.noRetryCards"));
			}
			return false;
		},
		[t],
	);

	const handleStartStudyFromSetup = useCallback(
		async (deckId: string, studyOrder: "sequential" | "random", direction: CardDirection) => {
			const outcome = await sessionLifecycle.start({
				mode: "study",
				deckId,
				studyOrder,
				direction,
			});
			reportLifecycleOutcome(outcome, t("notice.todayComplete"));
		},
		[reportLifecycleOutcome, sessionLifecycle, t],
	);

	const handleStudyDay = useCallback(
		async (
			deckId: string,
			dayIndex: number,
			studyOrder: "sequential" | "random",
			direction: CardDirection,
		) => {
			const outcome = await sessionLifecycle.start({
				mode: "practice",
				deckId,
				direction,
				selection: { kind: "study-day", dayIndex, studyOrder },
			});
			reportLifecycleOutcome(outcome);
		},
		[reportLifecycleOutcome, sessionLifecycle],
	);

	const handleSpellingDay = useCallback(
		async (deckId: string, dayIndex: number) => {
			const deck = dataStore.getDeck(deckId);
			if (!deck || !settings.wordLearningDecks[deckId]) {
				new Notice(t("spelling.deckNotEnabled"));
				return;
			}
			if (!deck.cards.every((card) => isStableCardIdentity(card.id))) {
				new Notice(t("spelling.identityRequired"));
				return;
			}
			const outcome = await sessionLifecycle.start({
				mode: "spelling",
				deckId,
				selection: { kind: "study-day", dayIndex },
			});
			reportLifecycleOutcome(outcome, t("spelling.dayInvalid"));
		},
		[dataStore, reportLifecycleOutcome, sessionLifecycle, settings.wordLearningDecks, t],
	);

	const handleExitActive = useCallback(
		async (mode: "study" | "practice" | "spelling") => {
			const active = sessionLifecycle.getSnapshot();
			if (active.kind !== "active" || active.mode !== mode) return;
			const confirmed = await confirmAction(
				t(`${mode}.exitTitle`),
				t(mode === "practice" ? "practice.exitConfirm" : `${mode}.exitConfirm`),
				t("common.confirm"),
				"danger",
			);
			if (!confirmed) return;
			const outcome = await sessionLifecycle.act(active.reference, { kind: "exit" });
			if (reportLifecycleOutcome(outcome)) setViewState({ type: "home" });
		},
		[confirmAction, reportLifecycleOutcome, sessionLifecycle, t],
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
					void dataStore.recordWordListSession(deckId, deck?.name ?? deckId, duration);
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
				setPracticeSetupDefaults(null);
				setViewState({ type: "practice-setup", deckId });
			} else {
				new Notice(t("notice.deckEmpty"));
			}
		},
		[dataStore, t],
	);

	const handleStartPractice = useCallback(
		async (deckId: string, options: PracticeSessionStartOptions) => {
			const outcome = await sessionLifecycle.start({
				mode: "practice",
				deckId,
				direction: options.direction,
				selection:
					options.mode === "range"
						? {
								kind: "range",
								startIndex: options.startIndex,
								endIndex: options.endIndex,
							}
						: { kind: "random", questionCount: options.questionCount },
			});
			reportLifecycleOutcome(outcome, t("notice.deckEmpty"));
		},
		[reportLifecycleOutcome, sessionLifecycle, t],
	);

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
			setSpellingSetupDefaults(null);
			setViewState({ type: "spelling-setup", deckId });
		},
		[dataStore, settings.wordLearningDecks, t],
	);

	const handleStartSpelling = useCallback(
		async (deckId: string, options: SpellingSessionStartOptions) => {
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
			const outcome = await sessionLifecycle.start({
				mode: "spelling",
				deckId,
				selection:
					options.mode === "range"
						? {
								kind: "range",
								startIndex: options.startIndex,
								endIndex: options.endIndex,
							}
						: { kind: "smart", questionCount: options.questionCount },
			});
			reportLifecycleOutcome(outcome, t("notice.deckEmpty"));
		},
		[dataStore, reportLifecycleOutcome, sessionLifecycle, settings.wordLearningDecks, t],
	);

	const handleRetryIncorrect = useCallback(async () => {
		const result = sessionLifecycle.getSnapshot();
		if (result.kind !== "result") return;
		const outcome = await sessionLifecycle.act(result.reference, {
			kind: "retry-incorrect",
		});
		reportLifecycleOutcome(outcome);
	}, [reportLifecycleOutcome, sessionLifecycle]);

	const handleResultRestart = useCallback(async () => {
		const result = sessionLifecycle.getSnapshot();
		if (result.kind !== "result") return;
		const defaults = result.setupDefaults;
		const outcome = await sessionLifecycle.act(result.reference, { kind: "dismiss" });
		if (!reportLifecycleOutcome(outcome)) return;
		if (defaults.selection.kind === "study-day") {
			if (defaults.mode === "practice") {
				setStudySetupDefaults({
					deckId: defaults.deckId,
					studyOrder: defaults.selection.studyOrder,
					direction: defaults.direction,
				});
			}
			setViewState({ type: "study-setup", deckId: defaults.deckId });
			return;
		}
		if (defaults.mode === "practice") {
			setPracticeSetupDefaults(
				defaults.selection.kind === "range"
					? {
							mode: "range",
							startIndex: defaults.selection.startIndex,
							endIndex: defaults.selection.endIndex,
							direction: defaults.direction,
						}
					: {
							mode: "random-count",
							questionCount: defaults.selection.questionCount,
							direction: defaults.direction,
						},
			);
			setViewState({ type: "practice-setup", deckId: defaults.deckId });
			return;
		}
		setSpellingSetupDefaults(
			defaults.selection.kind === "range"
				? {
						mode: "range",
						startIndex: defaults.selection.startIndex,
						endIndex: defaults.selection.endIndex,
					}
				: { mode: "smart", questionCount: defaults.selection.questionCount },
		);
		setViewState({ type: "spelling-setup", deckId: defaults.deckId });
	}, [reportLifecycleOutcome, sessionLifecycle]);

	const handleResultHome = useCallback(async () => {
		const result = sessionLifecycle.getSnapshot();
		if (result.kind !== "result") return;
		const outcome = await sessionLifecycle.act(result.reference, { kind: "dismiss" });
		if (reportLifecycleOutcome(outcome)) setViewState({ type: "home" });
	}, [reportLifecycleOutcome, sessionLifecycle]);

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
				"danger",
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
		if (presentedLifecycleSnapshot.kind === "active") {
			if (presentedLifecycleSnapshot.mode === "study") {
				return (
					<CardView
						lifecycle={sessionLifecycle}
						session={presentedLifecycleSnapshot}
						holdPresentation={holdLifecyclePresentation}
						onComplete={() => setViewState({ type: "home" })}
						onEditCard={handleOpenEditCard}
						onDeleteCard={handleDeleteCardRequest}
						onClose={() => void handleExitActive("study")}
						markdownRenderer={renderMarkdown}
						pronunciationRuntime={pronunciationRuntime}
						pronunciationEnabled={Boolean(
							settings.wordLearningDecks[
								presentedLifecycleSnapshot.currentCard.currentDeckId
							],
						)}
					/>
				);
			}
			if (presentedLifecycleSnapshot.mode === "practice") {
				return (
					<PracticeView
						lifecycle={sessionLifecycle}
						session={presentedLifecycleSnapshot}
						holdPresentation={holdLifecyclePresentation}
						onEditCard={handleOpenEditCard}
						onDeleteCard={handleDeleteCardRequest}
						onClose={() => void handleExitActive("practice")}
						markdownRenderer={renderMarkdown}
						pronunciationRuntime={pronunciationRuntime}
						pronunciationEnabled={Boolean(
							settings.wordLearningDecks[
								presentedLifecycleSnapshot.currentCard.currentDeckId
							],
						)}
					/>
				);
			}
			return (
				<SpellingView
					lifecycle={sessionLifecycle}
					session={presentedLifecycleSnapshot}
					holdPresentation={holdLifecyclePresentation}
					onEditCard={handleOpenEditCard}
					onDeleteCard={handleDeleteCardRequest}
					onClose={() => void handleExitActive("spelling")}
					markdownRenderer={renderMarkdown}
					pronunciationRuntime={pronunciationRuntime}
				/>
			);
		}

		if (presentedLifecycleSnapshot.kind === "result") {
			return presentedLifecycleSnapshot.mode === "practice" ? (
				<PracticeSummary
					result={presentedLifecycleSnapshot}
					onRestart={() => void handleResultRestart()}
					onPracticeIncorrect={() => void handleRetryIncorrect()}
					onHome={() => void handleResultHome()}
					markdownRenderer={renderMarkdown}
				/>
			) : (
				<SpellingSummary
					result={presentedLifecycleSnapshot}
					onRetryIncorrect={() => void handleRetryIncorrect()}
					onRestart={() => void handleResultRestart()}
					onHome={() => void handleResultHome()}
					markdownRenderer={renderMarkdown}
				/>
			);
		}

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
						defaultStudyOrder={
							studySetupDefaults?.deckId === viewState.deckId
								? studySetupDefaults.studyOrder
								: effectiveSettings.studyOrder
						}
						defaultDirection={
							studySetupDefaults?.deckId === viewState.deckId
								? studySetupDefaults.direction
								: "normal"
						}
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

			case "practice-setup": {
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) {
					return renderHome();
				}
				return (
					<PracticeSetup
						key={deck.id}
						deck={deck}
						defaultDirection={practiceSetupDefaults?.direction ?? "normal"}
						defaultOptions={practiceSetupDefaults ?? undefined}
						onStartPractice={(options) =>
							handleStartPractice(viewState.deckId, options)
						}
						onBack={handleBackHome}
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
						stats={getSpellingDeckProgressStats(
							deck.cards,
							dataStore.getSpellingProgress(),
						)}
						defaultOptions={spellingSetupDefaults ?? undefined}
						onStart={(options) => handleStartSpelling(deck.id, options)}
						onBack={handleBackHome}
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
			<ModalProvider host={modalHost}>
				{renderContent()}
				{cardEditor && (
					<CardEditorModal
						mode={cardEditor.mode}
						decks={decks}
						initialDeckId={cardEditor.deckId}
						initialFront={cardEditor.mode === "edit" ? cardEditor.front : ""}
						initialBack={cardEditor.mode === "edit" ? cardEditor.back : ""}
						initialExplanation={
							cardEditor.mode === "edit" ? cardEditor.explanation : ""
						}
						onSave={handleSaveCardEditor}
						onClose={handleCloseCardEditor}
					/>
				)}
				{confirmation && (
					<ConfirmDialog
						title={confirmation.title}
						message={confirmation.message}
						confirmText={confirmation.confirmText}
						cancelText={t("common.cancel")}
						kicker={t("common.confirmAction")}
						tone={confirmation.tone}
						onConfirm={handleConfirmDialogConfirm}
						onCancel={handleConfirmDialogCancel}
					/>
				)}
			</ModalProvider>
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
