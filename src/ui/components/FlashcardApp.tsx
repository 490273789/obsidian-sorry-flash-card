import React, {
	useState,
	useCallback,
	useRef,
	useMemo,
	useReducer,
	useEffect,
	useSyncExternalStore,
} from "react";
import { App, ButtonComponent, Component, MarkdownRenderer, Modal, Notice, TFile } from "obsidian";
import {
	ViewState,
	FlashcardSettings,
	StudySettings,
	StudySession,
	PracticeSession,
	PracticeResult,
	CardDirection,
} from "../../shared/types";
import { DataStore } from "../../storage/dataStore";
import { createDeckHomeRuntime } from "../../decks/deckHomeRuntime";
import {
	createPracticeSessionRuntime,
	type PracticeSessionStartOptions,
} from "../../sessions/practiceSessionRuntime";
import { createStudySessionRuntime } from "../../sessions/studySessionRuntime";
import { DeckList } from "./DeckList";
import { CardView } from "./CardView";
import { PracticeSetup } from "./PracticeSetup";
import { PracticeView } from "./PracticeView";
import { PracticeSummary } from "./PracticeSummary";
import { WordListView } from "./WordListView";
import { StudySetup } from "./StudySetup";
import { StatsView } from "./StatsView";
import { I18nProvider } from "./I18nContext";
import { createTranslator } from "../../i18n";
import { CardEditorModal, type CardEditorSavePayload } from "./CardEditorModal";
import type {
	CardChangeOutcome,
	CardIdentityContinuity,
} from "../../identity/cardIdentityContinuity";
import type { ActiveSessionStore } from "../../sessions/activeSessionStore";

interface FlashcardAppProps {
	app: App;
	dataStore: DataStore;
	cardIdentityContinuity: CardIdentityContinuity;
	activeSessionStore: ActiveSessionStore;
	settings: FlashcardSettings;
	onSaveSettings: (settings: FlashcardSettings) => Promise<void>;
	onRefresh: () => Promise<void>;
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

export const FlashcardApp: React.FC<FlashcardAppProps> = ({
	app,
	dataStore,
	cardIdentityContinuity,
	activeSessionStore,
	settings,
	onSaveSettings,
	onRefresh,
}) => {
	const t = useMemo(() => createTranslator(settings.language), [settings.language]);
	const [viewState, setViewState] = useState<ViewState>({ type: "home" });
	const activeSessions = useSyncExternalStore(
		(listener) => activeSessionStore.subscribe(listener),
		() => activeSessionStore.getSnapshot(),
		() => activeSessionStore.getSnapshot(),
	);
	const { studySession, practiceSession, practiceResult } = activeSessions;
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
	const studyRuntime = useMemo(() => createStudySessionRuntime(dataStore), [dataStore]);
	const practiceRuntime = useMemo(() => createPracticeSessionRuntime(dataStore), [dataStore]);

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

	const handleOpenEditCard = useCallback(
		(deckId: string, cardId: string) => {
			const card = dataStore.getCard(deckId, cardId);
			if (!card) {
				new Notice(t("notice.cardMissing"));
				return;
			}
			setCardEditor({
				mode: "edit",
				deckId,
				cardId,
				front: card.front,
				back: card.back,
				explanation: card.explanation ?? "",
			});
		},
		[dataStore, t],
	);

	const handleCloseCardEditor = useCallback(() => {
		setCardEditor(null);
	}, []);

	const handleSaveCardEditor = useCallback(
		async ({ deckId, front, back, explanation }: CardEditorSavePayload) => {
			if (!cardEditor) return;

			try {
				const outcome =
					cardEditor.mode === "edit"
						? await cardIdentityContinuity.change({
								kind: "edit",
								cardIdentity: cardEditor.cardId,
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
		[cardEditor, cardIdentityContinuity, t],
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

	const handleDeleteCard = useCallback(
		async (deckId: string, cardId: string) => {
			const confirmed = await confirmAction(
				t("cardEditor.deleteCurrentTitle"),
				t("cardEditor.deleteConfirm"),
				t("settings.delete"),
			);
			if (!confirmed) return;

			try {
				const outcome = await cardIdentityContinuity.change({
					kind: "delete",
					cardIdentity: cardId,
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
		[cardIdentityContinuity, confirmAction, t],
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

	const handleUpdateDeckStudySettings = useCallback(
		async (deckId: string, overrides: Partial<StudySettings> | null) => {
			const newDeckStudySettings = {
				...settings.deckStudySettings,
			};
			if (overrides === null) {
				delete newDeckStudySettings[deckId];
			} else {
				newDeckStudySettings[deckId] = overrides;
			}
			await onSaveSettings({
				...settings,
				deckStudySettings: newDeckStudySettings,
			});
		},
		[onSaveSettings, settings],
	);

	const renderHome = () => (
		<DeckList
			snapshot={deckHomeSnapshot}
			settings={settings}
			onSelectDeck={handleSelectDeck}
			onOpenWordList={handleOpenWordList}
			onStartPractice={handleStartPracticeSetup}
			onRefresh={async () => {
				await onRefresh();
				bumpSnapshotVersion();
			}}
			onUpdateDeckStudySettings={handleUpdateDeckStudySettings}
			onOpenSourceFile={handleOpenSourceFile}
			onOpenStats={handleOpenStats}
			onOpenAddCard={handleOpenAddCard}
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
