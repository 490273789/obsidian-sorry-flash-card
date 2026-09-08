# Shared Layout Components

## FlashcardApp (Root App Shell & View Switcher)

- File: `src/ui/FlashcardApp.tsx`
- Description: Root container handling view state transitions, session lifecycle and modal hosting

```tsx
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
import { ViewState, FlashcardSettings } from "../shared/types";
import type { DeckHome, DeckHomeDestination, DeckHomeOutcome } from "../decks/deckHome";
import {
	getRestartViewState,
	type LifecycleOutcome,
	type SessionLifecycle,
	type SessionStartRequest,
} from "../sessions/sessionLifecycle";
import {
	getStudySetupPlan,
	getPracticeSetupPlan,
	getSpellingSetupPlan,
} from "../sessions/sessionPlanner";
import { DeckList } from "./views/Home";
import { CardView, CardEditorModal, type CardEditorSavePayload } from "./views/Card";
import { PracticeSetup, PracticeView, PracticeSummary } from "./views/Practice";
import { WordListView } from "./views/WordList";
import { StudySetup } from "./views/Study";
import { StatsView } from "./views/Stats";
import { SpellingSetup, SpellingView, SpellingSummary } from "./views/Spelling";
import { I18nProvider } from "./context/I18nContext";
import { createTranslator } from "../i18n";
import { ConfirmDialog, type ConfirmDialogTone } from "./primitives/ConfirmDialog";
import type { CardIdentityContinuity } from "../identity/cardIdentityContinuity";
import {
	executeCardMutationWorkflow,
	type CardMutationRequest,
} from "../identity/cardMutationWorkflow";
import type { PronunciationRuntime } from "../pronunciation";
import { ModalProvider } from "./primitives/Modal";
import { createAnswerPresentationTransition } from "./answerPresentationTransition";

interface FlashcardAppProps {
	app: App;
	modalHost: HTMLElement;
	sessionLifecycle: SessionLifecycle;
	cardIdentityContinuity: CardIdentityContinuity;
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
				pronunciationRuntime,
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

	// Mobile/iPad: prevent iOS WebKit from scrolling window/document when focusing inputs
	useEffect(() => {
		const ownerWindow = modalHost.ownerDocument.defaultView ?? window;
		const ownerDoc = modalHost.ownerDocument;

		const resetWindowScroll = () => {
			if (ownerWindow.scrollY > 0 || ownerWindow.scrollX > 0) {
				ownerWindow.scrollTo({ top: 0, left: 0, behavior: "instant" });
			}
			if (ownerDoc.body && ownerDoc.body.scrollTop > 0) {
				ownerDoc.body.scrollTop = 0;
			}
			if (ownerDoc.documentElement && ownerDoc.documentElement.scrollTop > 0) {
				ownerDoc.documentElement.scrollTop = 0;
			}
		};

		const handleFocusIn = (event: FocusEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.tagName === "SELECT")
			) {
				ownerWindow.requestAnimationFrame(resetWindowScroll);
				ownerWindow.setTimeout(resetWindowScroll, 50);
				ownerWindow.setTimeout(resetWindowScroll, 200);
			}
		};

		const handleFocusOut = () => {
			ownerWindow.requestAnimationFrame(resetWindowScroll);
		};

		ownerWindow.addEventListener("scroll", resetWindowScroll, { passive: true });
		ownerDoc.addEventListener("focusin", handleFocusIn);
		ownerDoc.addEventListener("focusout", handleFocusOut);

		const viewport = ownerWindow.visualViewport;
		viewport?.addEventListener("resize", resetWindowScroll);
		viewport?.addEventListener("scroll", resetWindowScroll);

		return () => {
			ownerWindow.removeEventListener("scroll", resetWindowScroll);
			ownerDoc.removeEventListener("focusin", handleFocusIn);
			ownerDoc.removeEventListener("focusout", handleFocusOut);
			viewport?.removeEventListener("resize", resetWindowScroll);
			viewport?.removeEventListener("scroll", resetWindowScroll);
		};
	}, [modalHost]);

	const [cardEditor, setCardEditor] = useState<CardEditorState | null>(null);
	const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
	const confirmationRef = useRef<ConfirmationState | null>(null);

	const renderMarkdown = useCallback(
		async (content: string, el: HTMLElement, component?: Component): Promise<void> => {
			await MarkdownRenderer.render(app, content, el, "", component ?? new Component());
		},
		[app],
	);

	const handleBackHome = useCallback(() => {
		setViewState({ type: "home" });
	}, []);

	const handleOpenStats = useCallback(() => {
		setViewState({ type: "stats" });
	}, []);

	const handleRecordWordListVisit = useCallback(
		(deckId: string, startTimeMs: number, endTimeMs: number) => {
			void deckHome.recordWordListVisit(deckId, startTimeMs, endTimeMs);
		},
		[deckHome],
	);

	const handleOpenAddCard = useCallback(() => {
		const firstDeck = deckHomeSnapshot.decks[0];
		if (!firstDeck) {
			new Notice(t("notice.noDecks"));
			return;
		}
		setCardEditor({
			mode: "create",
			deckId: firstDeck.id,
		});
	}, [deckHomeSnapshot.decks, t]);

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

	const handleOpenEditCard = useCallback(
		(deckId: string, cardId: string) => {
			void (async () => {
				const preparation = await cardIdentityContinuity.prepareEdit(deckId, cardId);
				if (preparation.kind === "not-found") {
					new Notice(t("notice.cardMissing"));
					return;
				}
				if (preparation.kind === "blocked") {
					if (preparation.reason === "migration-required") {
						await handleRequestHomeMigration(deckId);
					} else {
						new Notice(t("identity.editNeedsRepair"));
					}
					return;
				}

				setCardEditor({
					mode: "edit",
					deckId,
					cardId: preparation.card.id,
					front: preparation.card.front,
					back: preparation.card.back,
					explanation: preparation.card.explanation ?? "",
				});
			})();
		},
		[cardIdentityContinuity, handleRequestHomeMigration, t],
	);

	const handleSaveCardEditor = useCallback(
		async ({ deckId, front, back, explanation }: CardEditorSavePayload) => {
			if (!cardEditor) return;

			const request: CardMutationRequest =
				cardEditor.mode === "edit"
					? {
							kind: "edit",
							deckId: cardEditor.deckId,
							cardId: cardEditor.cardId,
							content: { front, back, explanation },
						}
					: {
							kind: "create",
							deckId,
							content: { front, back, explanation },
						};

			const outcome = await executeCardMutationWorkflow(cardIdentityContinuity, request, {
				language: settings.language,
				onRequestMigration: handleRequestHomeMigration,
				notify: (msg) => new Notice(msg),
				t,
			});

			if (outcome.kind === "applied") {
				setCardEditor(null);
			} else if (outcome.kind === "failed") {
				throw new Error(outcome.message);
			}
		},
		[cardEditor, cardIdentityContinuity, handleRequestHomeMigration, settings.language, t],
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
					setViewState({ type: "study-setup", deckId });
				} else if (destination === "practice") {
					setViewState({ type: "practice-setup", deckId });
				} else if (destination === "spelling") {
					setViewState({ type: "spelling-setup", deckId });
				} else {
					setViewState({ type: "word-list", deckId });
				}
			})();
		},
		[deckHome, reportDeckHomeOutcome],
	);

	const handleStartSession = useCallback(
		async (request: SessionStartRequest) => {
			const outcome = await sessionLifecycle.start(request);
			const fallbackNotice =
				request.mode === "study"
					? t("notice.todayComplete")
					: request.mode === "spelling" && request.selection.kind === "study-day"
						? t("spelling.dayInvalid")
						: t("notice.deckEmpty");
			reportLifecycleOutcome(outcome, fallbackNotice);
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
		const outcome = await sessionLifecycle.act(result.reference, {
			kind: "dismiss",
		});
		if (reportLifecycleOutcome(outcome)) {
			setViewState(getRestartViewState(result.setupDefaults));
		}
	}, [reportLifecycleOutcome, sessionLifecycle]);

	const handleResultHome = useCallback(async () => {
		const result = sessionLifecycle.getSnapshot();
		if (result.kind !== "result") return;
		const outcome = await sessionLifecycle.act(result.reference, {
			kind: "dismiss",
		});
		if (reportLifecycleOutcome(outcome)) setViewState({ type: "home" });
	}, [reportLifecycleOutcome, sessionLifecycle]);

	const handlePracticeRestart = useCallback(
		() => void handleResultRestart(),
		[handleResultRestart],
	);
	const handlePracticeRetryIncorrect = useCallback(
		() => void handleRetryIncorrect(),
		[handleRetryIncorrect],
	);
	const handleResultHomeClick = useCallback(() => void handleResultHome(), [handleResultHome]);

	// Cached derived data keyed on the store revision.
	const studyHistory = useMemo(() => {
		void deckHomeSnapshot.revision;
		if (viewState.type !== "stats") return null;
		return deckHome.getStudyHistory();
	}, [deckHome, deckHomeSnapshot.revision, viewState.type]);
	const practiceSetupPlan = useMemo(() => {
		void deckHomeSnapshot.revision;
		if (viewState.type !== "practice-setup") return null;
		const deck = deckHome.getDeck(viewState.deckId);
		if (!deck) return null;
		return getPracticeSetupPlan(deck, viewState.initialSelection);
	}, [deckHome, deckHomeSnapshot.revision, viewState]);
	const spellingSetupPlan = useMemo(() => {
		void deckHomeSnapshot.revision;
		if (viewState.type !== "spelling-setup") return null;
		const deck = deckHome.getDeck(viewState.deckId);
		if (!deck) return null;
		return getSpellingSetupPlan(
			deck,
			deckHome.getSpellingProgress(),
			viewState.initialSelection,
		);
	}, [deckHome, deckHomeSnapshot.revision, viewState]);

	const handleDeleteCard = useCallback(
		async (deckId: string, cardId: string) => {
			const confirmed = await confirmAction(
				t("cardEditor.deleteCurrentTitle"),
				t("cardEditor.deleteConfirm"),
				t("settings.delete"),
				"danger",
			);
			if (!confirmed) return;

			await executeCardMutationWorkflow(
				cardIdentityContinuity,
				{
					kind: "delete",
					deckId,
					cardId,
				},
				{
					language: settings.language,
					onRequestMigration: handleRequestHomeMigration,
					notify: (msg) => new Notice(msg),
					t,
				},
			);
		},
		[cardIdentityContinuity, confirmAction, handleRequestHomeMigration, settings.language, t],
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
				const deck = deckHome.getDeck(viewState.deckId);
				if (!deck) {
					return renderHome();
				}
				const effectiveSettings = deckHome.getEffectiveStudySettings(viewState.deckId);
				const plan = getStudySetupPlan(
					deck,
					effectiveSettings,
					new Date(),
					viewState.initialStudyOrder,
				);
				return (
					<StudySetup
						key={deck.id}
						deck={deck}
						plan={plan}
						defaultDirection={viewState.initialDirection ?? "normal"}
						spellingEnabled={Boolean(settings.wordLearningDecks[viewState.deckId])}
						onStartSession={handleStartSession}
						onBack={handleBackHome}
					/>
				);
			}

			case "practice-setup": {
				const deck = deckHome.getDeck(viewState.deckId);
				if (!deck) {
					return renderHome();
				}
				const plan =
					practiceSetupPlan ?? getPracticeSetupPlan(deck, viewState.initialSelection);
				return (
					<PracticeSetup
						key={deck.id}
						deck={deck}
						plan={plan}
						defaultDirection={viewState.initialDirection ?? "normal"}
						initialDirection={viewState.initialDirection}
						onStartSession={handleStartSession}
						onBack={handleBackHome}
					/>
				);
			}

			case "spelling-setup": {
				const deck = deckHome.getDeck(viewState.deckId);
				if (!deck) return renderHome();
				const plan =
					spellingSetupPlan ??
					getSpellingSetupPlan(
						deck,
						deckHome.getSpellingProgress(),
						viewState.initialSelection,
					);
				return (
					<SpellingSetup
						key={deck.id}
						deck={deck}
						plan={plan}
						onStartSession={handleStartSession}
						onBack={handleBackHome}
					/>
				);
			}

			case "word-list": {
				const deck = deckHome.getDeck(viewState.deckId);
				if (!deck) {
					return renderHome();
				}
				return (
					<WordListView
						key={deck.id}
						deck={deck}
						onBack={handleBackHome}
						onRecordVisit={(startTimeMs, endTimeMs) => {
							handleRecordWordListVisit(deck.id, startTimeMs, endTimeMs);
						}}
					/>
				);
			}

			case "stats":
				return <StatsView history={studyHistory ?? []} onBack={handleBackHome} />;

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
						decks={deckHomeSnapshot.decks}
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
```

## FlashcardHeader (Top Bar & Nav)

- File: `src/ui/primitives/Header/FlashcardHeader.tsx`
- Description: Header component providing breadcrumb/back navigation, title and action buttons

````tsx
import React from "react";
import { ArrowLeft, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FlashcardButton } from "../Button";
import { useI18n } from "../../context/I18nContext";

export type FlashcardHeaderStatTone = "blue" | "green" | "orange" | "purple" | "red";

export interface FlashcardHeaderStat {
	key: string;
	value: React.ReactNode;
	label: React.ReactNode;
	tone: FlashcardHeaderStatTone;
	icon?: LucideIcon;
}

export interface FlashcardHeaderProps {
	/** Icon displayed next to the title (optional). */
	icon?: LucideIcon;
	/** Main header title. */
	title: React.ReactNode;
	/** Compact badge displayed after the title (optional). */
	badge?: React.ReactNode;
	/** Content rendered to the left of the title (optional). */
	left?: React.ReactNode;
	/** Content rendered to the right of the title (optional). */
	right?: React.ReactNode;
	/** When provided, renders a back button on the left that calls this handler. */
	onBack?: () => void;
	/** Accessible label for the back/close button. */
	backTitle?: string;
	/** Extra CSS class names appended to the header. */
	className?: string;
	/** Optional statistics rendered directly below the title row. */
	stats?: FlashcardHeaderStat[];
}

/**
 * Shared compact page header.
 *
 * Desktop keeps the title at the leading edge and actions at the trailing edge.
 * Mobile navigation keeps the title centered and swaps the close icon for a back arrow.
 *
 * @example
 * ```tsx
 * <FlashcardHeader icon={Brain} title="Study" onBack={onBack} />
 * ```
 */
export const FlashcardHeader: React.FC<FlashcardHeaderProps> = ({
	icon: Icon,
	title,
	badge,
	left,
	right,
	onBack,
	backTitle,
	className = "",
	stats,
}) => {
	const { t } = useI18n();
	const navigationLabel = backTitle ?? t("common.back");
	const desktopBackButton = (
		<FlashcardButton
			preset="icon"
			icon={X}
			iconSize={18}
			onClick={onBack}
			title={navigationLabel}
			aria-label={navigationLabel}
		/>
	);
	const mobileBackButton = (
		<FlashcardButton
			preset="icon"
			icon={ArrowLeft}
			iconSize={20}
			onClick={onBack}
			title={navigationLabel}
			aria-label={navigationLabel}
		/>
	);
	const classes = [
		"flashcard-common-header",
		"flashcard-navigation-header",
		onBack ? "has-back" : "",
		className,
	]
		.filter(Boolean)
		.join(" ");

	const header = (
		<header className={classes}>
			<div className="flashcard-header-left">
				{onBack && <span className="flashcard-header-back-mobile">{mobileBackButton}</span>}
				{left}
			</div>
			<div className="flashcard-header-center">
				{Icon && <Icon size={18} />}
				<div className="flashcard-header-title-content">{title}</div>
				{badge && <span className="flashcard-header-badge">{badge}</span>}
			</div>
			<div className="flashcard-header-right">
				{right}
				{onBack && (
					<span className="flashcard-header-back-desktop">{desktopBackButton}</span>
				)}
			</div>
		</header>
	);

	if (!stats || stats.length === 0) return header;

	return (
		<div className="flashcard-page-header">
			{header}
			<div className="flashcard-header-overview">
				<ul className={`flashcard-header-stats columns-${stats.length}`}>
					{stats.map(({ key, value, label, tone, icon: StatIcon }) => (
						<li className="flashcard-header-stat" key={key}>
							{StatIcon && <StatIcon size={16} />}
							<span className={`flashcard-header-stat-value tone-${tone}`}>
								{value}
							</span>
							<span className="flashcard-header-stat-label">{label}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
};
````

## SessionToolbar (Bottom Bar)

- File: `src/ui/primitives/SessionToolbar/SessionToolbar.tsx`
- Description: Session action toolbar for card reviews, undo, and quick actions

```tsx
import React from "react";
import { ChevronDown, Pencil, Trash2, Volume2, VolumeX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FlashcardButton } from "../Button";
import { FlashcardHeader } from "../Header";
import { SessionTimer } from "../SessionTimer";
import { useI18n } from "../../context/I18nContext";

export interface SessionToolbarProps {
	deckName: string;
	statusIcon: LucideIcon;
	statusLabel: string;
	progress: string;
	progressPercent: number;
	startTime: number;
	onEdit: () => void;
	onDelete: () => void;
	onClose: () => void;
	editTitle: string;
	deleteTitle: string;
	closeTitle: string;
	autoPronunciation?: {
		enabled: boolean;
		onToggle: () => void;
		enableTitle: string;
		disableTitle: string;
	};
}

export const SessionToolbar: React.FC<SessionToolbarProps> = ({
	deckName,
	statusIcon: StatusIcon,
	statusLabel,
	progress,
	progressPercent,
	startTime,
	onEdit,
	onDelete,
	onClose,
	editTitle,
	deleteTitle,
	closeTitle,
	autoPronunciation,
}) => {
	const { t } = useI18n();
	const [areActionsOpen, setAreActionsOpen] = React.useState(false);
	const normalizedProgress = Math.min(Math.max(progressPercent, 0), 100);
	const actionMenuTitle = areActionsOpen
		? t("cardEditor.hideActions")
		: t("cardEditor.showActions");

	const handleToggleActions = React.useCallback(() => {
		setAreActionsOpen((isOpen) => !isOpen);
	}, []);

	const handleEdit = React.useCallback(() => {
		setAreActionsOpen(false);
		onEdit();
	}, [onEdit]);

	const handleDelete = React.useCallback(() => {
		setAreActionsOpen(false);
		onDelete();
	}, [onDelete]);

	const autoPronunciationTitle = autoPronunciation?.enabled
		? autoPronunciation.disableTitle
		: autoPronunciation?.enableTitle;

	return (
		<div className="flashcard-session-shell">
			<FlashcardHeader
				title={
					<div className="flashcard-session-identity">
						<span className="flashcard-deck-title">{deckName}</span>
						<span className="flashcard-badge">
							<StatusIcon size={14} /> {statusLabel}
						</span>
					</div>
				}
				onBack={onClose}
				backTitle={closeTitle}
			/>
			<div className="flashcard-session-toolbar">
				<div className="flashcard-session-progress" aria-label={t("study.progress")}>
					<span className="flashcard-session-progress-text">{progress}</span>
					<span className="flashcard-session-progress-track">
						<span
							className="flashcard-session-progress-fill"
							style={{ width: `${normalizedProgress}%` }}
						/>
					</span>
				</div>
				<div className="flashcard-session-metrics">
					<SessionTimer
						startTime={startTime}
						className="flashcard-timer flashcard-session-timer"
					/>
				</div>
				<div className={`flashcard-session-actions${areActionsOpen ? " is-open" : ""}`}>
					<FlashcardButton
						preset="icon"
						icon={ChevronDown}
						onClick={handleToggleActions}
						className="flashcard-session-actions-toggle"
						iconClassName="flashcard-session-actions-toggle-icon"
						title={actionMenuTitle}
						aria-label={actionMenuTitle}
						aria-expanded={areActionsOpen}
						active={areActionsOpen}
					/>
					{autoPronunciation && (
						<FlashcardButton
							preset="icon"
							icon={autoPronunciation.enabled ? Volume2 : VolumeX}
							onClick={autoPronunciation.onToggle}
							className="flashcard-session-action-item flashcard-session-auto-pronunciation"
							title={autoPronunciationTitle}
							aria-label={autoPronunciationTitle}
							aria-pressed={autoPronunciation.enabled}
							active={autoPronunciation.enabled}
						/>
					)}
					<FlashcardButton
						preset="icon"
						icon={Pencil}
						onClick={handleEdit}
						className="flashcard-session-action-item"
						title={editTitle}
						aria-label={editTitle}
					/>
					<FlashcardButton
						preset="icon"
						variant="danger"
						icon={Trash2}
						onClick={handleDelete}
						className="flashcard-session-action-item"
						title={deleteTitle}
						aria-label={deleteTitle}
					/>
				</div>
			</div>
		</div>
	);
};
```

## Modal Layout Wrapper

- File: `src/ui/primitives/Modal/Modal.tsx`
- Description: Standard modal layout frame with header, body and footer actions

```tsx
import React, {
	createContext,
	useCallback,
	useContext,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	canRequestModalClose,
	getModalFocusDestination,
	getModalLayer,
	registerModal,
	unregisterModal,
	type ModalId,
} from "./modalBehavior";

const FOCUSABLE_SELECTOR = [
	"button:not([disabled])",
	"[href]",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[contenteditable="true"]',
	'[tabindex]:not([tabindex="-1"])',
].join(", ");

const INITIAL_FOCUS_SELECTOR = "[data-modal-initial-focus]";
const INITIAL_FOCUS_PROPS = { "data-modal-initial-focus": "" } as const;

interface ModalContextValue {
	host: HTMLElement;
	stack: readonly ModalId[];
	register: (modalId: ModalId) => () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

interface ModalProviderProps {
	host: HTMLElement;
	children: React.ReactNode;
}

export function ModalProvider({ host, children }: ModalProviderProps) {
	const [stack, setStack] = useState<readonly ModalId[]>([]);
	const register = useCallback((modalId: ModalId) => {
		setStack((current) => registerModal(current, modalId));
		return () => {
			setStack((current) => unregisterModal(current, modalId));
		};
	}, []);
	const value = useMemo(() => ({ host, stack, register }), [host, register, stack]);

	return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

interface ModalControls {
	requestClose: () => void;
	initialFocusProps: typeof INITIAL_FOCUS_PROPS;
}

interface ModalSurfaceProps {
	children: (controls: ModalControls) => React.ReactNode;
	onRequestClose: () => void;
	isDismissible?: boolean;
	role?: "dialog" | "alertdialog";
	labelledBy: string;
	describedBy?: string;
	className?: string;
	backdropClassName?: string;
}

export function ModalSurface({
	children,
	onRequestClose,
	isDismissible = true,
	role = "dialog",
	labelledBy,
	describedBy,
	className,
	backdropClassName,
}: ModalSurfaceProps) {
	const context = useContext(ModalContext);
	if (!context) {
		throw new Error("ModalSurface must be rendered inside ModalProvider");
	}

	const modalId = useId();
	const panelRef = useRef<HTMLDivElement | null>(null);
	const [previouslyFocused] = useState(() =>
		asFocusableElement(context.host.ownerDocument.activeElement),
	);
	const hasActivatedRef = useRef(false);
	const restoreFrameRef = useRef<number | null>(null);
	const { host, register, stack } = context;
	const { index, isTopmost } = getModalLayer(stack, modalId);

	useLayoutEffect(() => register(modalId), [modalId, register]);

	useLayoutEffect(() => {
		if (!isTopmost) return;
		const panel = panelRef.current;
		if (!panel) return;
		if (!hasActivatedRef.current) {
			hasActivatedRef.current = true;
			focusInitialElement(panel);
			return;
		}
		if (!panel.contains(host.ownerDocument.activeElement)) {
			focusInitialElement(panel);
		}
	}, [host, isTopmost]);

	useLayoutEffect(() => {
		const ownerWindow = host.ownerDocument.defaultView;
		if (ownerWindow && restoreFrameRef.current !== null) {
			ownerWindow.cancelAnimationFrame(restoreFrameRef.current);
			restoreFrameRef.current = null;
		}
		return () => {
			if (!previouslyFocused) return;
			const restoreFocus = () => {
				if (previouslyFocused.isConnected) {
					previouslyFocused.focus({ preventScroll: true });
				}
			};
			if (ownerWindow) {
				restoreFrameRef.current = ownerWindow.requestAnimationFrame(() => {
					restoreFrameRef.current = null;
					restoreFocus();
				});
			} else {
				restoreFocus();
			}
		};
	}, [host, previouslyFocused]);

	const requestClose = useCallback(() => {
		if (canRequestModalClose(isTopmost, isDismissible)) {
			onRequestClose();
		}
	}, [isDismissible, isTopmost, onRequestClose]);

	const handleBackdropClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (event.target === event.currentTarget) requestClose();
		},
		[requestClose],
	);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (!isTopmost) return;
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				requestClose();
				return;
			}
			if (event.key !== "Tab") return;

			const panel = panelRef.current;
			if (!panel) return;
			const focusable = getFocusableElements(panel);
			const activeIndex = focusable.indexOf(host.ownerDocument.activeElement as HTMLElement);
			const destination = getModalFocusDestination(
				focusable.length,
				activeIndex,
				event.shiftKey,
			);
			if (destination === null) return;

			event.preventDefault();
			const target =
				destination === "container"
					? panel
					: destination === "first"
						? focusable[0]
						: focusable[focusable.length - 1];
			target?.focus({ preventScroll: true });
		},
		[host, isTopmost, requestClose],
	);

	const controls = useMemo(
		() => ({ requestClose, initialFocusProps: INITIAL_FOCUS_PROPS }),
		[requestClose],
	);
	const layerIndex = Math.max(index, 0);
	const backdropClasses = ["flashcard-modal-backdrop", backdropClassName]
		.filter(Boolean)
		.join(" ");
	const panelClasses = ["flashcard-modal", className].filter(Boolean).join(" ");

	return createPortal(
		// oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Backdrop click is supplemental; keyboard dismissal is handled by the dialog.
		<div
			className={backdropClasses}
			onClick={handleBackdropClick}
			aria-hidden={isTopmost ? undefined : true}
			inert={isTopmost ? undefined : true}
			style={{ zIndex: 999 + layerIndex }}
			role="presentation"
		>
			{/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- The runtime role is always dialog or alertdialog. */}
			<div
				ref={panelRef}
				className={panelClasses}
				role={role}
				aria-modal="true"
				aria-labelledby={labelledBy}
				aria-describedby={describedBy}
				tabIndex={-1}
				onKeyDown={handleKeyDown}
			>
				{children(controls)}
			</div>
		</div>,
		host,
	);
}

function focusInitialElement(panel: HTMLElement): void {
	const focusable = getFocusableElements(panel);
	const marked = panel.querySelector<HTMLElement>(INITIAL_FOCUS_SELECTOR);
	const initialFocus = marked && focusable.includes(marked) ? marked : (focusable[0] ?? panel);
	initialFocus.focus({ preventScroll: true });
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(element) =>
			!element.hidden &&
			element.getAttribute("aria-hidden") !== "true" &&
			element.getAttribute("type") !== "hidden" &&
			!element.closest("[inert]"),
	);
}

function asFocusableElement(element: Element | null): HTMLElement | null {
	if (!element || typeof (element as HTMLElement).focus !== "function") return null;
	return element as HTMLElement;
}
```
