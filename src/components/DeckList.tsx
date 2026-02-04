import React, { useEffect, useState, useCallback } from "react";
import { Deck, DeckStats } from "../types";
import { DataStore } from "../dataStore";

interface DeckListProps {
	dataStore: DataStore;
	onSelectDeck: (deckId: string) => void;
	onStartPractice: (deckId: string) => void;
	onRefresh: () => Promise<void>;
}

export const DeckList: React.FC<DeckListProps> = ({
	dataStore,
	onSelectDeck,
	onStartPractice,
	onRefresh,
}) => {
	const [decks, setDecks] = useState<Deck[]>([]);
	const [stats, setStats] = useState<Map<string, DeckStats>>(new Map());
	const [isLoading, setIsLoading] = useState(false);

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
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
};
