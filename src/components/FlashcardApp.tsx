import React, { useState, useCallback, useRef, useMemo } from "react";
import { App, Component, MarkdownRenderer, Notice, TFile } from "obsidian";
import {
	ViewState,
	FlashcardSettings,
	StudySettings,
	StudySession,
	PracticeSession,
	PracticeResult,
} from "../types";
import { DataStore } from "../dataStore";
import { shuffleArray } from "../utils";
import { DeckList } from "./DeckList";
import { CardView } from "./CardView";
import { PracticeSetup } from "./PracticeSetup";
import { PracticeView } from "./PracticeView";
import { PracticeSummary } from "./PracticeSummary";
import { WordListView } from "./WordListView";
import { StudySetup } from "./StudySetup";
import { StatsView } from "./StatsView";
import { I18nProvider } from "./I18nContext";
import { createTranslator } from "../i18n";
import {
	CardEditorModal,
	type CardEditorSavePayload,
} from "./CardEditorModal";

interface FlashcardAppProps {
	app: App;
	dataStore: DataStore;
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
			question: string;
			answer: string;
	  };

export const FlashcardApp: React.FC<FlashcardAppProps> = ({
	app,
	dataStore,
	settings,
	onSaveSettings,
	onRefresh,
}) => {
	const t = useMemo(
		() => createTranslator(settings.language),
		[settings.language],
	);
	const [viewState, setViewState] = useState<ViewState>({ type: "home" });
	const [studySession, setStudySession] = useState<StudySession | null>(null);
	const [practiceSession, setPracticeSession] =
		useState<PracticeSession | null>(null);
	const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(
		null,
	);
	const [contentVersion, setContentVersion] = useState(0);
	const [cardEditor, setCardEditor] = useState<CardEditorState | null>(null);
	// Track when word-list view was opened for duration recording
	const wordListStartTime = useRef<number | null>(null);

	const decks = useMemo(
		() => dataStore.getAllDecks(),
		[dataStore, contentVersion],
	);

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

	const handleOpenEditCard = useCallback((deckId: string, cardId: string) => {
		const card = dataStore.getCard(deckId, cardId);
		if (!card) {
			new Notice(t("notice.cardMissing"));
			return;
		}
		setCardEditor({
			mode: "edit",
			deckId,
			cardId,
			question: card.question,
			answer: card.answer,
		});
	}, [dataStore, t]);

	const handleCloseCardEditor = useCallback(() => {
		setCardEditor(null);
	}, []);

	const handleSaveCardEditor = useCallback(async ({
		deckId,
		question,
		answer,
	}: CardEditorSavePayload) => {
		if (!cardEditor) return;

		try {
			if (cardEditor.mode === "edit") {
				await dataStore.updateCardContent(
					cardEditor.deckId,
					cardEditor.cardId,
					question,
					answer,
				);
				new Notice(t("notice.cardSaved"));
			} else {
				await dataStore.addCardToDeck(deckId, question, answer);
				new Notice(t("notice.cardAdded"));
			}
			setContentVersion((version) => version + 1);
			setCardEditor(null);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : t("cardEditor.saveFailed");
			new Notice(t("notice.cardSaveFailed", { message }));
			throw error;
		}
	}, [cardEditor, dataStore, t]);

	const handleSelectDeck = useCallback((deckId: string) => {
		const deck = dataStore.getDeck(deckId);
		if (deck && deck.cards.length > 0) {
			setViewState({ type: "study-setup", deckId });
		} else {
			new Notice(deck ? t("notice.deckEmpty") : t("notice.deckMissing"));
		}
	}, [dataStore, t]);

	const handleStartStudyFromSetup = useCallback((
		deckId: string,
		studyOrder: "sequential" | "random",
	) => {
		const session = dataStore.createStudySession(deckId, studyOrder);
		if (session && session.cardQueue.length > 0) {
			setStudySession(session);
			setViewState({ type: "study", deckId });
		} else {
			new Notice(t("notice.todayComplete"));
		}
	}, [dataStore, t]);

	const handleStudyDay = useCallback((
		deckId: string,
		dayIndex: number,
		studyOrder: "sequential" | "random",
	) => {
		const cards = dataStore.getCardsForDay(deckId, dayIndex);
		if (cards.length === 0) return;
		let cardIds = cards.map((c) => c.id);
		if (studyOrder === "random") {
			cardIds = shuffleArray(cardIds);
		}
		const session: PracticeSession = {
			deckId,
			cardQueue: cardIds,
			currentIndex: 0,
			startTime: Date.now(),
			totalQuestions: cardIds.length,
			answers: {},
		};
		setPracticeSession(session);
		setPracticeResult(null);
		setViewState({ type: "practice", deckId });
	}, [dataStore]);

	const handleCloseStudy = useCallback(() => {
		// Record Study session before clearing state
		if (studySession && studySession.currentIndex > 0) {
			const deck = dataStore.getDeck(studySession.deckId);
			const duration = Math.floor(
				(Date.now() - studySession.startTime) / 1000,
			);
			void dataStore.recordStudySession(
				studySession.deckId,
				deck?.name ?? studySession.deckId,
				"study",
				studySession.currentIndex,
				duration,
			);
		}
		setStudySession(null);
		setViewState({ type: "home" });
	}, [dataStore, studySession]);

	const handleSessionUpdate = useCallback((session: StudySession) => {
		setStudySession(session);
	}, []);

	const handleOpenWordList = useCallback((deckId: string) => {
		wordListStartTime.current = Date.now();
		setViewState({ type: "word-list", deckId });
	}, []);

	const handleCloseWordList = useCallback((deckId: string) => {
		if (wordListStartTime.current !== null) {
			const duration = Math.floor(
				(Date.now() - wordListStartTime.current) / 1000,
			);
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
	}, [dataStore]);

	// Practice mode handlers
	const handleStartPracticeSetup = useCallback((deckId: string) => {
		const deck = dataStore.getDeck(deckId);
		if (deck && deck.cards.length > 0) {
			setViewState({ type: "practice-setup", deckId });
		} else {
			new Notice(t("notice.deckEmpty"));
		}
	}, [dataStore, t]);

	const handleStartPractice = useCallback((deckId: string, questionCount: number) => {
		const deck = dataStore.getDeck(deckId);
		if (!deck) return;

		// Shuffle and select cards
		const shuffledCards = shuffleArray(deck.cards).slice(0, questionCount);

		const session: PracticeSession = {
			deckId,
			cardQueue: shuffledCards.map((c) => c.id),
			currentIndex: 0,
			startTime: Date.now(),
			totalQuestions: shuffledCards.length,
			answers: {},
		};

		setPracticeSession(session);
		setPracticeResult(null);
		setViewState({ type: "practice", deckId });
	}, [dataStore]);

	const handlePracticeSessionUpdate = useCallback((session: PracticeSession) => {
		setPracticeSession(session);
	}, []);

	const handlePracticeComplete = useCallback((result: PracticeResult) => {
		// Record Practice session
		if (practiceSession) {
			const deck = dataStore.getDeck(practiceSession.deckId);
			void dataStore.recordStudySession(
				practiceSession.deckId,
				deck?.name ?? practiceSession.deckId,
				"practice",
				result.totalQuestions,
				result.timeSpent,
			);
		}
		setPracticeResult(result);
		if (practiceSession) {
			setViewState({
				type: "practice-summary",
				deckId: practiceSession.deckId,
			});
		}
	}, [dataStore, practiceSession]);

	const handlePracticeRestart = useCallback(() => {
		if (practiceSession) {
			setViewState({
				type: "practice-setup",
				deckId: practiceSession.deckId,
			});
		}
	}, [practiceSession]);

	const handlePracticeIncorrect = useCallback(() => {
		if (
			practiceResult &&
			practiceSession &&
			practiceResult.incorrectCardIds.length > 0
		) {
			// Shuffle incorrect cards
			const shuffledIncorrect = shuffleArray(
				practiceResult.incorrectCardIds,
			);

			const session: PracticeSession = {
				deckId: practiceSession.deckId,
				cardQueue: shuffledIncorrect,
				currentIndex: 0,
				startTime: Date.now(),
				totalQuestions: shuffledIncorrect.length,
				answers: {},
			};

			setPracticeSession(session);
			setPracticeResult(null);
			setViewState({ type: "practice", deckId: practiceSession.deckId });
		}
	}, [practiceResult, practiceSession]);

	const handlePracticeClose = useCallback(() => {
		setPracticeSession(null);
		setPracticeResult(null);
		setViewState({ type: "home" });
	}, []);

	const handleOpenSourceFile = useCallback((filePath: string) => {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			void app.workspace.getLeaf(false).openFile(file);
		} else {
			new Notice(t("notice.sourceMissing", { filePath }));
		}
	}, [app, t]);

	const handleUpdateDeckStudySettings = useCallback(async (
		deckId: string,
		overrides: Partial<StudySettings> | null,
	) => {
		const newDeckStudySettings = {
			...(settings.deckStudySettings ?? {}),
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
	}, [onSaveSettings, settings]);

	const renderHome = () => (
		<DeckList
			dataStore={dataStore}
			settings={settings}
			refreshKey={contentVersion}
			onSelectDeck={handleSelectDeck}
			onOpenWordList={handleOpenWordList}
			onStartPractice={handleStartPracticeSetup}
			onRefresh={onRefresh}
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
			const { newCount, reviewCount } = dataStore.getTodayStudyCounts(
				viewState.deckId,
			);
			const effectiveSettings = dataStore.getEffectiveStudySettings(
				viewState.deckId,
			);
			return (
				<StudySetup
					key={deck.id}
					deck={deck}
					dayList={dayList}
					todayNewCount={newCount}
					todayReviewCount={reviewCount}
					defaultStudyOrder={effectiveSettings.studyOrder}
					onStart={(order) =>
						handleStartStudyFromSetup(viewState.deckId, order)
					}
					onStartDay={(dayIndex, order) =>
						handleStudyDay(viewState.deckId, dayIndex, order)
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
					dataStore={dataStore}
					deck={deck}
					session={studySession}
					contentVersion={contentVersion}
					onSessionUpdate={handleSessionUpdate}
					onEditCard={handleOpenEditCard}
					onClose={handleCloseStudy}
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
					onStartPractice={(count) =>
						handleStartPractice(viewState.deckId, count)
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
					dataStore={dataStore}
					deck={deck}
					session={practiceSession}
					contentVersion={contentVersion}
					onSessionUpdate={handlePracticeSessionUpdate}
					onEditCard={handleOpenEditCard}
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
					dataStore={dataStore}
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
			return (
				<StatsView
					dataStore={dataStore}
					onBack={handleBackHome}
				/>
			);

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
					initialQuestion={
						cardEditor.mode === "edit" ? cardEditor.question : ""
					}
					initialAnswer={
						cardEditor.mode === "edit" ? cardEditor.answer : ""
					}
					onSave={handleSaveCardEditor}
					onClose={handleCloseCardEditor}
				/>
			)}
		</I18nProvider>
	);
};
