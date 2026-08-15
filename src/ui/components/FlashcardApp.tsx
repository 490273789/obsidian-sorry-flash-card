import React, {
	useState,
	useCallback,
	useRef,
	useMemo,
	useEffect,
	useId,
	useSyncExternalStore,
} from "react";
import { App, Component, MarkdownRenderer, Notice, TFile } from "obsidian";
import { ViewState, FlashcardSettings, CardDirection } from "../../shared/types";
import { DataStore } from "../../storage/dataStore";
import type { DeckHome, DeckHomeDestination, DeckHomeOutcome } from "../../decks/deckHome";
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
} from "../../identity/cardIdentityContinuity";
import {
	shouldAutoPronounceSpellingFeedback,
	waitForSpellingPronunciation,
	type PronunciationRuntime,
} from "../../pronunciation";
import { ModalProvider } from "../modal";
import { createAnswerPresentationTransition } from "../answerPresentationTransition";

interface FlashcardAppProps {
	app: App;
	modalHost: HTMLElement;
	dataStore: DataStore;
	cardIdentityContinuity: CardIdentityContinuity;
	sessionLifecycle: SessionLifecycle;
	pronunciationRuntime: PronunciationRuntime;
	deckHome: DeckHome;
	settings: FlashcardSettings;
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
	deckHome,
	settings,
	onOpenSettings,
}) => {
	const deckHomeOwnerId = useId();
	const t = useMemo(() => createTranslator(settings.language), [settings.language]);
	const [viewState, setViewState] = useState<ViewState>({ type: "home" });
	const answerPresentationTransition = useMemo(
		() =>
			createAnswerPresentationTransition({
				lifecycle: sessionLifecycle,
				prepareSpellingAdvance: async (feedback) => {
					const autoPlay = pronunciationRuntime.getSnapshot().settings.spellingAutoPlay;
					if (autoPlay && shouldAutoPronounceSpellingFeedback(feedback.kind)) {
						await waitForSpellingPronunciation(
							pronunciationRuntime,
							feedback.expectedAnswer,
						);
						return 0;
					}
					return 550;
				},
			}),
		[pronunciationRuntime, sessionLifecycle],
	);
	const subscribeAnswerPresentation = useCallback(
		(listener: () => void) => answerPresentationTransition.subscribe(listener),
		[answerPresentationTransition],
	);
	const readAnswerPresentation = useCallback(
		() => answerPresentationTransition.getSnapshot(),
		[answerPresentationTransition],
	);
	const answerPresentationSnapshot = useSyncExternalStore(
		subscribeAnswerPresentation,
		readAnswerPresentation,
		readAnswerPresentation,
	);
	const presentedLifecycleSnapshot = answerPresentationSnapshot.lifecycle;
	const isAnswerTransitioning = answerPresentationSnapshot.activity.kind === "transitioning";
	// Subscribe to the data store revision so cached derivations (decks array,
	// rendered markdown) stay fresh without recomputing on unrelated renders.
	const subscribeRevision = useCallback(
		(listener: () => void) => dataStore.subscribe(listener),
		[dataStore],
	);
	const readRevision = useCallback(() => dataStore.getRevision(), [dataStore]);
	const revision = useSyncExternalStore(subscribeRevision, readRevision, readRevision);
	const lifecycleSnapshot = useSyncExternalStore(
		(listener) => sessionLifecycle.subscribe(listener),
		() => sessionLifecycle.getSnapshot(),
		() => sessionLifecycle.getSnapshot(),
	);
	useEffect(() => {
		if (lifecycleSnapshot.kind !== "idle" || !lifecycleSnapshot.lastEnd) return;
		new Notice(t("identity.sessionEndedBySourceChange"));
		setViewState({ type: "home" });
		void sessionLifecycle.act(lifecycleSnapshot.reference, {
			kind: "acknowledge-end",
			noticeId: lifecycleSnapshot.lastEnd.id,
		});
	}, [lifecycleSnapshot, sessionLifecycle, t]);
	const subscribeDeckHome = useCallback(
		(listener: () => void) => deckHome.subscribe(listener),
		[deckHome],
	);
	const readDeckHomeSnapshot = useCallback(() => deckHome.getSnapshot(), [deckHome]);
	const deckHomeSnapshot = useSyncExternalStore(
		subscribeDeckHome,
		readDeckHomeSnapshot,
		readDeckHomeSnapshot,
	);
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

	// Cache the decks array across renders; only recompute when the store
	// revision changes (any card/setting mutation bumps it).
	const decks = useMemo(() => {
		// Consume revision so the cache is invalidated on store changes.
		void revision;
		return dataStore.getAllDecks();
	}, [dataStore, revision]);

	// Reuse a single Component for every Markdown render and unload it when the
	// app unmounts, instead of allocating a new Component per card.
	const markdownComponentRef = useRef<Component | null>(null);
	const renderMarkdown = useCallback(
		async (content: string, el: HTMLElement): Promise<void> => {
			if (!markdownComponentRef.current) {
				markdownComponentRef.current = new Component();
			}
			await MarkdownRenderer.render(app, content, el, "", markdownComponentRef.current);
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
				const nextConfirmation = {
					title,
					message,
					confirmText,
					tone,
					resolve,
				};
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
	useEffect(() => {
		return () => {
			markdownComponentRef.current?.unload();
			markdownComponentRef.current = null;
		};
	}, []);
	useEffect(() => {
		return () => {
			void deckHome.act({
				kind: "release-owner",
				ownerId: deckHomeOwnerId,
			});
		};
	}, [deckHome, deckHomeOwnerId]);

	const handleRequestHomeMigration = useCallback(
		async (deckId?: string): Promise<boolean> => {
			const request = await deckHome.act({
				kind: "request-migration",
				ownerId: deckHomeOwnerId,
				deckId,
			});
			if (request.kind !== "confirmation-required") {
				if (request.kind === "rejected" && request.reason === "migration-unavailable") {
					new Notice(t(deckId ? "identity.editNeedsMigration" : "identity.noMigration"));
				} else if (request.kind === "rejected" && request.reason === "busy") {
					new Notice(t("identity.sourceChanging"));
				}
				return false;
			}
			const confirmed = await confirmAction(
				t("identity.migrationTitle"),
				request.scope.kind === "all"
					? t("identity.migrationDescription", {
							sources: request.sourceCount,
							cards: request.cardCount,
						})
					: t("identity.editMigrationDescription", {
							deckName: request.deckName ?? request.scope.deckId,
							cards: request.cardCount,
						}),
				request.scope.kind === "all"
					? t("identity.migrateAllNow")
					: t("identity.migrateNow"),
			);
			const outcome = await deckHome.act({
				kind: "continue",
				ownerId: deckHomeOwnerId,
				continuation: request.continuation,
				confirmed,
			});
			return outcome.kind === "applied";
		},
		[confirmAction, deckHome, deckHomeOwnerId, t],
	);

	const ensureDeckEditable = useCallback(
		async (deckId: string): Promise<boolean> => {
			const condition = cardIdentityContinuity.inspect().sources[deckId];
			if (!condition || condition.type === "current") return true;
			if (condition.type === "last-known-good") {
				new Notice(t("identity.editNeedsRepair"));
				return false;
			}
			return handleRequestHomeMigration(deckId);
		},
		[cardIdentityContinuity, handleRequestHomeMigration, t],
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
				setCardEditor(null);
			} catch (error) {
				const message = error instanceof Error ? error.message : t("cardEditor.saveFailed");
				new Notice(t("notice.cardSaveFailed", { message }));
				throw error;
			}
		},
		[cardEditor, cardIdentityContinuity, dataStore, ensureDeckEditable, t],
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

	const reportDeckHomeOutcome = useCallback(
		(outcome: DeckHomeOutcome): boolean => {
			if (outcome.kind === "applied" || outcome.kind === "navigation") return true;
			if (outcome.kind !== "rejected") return false;
			if (outcome.reason === "deck-missing") {
				new Notice(t("notice.deckMissing"));
			} else if (outcome.reason === "deck-empty") {
				new Notice(t("notice.deckEmpty"));
			} else if (outcome.reason === "spelling-not-enabled") {
				new Notice(t("spelling.deckNotEnabled"));
			} else if (outcome.reason === "spelling-invalid") {
				new Notice(t("spelling.deckInvalid"));
			} else if (outcome.reason === "stable-card-identity-required") {
				new Notice(t("spelling.identityRequired"));
			}
			return false;
		},
		[t],
	);

	const handleHomeNavigate = useCallback(
		(destination: DeckHomeDestination, deckId: string): void => {
			void (async () => {
				const outcome = await deckHome.act({
					kind: "navigate",
					destination,
					deckId,
				});
				if (outcome.kind !== "navigation") {
					reportDeckHomeOutcome(outcome);
					return;
				}
				if (destination === "study") {
					setStudySetupDefaults(null);
					setViewState({ type: "study-setup", deckId });
				} else if (destination === "practice") {
					setPracticeSetupDefaults(null);
					setViewState({ type: "practice-setup", deckId });
				} else if (destination === "spelling") {
					setSpellingSetupDefaults(null);
					setViewState({ type: "spelling-setup", deckId });
				} else {
					wordListStartTime.current = Date.now();
					setViewState({ type: "word-list", deckId });
				}
			})();
		},
		[deckHome, reportDeckHomeOutcome],
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
			const outcome = await sessionLifecycle.start({
				mode: "spelling",
				deckId,
				selection: { kind: "study-day", dayIndex },
			});
			reportLifecycleOutcome(outcome, t("spelling.dayInvalid"));
		},
		[reportLifecycleOutcome, sessionLifecycle, t],
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
			const outcome = await sessionLifecycle.act(active.reference, {
				kind: "exit",
			});
			if (reportLifecycleOutcome(outcome)) setViewState({ type: "home" });
		},
		[confirmAction, reportLifecycleOutcome, sessionLifecycle, t],
	);

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

	// Stable callbacks for view components so React.memo can skip re-renders
	// when unrelated state (card editor, dialogs) changes.
	const handleSessionComplete = useCallback(() => {
		setViewState({ type: "home" });
	}, []);
	const handleExitStudy = useCallback(() => void handleExitActive("study"), [handleExitActive]);
	const handleExitPractice = useCallback(
		() => void handleExitActive("practice"),
		[handleExitActive],
	);
	const handleExitSpelling = useCallback(
		() => void handleExitActive("spelling"),
		[handleExitActive],
	);
	const handleCloseWordListForDeck = useCallback(
		(deckId: string) => handleCloseWordList(deckId),
		[handleCloseWordList],
	);

	// Practice mode handlers
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
						: {
								kind: "random",
								questionCount: options.questionCount,
							},
			});
			reportLifecycleOutcome(outcome, t("notice.deckEmpty"));
		},
		[reportLifecycleOutcome, sessionLifecycle, t],
	);

	const handleStartSpelling = useCallback(
		async (deckId: string, options: SpellingSessionStartOptions) => {
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
						: {
								kind: "smart",
								questionCount: options.questionCount,
							},
			});
			reportLifecycleOutcome(outcome, t("notice.deckEmpty"));
		},
		[reportLifecycleOutcome, sessionLifecycle, t],
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
		const outcome = await sessionLifecycle.act(result.reference, {
			kind: "dismiss",
		});
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
				: {
						mode: "smart",
						questionCount: defaults.selection.questionCount,
					},
		);
		setViewState({ type: "spelling-setup", deckId: defaults.deckId });
	}, [reportLifecycleOutcome, sessionLifecycle]);

	const handleResultHome = useCallback(async () => {
		const result = sessionLifecycle.getSnapshot();
		if (result.kind !== "result") return;
		const outcome = await sessionLifecycle.act(result.reference, {
			kind: "dismiss",
		});
		if (reportLifecycleOutcome(outcome)) setViewState({ type: "home" });
	}, [reportLifecycleOutcome, sessionLifecycle]);

	// Stable summary/setup handlers so memoized views skip unrelated re-renders.
	const handlePracticeRestart = useCallback(
		() => void handleResultRestart(),
		[handleResultRestart],
	);
	const handlePracticeRetryIncorrect = useCallback(
		() => void handleRetryIncorrect(),
		[handleRetryIncorrect],
	);
	const handleResultHomeClick = useCallback(() => void handleResultHome(), [handleResultHome]);
	const handleStudyStart = useCallback(
		(order: "sequential" | "random", direction: CardDirection) => {
			if (viewState.type !== "study-setup") return;
			void handleStartStudyFromSetup(viewState.deckId, order, direction);
		},
		[handleStartStudyFromSetup, viewState],
	);
	const handleStudyDayStart = useCallback(
		(dayIndex: number, order: "sequential" | "random", direction: CardDirection) => {
			if (viewState.type !== "study-setup") return;
			void handleStudyDay(viewState.deckId, dayIndex, order, direction);
		},
		[handleStudyDay, viewState],
	);
	const handleStudyDaySpelling = useCallback(
		(dayIndex: number) => {
			if (viewState.type !== "study-setup") return;
			void handleSpellingDay(viewState.deckId, dayIndex);
		},
		[handleSpellingDay, viewState],
	);
	const handlePracticeStart = useCallback(
		(options: PracticeSessionStartOptions) => {
			if (viewState.type !== "practice-setup") return;
			void handleStartPractice(viewState.deckId, options);
		},
		[handleStartPractice, viewState],
	);
	const handleSpellingStart = useCallback(
		(options: SpellingSessionStartOptions) => {
			if (viewState.type !== "spelling-setup") return;
			void handleStartSpelling(viewState.deckId, options);
		},
		[handleStartSpelling, viewState],
	);
	const handleWordListBack = useCallback(() => {
		if (viewState.type !== "word-list") return;
		handleCloseWordListForDeck(viewState.deckId);
	}, [handleCloseWordListForDeck, viewState]);

	// Cached derived data keyed on the store revision.
	const studyHistory = useMemo(() => {
		void revision;
		return dataStore.getStudyHistory();
	}, [dataStore, revision]);
	const spellingSetupStats = useMemo(() => {
		void revision;
		if (viewState.type !== "spelling-setup") return null;
		const deck = dataStore.getDeck(viewState.deckId);
		if (!deck) return null;
		return getSpellingDeckProgressStats(deck.cards, dataStore.getSpellingProgress());
	}, [dataStore, revision, viewState]);

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

	const renderHome = () => (
		<DeckList
			snapshot={deckHomeSnapshot}
			home={deckHome}
			ownerId={deckHomeOwnerId}
			onNavigate={handleHomeNavigate}
			onRequestMigration={handleRequestHomeMigration}
			onOpenSourceFile={handleOpenSourceFile}
			onOpenStats={handleOpenStats}
			onOpenSettings={onOpenSettings}
			onOpenAddCard={handleOpenAddCard}
		/>
	);

	const renderContent = (): React.ReactNode => {
		if (presentedLifecycleSnapshot.kind === "active") {
			if (presentedLifecycleSnapshot.mode === "study") {
				return (
					<CardView
						session={presentedLifecycleSnapshot}
						transition={answerPresentationTransition}
						isTransitioning={isAnswerTransitioning}
						onComplete={handleSessionComplete}
						onEditCard={handleOpenEditCard}
						onDeleteCard={handleDeleteCardRequest}
						onClose={handleExitStudy}
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
						session={presentedLifecycleSnapshot}
						transition={answerPresentationTransition}
						isTransitioning={isAnswerTransitioning}
						onEditCard={handleOpenEditCard}
						onDeleteCard={handleDeleteCardRequest}
						onClose={handleExitPractice}
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
					session={presentedLifecycleSnapshot}
					transition={answerPresentationTransition}
					isTransitioning={isAnswerTransitioning}
					feedback={answerPresentationSnapshot.spellingFeedback}
					onEditCard={handleOpenEditCard}
					onDeleteCard={handleDeleteCardRequest}
					onClose={handleExitSpelling}
					markdownRenderer={renderMarkdown}
					pronunciationRuntime={pronunciationRuntime}
				/>
			);
		}

		if (presentedLifecycleSnapshot.kind === "result") {
			return presentedLifecycleSnapshot.mode === "practice" ? (
				<PracticeSummary
					result={presentedLifecycleSnapshot}
					onRestart={handlePracticeRestart}
					onPracticeIncorrect={handlePracticeRetryIncorrect}
					onHome={handleResultHomeClick}
					markdownRenderer={renderMarkdown}
				/>
			) : (
				<SpellingSummary
					result={presentedLifecycleSnapshot}
					onRetryIncorrect={handlePracticeRetryIncorrect}
					onRestart={handlePracticeRestart}
					onHome={handleResultHomeClick}
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
						onStart={handleStudyStart}
						onStartDay={handleStudyDayStart}
						spellingEnabled={Boolean(settings.wordLearningDecks[viewState.deckId])}
						onStartDaySpelling={handleStudyDaySpelling}
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
						onStartPractice={handlePracticeStart}
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
						stats={
							spellingSetupStats ??
							getSpellingDeckProgressStats(
								deck.cards,
								dataStore.getSpellingProgress(),
							)
						}
						defaultOptions={spellingSetupDefaults ?? undefined}
						onStart={handleSpellingStart}
						onBack={handleBackHome}
					/>
				);
			}

			case "word-list": {
				const deck = dataStore.getDeck(viewState.deckId);
				if (!deck) {
					return renderHome();
				}
				return <WordListView key={deck.id} deck={deck} onBack={handleWordListBack} />;
			}

			case "stats":
				return <StatsView history={studyHistory} onBack={handleBackHome} />;

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
