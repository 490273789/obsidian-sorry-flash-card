import React, { useEffect, useState, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import {
	BookOpen,
	Brain,
	Calculator,
	ChartBar,
	ChartSpline,
	FileText,
	Inbox,
	Layers3,
	List,
	NotebookPen,
	RefreshCcw,
	RefreshCw,
	ScanEye,
	Settings,
	Sparkles,
	Target,
} from "lucide-react";
import { Deck, DeckStats, FlashcardSettings, StudySettings } from "../types";
import { DataStore } from "../dataStore";
import { FlashcardButton } from "./FlashcardButton";

// ── Per-deck settings modal ───────────────────────────────────────────────────

interface DeckSettingsModalProps {
	deckName: string;
	deckId: string;
	totalCards: number;
	globalSettings: FlashcardSettings;
	deckOverrides: Partial<StudySettings> | undefined;
	onSave: (overrides: Partial<StudySettings> | null) => Promise<void>;
	onClose: () => void;
}

const DeckSettingsModal: React.FC<DeckSettingsModalProps> = ({
	deckName,
	deckId: _deckId,
	totalCards,
	globalSettings,
	deckOverrides,
	onSave,
	onClose,
}) => {
	const [useCustom, setUseCustom] = useState(deckOverrides !== undefined);

	const effective = {
		dailyNewCards:
			deckOverrides?.dailyNewCards ?? globalSettings.dailyNewCards,
		dailyReviewCards:
			deckOverrides?.dailyReviewCards ?? globalSettings.dailyReviewCards,
		studyOrder: deckOverrides?.studyOrder ?? globalSettings.studyOrder,
		requestRetention:
			deckOverrides?.fsrsParameters?.requestRetention ??
			globalSettings.fsrsParameters.requestRetention,
		maximumInterval:
			deckOverrides?.fsrsParameters?.maximumInterval ??
			globalSettings.fsrsParameters.maximumInterval,
	};

	const [dailyNewCards, setDailyNewCards] = useState(effective.dailyNewCards);
	const [dailyReviewCards, setDailyReviewCards] = useState(
		effective.dailyReviewCards,
	);
	const [studyOrder, setStudyOrder] = useState<"sequential" | "random">(
		effective.studyOrder,
	);
	const [requestRetention, setRequestRetention] = useState(
		effective.requestRetention,
	);
	const [maximumInterval, setMaximumInterval] = useState(
		String(effective.maximumInterval),
	);

	// Days-to-complete: bidirectionally linked with dailyNewCards
	const calcDays = (perDay: number) =>
		totalCards > 0 ? Math.ceil(totalCards / perDay) : 0;
	const [daysToComplete, setDaysToComplete] = useState(
		String(calcDays(effective.dailyNewCards)),
	);

	const handleDailyNewCardsChange = (val: number) => {
		setDailyNewCards(val);
		setDaysToComplete(String(calcDays(val)));
	};

	const handleDaysToCompleteChange = (raw: string) => {
		setDaysToComplete(raw);
		const days = parseInt(raw, 10);
		if (!isNaN(days) && days >= 1 && totalCards > 0) {
			const newPerDay = Math.ceil(totalCards / days);
			const clamped = Math.max(1, Math.min(200, newPerDay));
			setDailyNewCards(clamped);
		}
	};

	const handleSave = async () => {
		if (!useCustom) {
			await onSave(null);
		} else {
			const intervalNum = parseInt(maximumInterval);
			await onSave({
				dailyNewCards,
				dailyReviewCards,
				studyOrder,
				fsrsParameters: {
					requestRetention,
					maximumInterval:
						!isNaN(intervalNum) && intervalNum >= 30
							? intervalNum
							: globalSettings.fsrsParameters.maximumInterval,
				},
			});
		}
		onClose();
	};

	const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (e.target === e.currentTarget) onClose();
	};

	const modal = (
		<div className="flashcard-modal-backdrop" onClick={handleBackdropClick}>
			<div className="flashcard-modal">
				<div className="flashcard-modal-header">
					<div className="flashcard-modal-heading">
						<div className="flashcard-modal-kicker fc-kicker">
							<Sparkles size={14} /> Personalized learning pace
						</div>
						<span className="flashcard-modal-title">
							{deckName} · Study Settings
						</span>
						<span className="flashcard-modal-subtitle">
							{totalCards} Cards,
							{useCustom
								? "Using custom settings"
								: "Using global default settings"}
						</span>
					</div>
					<button
						className="flashcard-modal-close"
						onClick={onClose}
						aria-label="Close"
					>
						✕
					</button>
				</div>

				<div className="flashcard-modal-body">
					<div className="flashcard-deck-settings-toggle flashcard-deck-settings-card">
						<label className="flashcard-deck-settings-toggle-label">
							<input
								type="checkbox"
								checked={useCustom}
								onChange={(e) => setUseCustom(e.target.checked)}
							/>
							<span>Use custom study settings</span>
						</label>
						<p className="flashcard-deck-settings-toggle-copy">
							Adjust the new card pace, review capacity, and
							memory goals for this deck individually.
						</p>
					</div>

					{!useCustom ? (
						<div className="flashcard-deck-settings-hint flashcard-deck-settings-card">
							Currently using global default settings: Daily new
							cards&nbsp;
							<strong>{globalSettings.dailyNewCards}</strong>
							&nbsp;Cards, Daily review&nbsp;
							<strong>{globalSettings.dailyReviewCards}</strong>
							&nbsp;Cards,
							{globalSettings.studyOrder === "random"
								? "Random"
								: "Sequential"}
							learning.
							{totalCards > 0 && (
								<span>
									&nbsp;Estimated days to complete&nbsp;
									<strong>
										{calcDays(globalSettings.dailyNewCards)}
									</strong>
									&nbsp;days.
								</span>
							)}
						</div>
					) : (
						<div className="flashcard-deck-settings-fields">
							<div className="flashcard-deck-settings-summary flashcard-deck-settings-card">
								<div>
									<span className="flashcard-deck-settings-summary-label">
										Estimated completion pace -&nbsp;
									</span>
									<strong className="flashcard-deck-settings-summary-value">
										{daysToComplete} days
									</strong>
								</div>
								<span className="flashcard-deck-settings-summary-label">
									Daily new cards {dailyNewCards}, Daily
									review {dailyReviewCards}
								</span>
							</div>
							<div className="flashcard-deck-settings-field">
								<label>
									<span>Daily new cards</span>
									<strong>{dailyNewCards}</strong>
								</label>
								<input
									type="range"
									min={1}
									max={200}
									value={dailyNewCards}
									onChange={(e) =>
										handleDailyNewCardsChange(
											parseInt(e.target.value),
										)
									}
								/>
							</div>
							{totalCards > 0 && (
								<div className="flashcard-deck-settings-field flashcard-deck-settings-field-row flashcard-deck-settings-days">
									<label>Estimated days to complete</label>
									<div className="flashcard-deck-settings-days-inputs">
										<input
											type="number"
											min={1}
											max={totalCards}
											value={daysToComplete}
											onChange={(e) =>
												handleDaysToCompleteChange(
													e.target.value,
												)
											}
										/>
										<span className="flashcard-deck-settings-days-unit">
											days
										</span>
										<span className="flashcard-deck-settings-days-hint">
											(Total {totalCards} cards)
										</span>
									</div>
								</div>
							)}
							<div className="flashcard-deck-settings-field">
								<label>
									<span>Daily review cards</span>
									<strong>{dailyReviewCards}</strong>
								</label>
								<input
									type="range"
									min={1}
									max={500}
									step={10}
									value={dailyReviewCards}
									onChange={(e) =>
										setDailyReviewCards(
											parseInt(e.target.value),
										)
									}
								/>
							</div>
							<div className="flashcard-deck-settings-field flashcard-deck-settings-field-row">
								<label>Study order</label>
								<select
									value={studyOrder}
									onChange={(e) =>
										setStudyOrder(
											e.target.value as
												| "sequential"
												| "random",
										)
									}
								>
									<option value="sequential">
										Sequential
									</option>
									<option value="random">Random</option>
								</select>
							</div>
							<div className="flashcard-deck-settings-field">
								<label>
									<span>Target retention rate</span>
									<strong>
										{requestRetention.toFixed(2)}
									</strong>
								</label>
								<input
									type="range"
									min={0.7}
									max={0.99}
									step={0.01}
									value={requestRetention}
									onChange={(e) =>
										setRequestRetention(
											parseFloat(e.target.value),
										)
									}
								/>
							</div>
							<div className="flashcard-deck-settings-field flashcard-deck-settings-field-row">
								<label>Maximum review interval (days)</label>
								<input
									type="number"
									min={30}
									max={3650}
									value={maximumInterval}
									onChange={(e) =>
										setMaximumInterval(e.target.value)
									}
								/>
							</div>
						</div>
					)}
				</div>

				<div className="flashcard-modal-footer">
					<FlashcardButton
						variant="green"
						onClick={() => void handleSave()}
					>
						Save
					</FlashcardButton>
					<FlashcardButton onClick={onClose}>
						Cancel
					</FlashcardButton>
				</div>
			</div>
		</div>
	);

	// Keep the modal inside the plugin root so design tokens remain available.
	const container =
		activeDocument.querySelector(".flashcard-root") ?? activeDocument.body;
	return ReactDOM.createPortal(modal, container);
};

// ── DeckList ─────────────────────────────────────────────────────────────────

interface DeckListProps {
	dataStore: DataStore;
	settings: FlashcardSettings;
	onSelectDeck: (deckId: string) => void;
	onOpenWordList: (deckId: string) => void;
	onStartPractice: (deckId: string) => void;
	onRefresh: () => Promise<void>;
	onUpdateDeckStudySettings: (
		deckId: string,
		overrides: Partial<StudySettings> | null,
	) => Promise<void>;
	onOpenSourceFile: (filePath: string) => void;
	onOpenStats: () => void;
}

export const DeckList: React.FC<DeckListProps> = ({
	dataStore,
	settings,
	onSelectDeck,
	onOpenWordList,
	onStartPractice,
	onRefresh,
	onUpdateDeckStudySettings,
	onOpenSourceFile,
	onOpenStats,
}) => {
	const [decks, setDecks] = useState<Deck[]>([]);
	const [stats, setStats] = useState<Map<string, DeckStats>>(new Map());
	const [isLoading, setIsLoading] = useState(false);
	const [modalDeckId, setModalDeckId] = useState<string | null>(null);

	const loadDecks = useCallback(() => {
		const allDecks = dataStore.getAllDecks();
		setDecks(allDecks);

		const newStats = new Map<string, DeckStats>();
		for (const deck of allDecks) {
			newStats.set(deck.id, dataStore.getDeckStats(deck));
		}
		setStats(newStats);
	}, [dataStore]);

	useEffect(() => {
		loadDecks();
	}, [loadDecks]);

	const totals = useMemo(() => {
		return decks.reduce(
			(accumulator, deck) => {
				const deckStats = stats.get(deck.id);
				accumulator.totalCards += deckStats?.totalCards ?? 0;
				accumulator.newCards += deckStats?.newCards ?? 0;
				accumulator.dueCards += deckStats?.dueCards ?? 0;
				accumulator.studyCount += deck.studyCount;
				return accumulator;
			},
			{ totalCards: 0, newCards: 0, dueCards: 0, studyCount: 0 },
		);
	}, [decks, stats]);

	const handleRefresh = async () => {
		setIsLoading(true);
		try {
			await onRefresh();
			loadDecks();
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flashcard-home">
			<div className="flashcard-home-hero">
				<div className="flashcard-header">
					<div className="flashcard-title">
						<BookOpen size={22} /> Ultimate Repetition
					</div>
					<div className="flashcard-header-actions">
						<FlashcardButton
							preset="icon"
							icon={ChartSpline}
							onClick={onOpenStats}
							title="学习统计"
						/>
						<FlashcardButton
							preset="icon"
							icon={RefreshCcw}
							onClick={() => void handleRefresh()}
							disabled={isLoading}
							title="刷新题库"
						iconClassName={isLoading ? "spinning" : ""}
						/>
					</div>
				</div>
				<div className="flashcard-home-pills">
					<span className="flashcard-home-pill fc-pill">
						<Layers3 size={16} />
						<span className="blue">{decks.length}</span>decks
					</span>
					<span className="flashcard-home-pill fc-pill">
						<Brain size={16} />
						<span className="green">{totals.newCards}</span>new
						cards
					</span>
					<span className="flashcard-home-pill fc-pill">
						<ScanEye size={16} />
						<span className="red">{totals.dueCards}</span>
						review cards
					</span>
					<span className="flashcard-home-pill fc-pill">
						<Calculator size={16} />
						<span className="purple">{totals.totalCards}</span>
						total cards
					</span>
					<span className="flashcard-home-pill fc-pill">
						<NotebookPen size={16} />
						<span className="orange">{totals.studyCount}</span>
						study count
					</span>
				</div>
			</div>

			{decks.length === 0 ? (
				<div className="flashcard-empty">
					<div className="flashcard-empty-icon">
						<Inbox size={48} />
					</div>
					<p>暂无题库</p>
					<p className="flashcard-empty-hint">
						点击刷新按钮扫描带有 <code>#wordTag</code> 标签的文件
					</p>
				</div>
			) : (
				<div className="flashcard-deck-list">
					{decks.map((deck) => {
						const deckStats = stats.get(deck.id);
						return (
							<article
								key={deck.id}
								className="flashcard-deck-item fc-lift"
							>
								<div className="flashcard-deck-main">
									<div className="flashcard-deck-info">
										<div className="flashcard-deck-name">
											{deck.name}
										</div>
										<span className="flashcard-deck-badge fc-pill">
											{deck.tag}
										</span>
									</div>
									<div className="flashcard-deck-stats">
										<div className="flashcard-stat">
											<span className="flashcard-stat-value orange">
												{deckStats?.totalCards || 0}
											</span>
											<span className="flashcard-stat-label">
												Total
											</span>
										</div>
										<div className="flashcard-stat">
											<span className="flashcard-stat-value blue">
												{deckStats?.newCards || 0}
											</span>
											<span className="flashcard-stat-label">
												New
											</span>
										</div>
										<div className="flashcard-stat">
											<span className="flashcard-stat-value green">
												{deckStats?.dueCards || 0}
											</span>
											<span className="flashcard-stat-label">
												ToBeReviewed
											</span>
										</div>
										<div className="flashcard-stat">
											<span className="flashcard-stat-value purple">
												{deck.studyCount}
											</span>
											<span className="flashcard-stat-label">
												Study Count
											</span>
										</div>
									</div>
								</div>

								<div className="flashcard-deck-side">
									<div className="flashcard-deck-actions2">
										<FlashcardButton
											variant="purple"
											icon={Brain}
											onClick={(e) => {
												e.stopPropagation();
												onSelectDeck(deck.id);
											}}
											title="学习模式"
										>
											<span>Study</span>
										</FlashcardButton>
										<FlashcardButton
											variant="blue"
											icon={Target}
											onClick={(e) => {
												e.stopPropagation();
												onStartPractice(deck.id);
											}}
											title="刷题模式"
										>
											<span>Practice</span>
										</FlashcardButton>
									</div>
									<div className="flashcard-deck-actions3">
										<FlashcardButton
											variant="orange"
											icon={List}
											onClick={(e) => {
												e.stopPropagation();
												onOpenWordList(deck.id);
											}}
											title="单词List"
										>
											<span>List</span>
										</FlashcardButton>
										<FlashcardButton
											variant="green"
											icon={FileText}
											onClick={(e) => {
												e.stopPropagation();
												onOpenSourceFile(deck.filePath);
											}}
											title="打开源文件"
										>
											<span>Source</span>
										</FlashcardButton>
										<FlashcardButton
											variant="gray"
											icon={Settings}
											onClick={(e) => {
												e.stopPropagation();
												setModalDeckId(deck.id);
											}}
											title="学习设置"
										>
											<span>Setting</span>
										</FlashcardButton>
									</div>
								</div>
							</article>
						);
					})}
				</div>
			)}

			{modalDeckId !== null &&
				(() => {
					const modalDeck = decks.find((d) => d.id === modalDeckId);
					if (!modalDeck) return null;
					return (
						<DeckSettingsModal
							deckName={modalDeck.name}
							deckId={modalDeckId}
							totalCards={modalDeck.cards.length}
							globalSettings={settings}
							deckOverrides={
								settings.deckStudySettings?.[modalDeckId]
							}
							onSave={async (overrides) => {
								await onUpdateDeckStudySettings(
									modalDeckId,
									overrides,
								);
							}}
							onClose={() => setModalDeckId(null)}
						/>
					);
				})()}
		</div>
	);
};
