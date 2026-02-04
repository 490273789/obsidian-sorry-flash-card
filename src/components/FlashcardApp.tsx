import React, { useState, useCallback } from "react";
import { App, Component, MarkdownRenderer, Notice } from "obsidian";
import {
	ViewState,
	FlashcardSettings,
	StudySession,
	PracticeSession,
	PracticeResult,
} from "../types";
import { DataStore } from "../dataStore";
import { DeckList } from "./DeckList";
import { CardView } from "./CardView";
import { PracticeSetup } from "./PracticeSetup";
import { PracticeView } from "./PracticeView";
import { PracticeSummary } from "./PracticeSummary";

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

	// Markdown renderer function
	const renderMarkdown = useCallback(
		async (content: string, el: HTMLElement): Promise<void> => {
			const component = new Component();
			await MarkdownRenderer.render(app, content, el, "", component);
		},
		[app],
	);

	const handleSelectDeck = (deckId: string) => {
		const session = dataStore.createStudySession(deckId);
		if (session && session.cardQueue.length > 0) {
			setStudySession(session);
			setViewState({ type: "study", deckId });
		} else {
			// No cards to study
			const deck = dataStore.getDeck(deckId);
			if (deck && deck.cards.length === 0) {
				// Empty deck
				new Notice("该题库没有卡片，请先添加内容");
			} else {
				// All cards reviewed
				new Notice("今日学习任务已完成! 🎉");
			}
		}
	};

	const handleCloseStudy = () => {
		setStudySession(null);
		setViewState({ type: "home" });
	};

	const handleSessionUpdate = (session: StudySession) => {
		setStudySession(session);
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
		const shuffledCards = [...deck.cards]
			.sort(() => Math.random() - 0.5)
			.slice(0, questionCount);

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
			const shuffledIncorrect = [...practiceResult.incorrectCardIds].sort(
				() => Math.random() - 0.5,
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

	// Render based on view state
	switch (viewState.type) {
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

		case "home":
		default:
			return (
				<DeckList
					dataStore={dataStore}
					onSelectDeck={handleSelectDeck}
					onStartPractice={handleStartPracticeSetup}
					onRefresh={onRefresh}
				/>
			);
	}
};
