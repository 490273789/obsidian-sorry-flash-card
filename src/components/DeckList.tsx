import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { Deck, DeckStats, FlashcardSettings, StudySettings } from "../types";
import { DataStore } from "../dataStore";

// ── Per-deck settings modal ───────────────────────────────────────────────────

interface DeckSettingsModalProps {
	deckName: string;
	deckId: string;
	globalSettings: FlashcardSettings;
	deckOverrides: Partial<StudySettings> | undefined;
	onSave: (overrides: Partial<StudySettings> | null) => Promise<void>;
	onClose: () => void;
}

const DeckSettingsModal: React.FC<DeckSettingsModalProps> = ({
	deckName,
	deckId: _deckId,
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
		<div
			className="flashcard-modal-backdrop"
			onClick={handleBackdropClick}
		>
			<div className="flashcard-modal">
				<div className="flashcard-modal-header">
					<span className="flashcard-modal-title">
						⚙️ {deckName} · 学习设置
					</span>
					<button
						className="flashcard-modal-close"
						onClick={onClose}
						aria-label="关闭"
					>
						✕
					</button>
				</div>

				<div className="flashcard-modal-body">
					<div className="flashcard-deck-settings-toggle">
						<label className="flashcard-deck-settings-toggle-label">
							<input
								type="checkbox"
								checked={useCustom}
								onChange={(e) =>
									setUseCustom(e.target.checked)
								}
							/>
							<span>使用自定义学习设置</span>
						</label>
					</div>

					{!useCustom ? (
						<div className="flashcard-deck-settings-hint">
							当前使用全局默认设置：每日新卡&nbsp;
							<strong>{globalSettings.dailyNewCards}</strong>
							&nbsp;张，每日复习&nbsp;
							<strong>{globalSettings.dailyReviewCards}</strong>
							&nbsp;张，
							{globalSettings.studyOrder === "random"
								? "乱序"
								: "顺序"}
							学习
						</div>
					) : (
						<div className="flashcard-deck-settings-fields">
							<div className="flashcard-deck-settings-field">
								<label>每日新卡数量：{dailyNewCards}</label>
								<input
									type="range"
									min={1}
									max={100}
									value={dailyNewCards}
									onChange={(e) =>
										setDailyNewCards(
											parseInt(e.target.value),
										)
									}
								/>
							</div>
							<div className="flashcard-deck-settings-field">
								<label>
									每日复习数量：{dailyReviewCards}
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
									目标记忆保持率：
									{requestRetention.toFixed(2)}
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
						className="flashcard-btn flashcard-btn-primary"
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

	// Render into the plugin's root container so it stays within the view
	const container =
		document.querySelector(".flashcard-root") ?? document.body;
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
}

export const DeckList: React.FC<DeckListProps> = ({
	dataStore,
	settings,
	onSelectDeck,
	onOpenWordList,
	onStartPractice,
	onRefresh,
	onUpdateDeckStudySettings,
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
			<div className="flashcard-header">
				<h2 className="flashcard-title">📚 靓仔养成计划</h2>
				<div className="flashcard-header-actions">
					<button
						className="flashcard-btn flashcard-btn-icon"
						onClick={() => void handleRefresh()}
						disabled={isLoading}
						title="刷新题库"
					>
						<span
							className={`flashcard-icon ${isLoading ? "spinning" : ""}`}
						>
							↻
						</span>
					</button>
				</div>
			</div>

			{decks.length === 0 ? (
				<div className="flashcard-empty">
					<div className="flashcard-empty-icon">📭</div>
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
							<div key={deck.id} className="flashcard-deck-item">
								<div className="flashcard-deck-main">
									<div className="flashcard-deck-info">
										<div className="flashcard-deck-name">
											{deck.name}
										</div>
										<div className="flashcard-deck-tag">
											{deck.tag}
										</div>
									</div>
									<div className="flashcard-deck-stats">
										<div className="flashcard-stat">
											<span className="flashcard-stat-value">
												{deckStats?.totalCards || 0}
											</span>
											<span className="flashcard-stat-label">
												总数
											</span>
										</div>
										<div className="flashcard-stat flashcard-stat-new">
											<span className="flashcard-stat-value">
												{deckStats?.newCards || 0}
											</span>
											<span className="flashcard-stat-label">
												新卡
											</span>
										</div>
										<div className="flashcard-stat flashcard-stat-due">
											<span className="flashcard-stat-value">
												{deckStats?.dueCards || 0}
											</span>
											<span className="flashcard-stat-label">
												待复习
											</span>
										</div>
										<div className="flashcard-stat">
											<span className="flashcard-stat-value">
												{deck.studyCount}
											</span>
											<span className="flashcard-stat-label">
												学习次数
											</span>
										</div>
									</div>
								</div>

								<div className="flashcard-deck-actions">
									<button
										className="flashcard-btn flashcard-btn-word-list"
										onClick={(e) => {
											e.stopPropagation();
											onOpenWordList(deck.id);
										}}
										title="单词列表"
									>
										📜 列表
									</button>
								</div>

								<div className="flashcard-deck-actions">
									<button
										className="flashcard-btn flashcard-btn-practice"
										onClick={(e) => {
											e.stopPropagation();
											onSelectDeck(deck.id);
										}}
										title="学习模式"
									>
										⚡ 悟道
									</button>
								</div>
								<div className="flashcard-deck-actions">
									<button
										className="flashcard-btn flashcard-btn-practice flashcard-btn-challenge"
										onClick={(e) => {
											e.stopPropagation();
											onStartPractice(deck.id);
										}}
										title="刷题模式"
									>
										⚔️ 装杯
									</button>
								</div>
								<div className="flashcard-deck-actions">
									<button
										className="flashcard-btn flashcard-btn-settings"
										onClick={(e) => {
											e.stopPropagation();
											setModalDeckId(deck.id);
										}}
										title="学习设置"
									>
										⚙️
									</button>
								</div>
							</div>
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
