import React, { useState, useCallback, useRef } from "react";
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

interface FlashcardAppProps {
	app: App;
	dataStore: DataStore;
	settings: FlashcardSettings;
	onSaveSettings: (settings: FlashcardSettings) => Promise<void>;
	onRefresh: () => Promise<void>;
	availableTags: string[];
}

export const FlashcardApp: React.FC<FlashcardAppProps> = ({
	app,
	dataStore,
	settings,
	onSaveSettings,
	onRefresh,
	availableTags,
}) => {
	const [viewState, setViewState] = useState<ViewState>({ type: "home" });
	const [studySession, setStudySession] = useState<StudySession | null>(null);
	const [practiceSession, setPracticeSession] =
		useState<PracticeSession | null>(null);
	const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(
		null,
	);
	// Track when word-list view was opened for duration recording
	const wordListStartTime = useRef<number | null>(null);

	// Markdown renderer function
	const renderMarkdown = useCallback(
		async (content: string, el: HTMLElement): Promise<void> => {
			const component = new Component();
			await MarkdownRenderer.render(app, content, el, "", component);
		},
		[app],
	);

	const handleSelectDeck = (deckId: string) => {
		const deck = dataStore.getDeck(deckId);
		if (deck && deck.cards.length > 0) {
			setViewState({ type: "study-setup", deckId });
		} else {
			new Notice(deck ? "该题库没有卡片，请先添加内容" : "题库不存在");
		}
	};

	const handleStartStudyFromSetup = (
		deckId: string,
		studyOrder: "sequential" | "random",
	) => {
		const session = dataStore.createStudySession(deckId, studyOrder);
		if (session && session.cardQueue.length > 0) {
			setStudySession(session);
			setViewState({ type: "study", deckId });
		} else {
			new Notice("今日学习任务已完成! 🎉");
		}
	};

	const handleStudyDay = (
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
	};

	const handleCloseStudy = () => {
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
	};

	const handleSessionUpdate = (session: StudySession) => {
		setStudySession(session);
	};

	const handleOpenWordList = (deckId: string) => {
		wordListStartTime.current = Date.now();
		setViewState({ type: "word-list", deckId });
	};

	const handleCloseWordList = (deckId: string) => {
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
	};

	// Practice mode handlers
	const handleStartPracticeSetup = (deckId: string) => {
		const deck = dataStore.getDeck(deckId);
		if (deck && deck.cards.length > 0) {
			setViewState({ type: "practice-setup", deckId });
		} else {
			new Notice("该题库没有卡片，请先添加内容");
		}
	};

	const handleStartPractice = (deckId: string, questionCount: number) => {
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
	};

	const handlePracticeSessionUpdate = (session: PracticeSession) => {
		setPracticeSession(session);
	};

	const handlePracticeComplete = (result: PracticeResult) => {
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
	};

	const handlePracticeRestart = () => {
		if (practiceSession) {
			setViewState({
				type: "practice-setup",
				deckId: practiceSession.deckId,
			});
		}
	};

	const handlePracticeIncorrect = () => {
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
	};

	const handlePracticeClose = () => {
		setPracticeSession(null);
		setPracticeResult(null);
		setViewState({ type: "home" });
	};

	const handleOpenSourceFile = (filePath: string) => {
		const file = app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			void app.workspace.getLeaf(false).openFile(file);
		} else {
			new Notice(`找不到源文件：${filePath}`);
		}
	};

	const handleUpdateDeckStudySettings = async (
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
	};

	// Render based on view state
	switch (viewState.type) {
		case "study-setup": {
			const deck = dataStore.getDeck(viewState.deckId);
			if (!deck) {
				setViewState({ type: "home" });
				return null;
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
					onBack={() => setViewState({ type: "home" })}
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
					dataStore={dataStore}
					deck={deck}
					session={studySession}
					onSessionUpdate={handleSessionUpdate}
					onClose={handleCloseStudy}
					markdownRenderer={renderMarkdown}
				/>
			);
		}

		case "practice-setup": {
			const deck = dataStore.getDeck(viewState.deckId);
			if (!deck) {
				setViewState({ type: "home" });
				return null;
			}
			return (
				<PracticeSetup
					deck={deck}
					onStartPractice={(count) =>
						handleStartPractice(viewState.deckId, count)
					}
					onBack={() => setViewState({ type: "home" })}
				/>
			);
		}

		case "practice": {
			if (!practiceSession) {
				setViewState({ type: "home" });
				return null;
			}
			const deck = dataStore.getDeck(viewState.deckId);
			if (!deck) {
				setViewState({ type: "home" });
				return null;
			}
			return (
				<PracticeView
					dataStore={dataStore}
					deck={deck}
					session={practiceSession}
					onSessionUpdate={handlePracticeSessionUpdate}
					onComplete={handlePracticeComplete}
					onClose={handlePracticeClose}
					markdownRenderer={renderMarkdown}
				/>
			);
		}

		case "practice-summary": {
			if (!practiceResult || !practiceSession) {
				setViewState({ type: "home" });
				return null;
			}
			const deck = dataStore.getDeck(viewState.deckId);
			if (!deck) {
				setViewState({ type: "home" });
				return null;
			}
			return (
				<PracticeSummary
					deck={deck}
					dataStore={dataStore}
					result={practiceResult}
					settings={settings}
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
				setViewState({ type: "home" });
				return null;
			}
			return (
				<WordListView
					deck={deck}
					onBack={() => handleCloseWordList(viewState.deckId)}
				/>
			);
		}

		case "stats":
			return (
				<StatsView
					dataStore={dataStore}
					onBack={() => setViewState({ type: "home" })}
				/>
			);

		case "home":
		default:
			return (
				<DeckList
					dataStore={dataStore}
					settings={settings}
					onSelectDeck={handleSelectDeck}
					onOpenWordList={handleOpenWordList}
					onStartPractice={handleStartPracticeSetup}
					onRefresh={onRefresh}
					onUpdateDeckStudySettings={handleUpdateDeckStudySettings}
					onOpenSourceFile={handleOpenSourceFile}
					onOpenStats={() => setViewState({ type: "stats" })}
				/>
			);
	}
};
