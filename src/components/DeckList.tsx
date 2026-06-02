import React, { useEffect, useState, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import {
	BookOpen,
	Brain,
	ChartBar,
	Clock3,
	FileText,
	Inbox,
	Layers3,
	List,
	RefreshCw,
	Settings,
	Sparkles,
	Target,
} from "lucide-react";
import { Deck, DeckStats, FlashcardSettings, StudySettings } from "../types";
import { DataStore } from "../dataStore";

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
			<div className="flashcard-modal flashcard-deck-settings-modal">
				<div className="flashcard-modal-header">
					<div className="flashcard-modal-heading">
						<div className="flashcard-modal-kicker fc-kicker">
							<Sparkles size={14} /> 专属学习节奏
						</div>
						<span className="flashcard-modal-title">
							{deckName} · 学习设置
						</span>
						<span className="flashcard-modal-subtitle">
							{totalCards} 张卡片，
							{useCustom
								? "当前使用单独配置"
								: "当前跟随全局默认"}
						</span>
					</div>
					<button
						className="flashcard-modal-close"
						onClick={onClose}
						aria-label="关闭"
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
							<span>使用自定义学习设置</span>
						</label>
						<p className="flashcard-deck-settings-toggle-copy">
							为这个题库单独调整新卡节奏、复习容量和记忆目标。
						</p>
					</div>

					{!useCustom ? (
						<div className="flashcard-deck-settings-hint flashcard-deck-settings-card">
							当前使用全局默认设置：每日新卡&nbsp;
							<strong>{globalSettings.dailyNewCards}</strong>
							&nbsp;张，每日复习&nbsp;
							<strong>{globalSettings.dailyReviewCards}</strong>
							&nbsp;张，
							{globalSettings.studyOrder === "random"
								? "乱序"
								: "顺序"}
							学习。
							{totalCards > 0 && (
								<span>
									&nbsp;全部学完预计需&nbsp;
									<strong>
										{calcDays(globalSettings.dailyNewCards)}
									</strong>
									&nbsp;天。
								</span>
							)}
						</div>
					) : (
						<div className="flashcard-deck-settings-fields">
							<div className="flashcard-deck-settings-summary flashcard-deck-settings-card">
								<div>
									<span className="flashcard-deck-settings-summary-label">
										预计完成节奏
									</span>
									<strong className="flashcard-deck-settings-summary-value">
										{daysToComplete} 天
									</strong>
								</div>
								<span className="flashcard-deck-settings-summary-copy">
									每日新卡 {dailyNewCards}，每日复习{" "}
									{dailyReviewCards}
								</span>
							</div>
							<div className="flashcard-deck-settings-field">
								<label>
									<span>每日新卡数量</span>
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
									<label>预计完成天数</label>
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
											天
										</span>
										<span className="flashcard-deck-settings-days-hint">
											(共 {totalCards} 张卡片)
										</span>
									</div>
								</div>
							)}
							<div className="flashcard-deck-settings-field">
								<label>
									<span>每日复习数量</span>
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
								<label>学习顺序</label>
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
									<option value="sequential">顺序学习</option>
									<option value="random">乱序学习</option>
								</select>
							</div>
							<div className="flashcard-deck-settings-field">
								<label>
									<span>目标记忆保持率</span>
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
								<label>最大复习间隔（天）</label>
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
					<button
						className="flashcard-btn flashcard-btn-green"
						onClick={() => void handleSave()}
					>
						保存
					</button>
					<button className="flashcard-btn" onClick={onClose}>
						取消
					</button>
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
				<div className="flashcard-home-hero-copy">
					<div className="flashcard-header">
						<div>
							<h2 className="flashcard-title">
								<BookOpen size={26} /> Ultimate Repetition
							</h2>
							<p className="flashcard-home-subtitle">
								把题库、学习节奏和训练模式收拢到一个更清晰的面板里。
							</p>
						</div>
						<div className="flashcard-header-actions">
							<button
								className="flashcard-btn flashcard-btn-icon"
								onClick={onOpenStats}
								title="学习统计"
							>
								<ChartBar size={18} />
							</button>
							<button
								className="flashcard-btn flashcard-btn-icon"
								onClick={() => void handleRefresh()}
								disabled={isLoading}
								title="刷新题库"
							>
								<RefreshCw
									size={18}
									className={isLoading ? "spinning" : ""}
								/>
							</button>
						</div>
					</div>
					<div className="flashcard-home-pills">
						<span className="flashcard-home-pill fc-pill">
							<Layers3 size={14} /> {decks.length} 个题库
						</span>
						<span className="flashcard-home-pill fc-pill">
							<Brain size={14} /> {totals.newCards} 张待吸收
						</span>
						<span className="flashcard-home-pill fc-pill">
							<Clock3 size={14} /> {totals.dueCards} 张待复习
						</span>
					</div>
				</div>

				<div className="flashcard-home-overview">
					<div className="flashcard-home-overview-card fc-lift">
						<span className="flashcard-home-overview-label">
							总卡片
						</span>
						<strong className="flashcard-home-overview-value">
							{totals.totalCards}
						</strong>
					</div>
					<div className="flashcard-home-overview-card fc-lift">
						<span className="flashcard-home-overview-label">
							学习次数
						</span>
						<strong className="flashcard-home-overview-value">
							{totals.studyCount}
						</strong>
					</div>
					<div className="flashcard-home-overview-card flashcard-home-overview-accent fc-lift">
						<span className="flashcard-home-overview-label">
							今日主线 新卡 + 复习
						</span>
						<strong className="flashcard-home-overview-value">
							{totals.newCards + totals.dueCards}
						</strong>
					</div>
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
								<div className="flashcard-deck-topline">
									<span className="flashcard-deck-badge fc-pill">
										{deck.tag}
									</span>
									<span className="flashcard-deck-meta fc-pill">
										{deck.cards.length} cars
									</span>
								</div>
								<div className="flashcard-deck-bottom">
									<div className="flashcard-deck-main">
										<div className="flashcard-deck-info">
											<div className="flashcard-deck-name">
												{deck.name}
											</div>
										</div>
										<div className="flashcard-deck-stats">
											<div className="flashcard-stat">
												<span className="flashcard-stat-value">
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
												<span className="flashcard-stat-value">
													{deck.studyCount}
												</span>
												<span className="flashcard-stat-label">
													Study Count
												</span>
											</div>
										</div>
									</div>

									<div className="flashcard-deck-side">
										<div className="flashcard-deck-actions flashcard-deck-actions-primary">
											<button
												className="flashcard-btn flashcard-btn-purple"
												onClick={(e) => {
													e.stopPropagation();
													onSelectDeck(deck.id);
												}}
												title="学习模式"
											>
												<Brain size={18} />
												<span>Study</span>
											</button>
											<button
												className="flashcard-btn flashcard-btn-blue"
												onClick={(e) => {
													e.stopPropagation();
													onStartPractice(deck.id);
												}}
												title="刷题模式"
											>
												<Target size={18} />
												<span>Practice</span>
											</button>
										</div>
										<div className="flashcard-deck-actions flashcard-deck-actions-secondary">
											<button
												className="flashcard-btn flashcard-btn-orange"
												onClick={(e) => {
													e.stopPropagation();
													onOpenWordList(deck.id);
												}}
												title="单词List"
											>
												<List size={18} />
												<span>List</span>
											</button>
											<button
												className="flashcard-btn flashcard-btn-green"
												onClick={(e) => {
													e.stopPropagation();
													onOpenSourceFile(
														deck.filePath,
													);
												}}
												title="打开源文件"
											>
												<FileText size={18} />
												<span>Source</span>
											</button>
											<button
												className="flashcard-btn flashcard-btn-gray"
												onClick={(e) => {
													e.stopPropagation();
													setModalDeckId(deck.id);
												}}
												title="学习设置"
											>
												<Settings size={18} />
												<span>Setting</span>
											</button>
										</div>
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
