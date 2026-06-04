import React, { useEffect, useMemo, useState } from "react";
import type { Deck, FlashCard } from "../types";
import { shuffleArray } from "../utils";

interface WordListViewProps {
	deck: Deck;
	onBack: () => void;
}

interface WordItem {
	id: string;
	front: string;
	back: string;
	index: number;
}

function stripHashSymbols(text: string): string {
	return text.replace(/#/g, "").trim();
}

function toWordItem(card: FlashCard): WordItem {
	return {
		id: card.id,
		front: stripHashSymbols(card.question),
		back: card.answer.trim(),
		index: card.indexInFile,
	};
}

export const WordListView: React.FC<WordListViewProps> = ({ deck, onBack }) => {
	const sourceItems = useMemo(
		() =>
			[...deck.cards]
				.sort((a, b) => a.indexInFile - b.indexInFile)
				.map(toWordItem),
		[deck.cards],
	);
	const [isMaskChinese, setIsMaskChinese] = useState(false);
	const [isMaskEnglish, setIsMaskEnglish] = useState(false);
	const [isShuffled, setIsShuffled] = useState(false);
	const [items, setItems] = useState<WordItem[]>(sourceItems);
	const [revealedChineseIds, setRevealedChineseIds] = useState<Set<string>>(
		new Set(),
	);
	const [revealedEnglishIds, setRevealedEnglishIds] = useState<Set<string>>(
		new Set(),
	);

	useEffect(() => {
		setItems(sourceItems);
		setIsShuffled(false);
		setRevealedChineseIds(new Set());
		setRevealedEnglishIds(new Set());
	}, [sourceItems]);

	const handleShuffleToggle = () => {
		if (isShuffled) {
			setItems(sourceItems);
			setIsShuffled(false);
		} else {
			setItems(shuffleArray(sourceItems));
			setIsShuffled(true);
		}
	};

	const handleRevealChinese = (itemId: string) => {
		if (!isMaskChinese) return;
		setRevealedChineseIds((prev) => {
			const next = new Set(prev);
			if (next.has(itemId)) {
				next.delete(itemId);
			} else {
				next.add(itemId);
			}
			return next;
		});
	};

	const handleRevealEnglish = (itemId: string) => {
		if (!isMaskEnglish) return;
		setRevealedEnglishIds((prev) => {
			const next = new Set(prev);
			if (next.has(itemId)) {
				next.delete(itemId);
			} else {
				next.add(itemId);
			}
			return next;
		});
	};

	const activateOnKey = (
		e: React.KeyboardEvent<HTMLDivElement>,
		action: () => void,
	) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			action();
		}
	};

	return (
		<div className="flashcard-word-list-view">
			<div className="flashcard-word-list-sticky-top">
				<div className="flashcard-word-list-header">
					<button
						className="flashcard-btn flashcard-btn-back"
						onClick={onBack}
					>
						← Back
					</button>
					<div className="flashcard-word-list-header-main">
						<div className="flashcard-word-list-title">
							📖 {deck.name} 单词List
						</div>
						<div className="flashcard-word-list-subtitle">
							共 {items.length} 个单词 · 标签 {deck.tag}
						</div>
					</div>
				</div>

				<div className="flashcard-word-list-toolbar">
					<button
						className={`flashcard-btn shuffle flashcard-btn-green ${isShuffled ? "active" : ""}`}
						onClick={handleShuffleToggle}
					>
						{isShuffled ? "恢复顺序" : "乱序"}
					</button>
					<button
						className={`flashcard-btn english flashcard-btn-blue ${isMaskEnglish ? "active" : ""}`}
						onClick={() => {
							setIsMaskEnglish((v) => !v);
							setRevealedEnglishIds(new Set());
						}}
					>
						{isMaskEnglish ? "取消遮罩英文" : "遮罩英文"}
					</button>
					<button
						className={`flashcard-btn chinese flashcard-btn-orange ${isMaskChinese ? "active" : ""}`}
						onClick={() => {
							setIsMaskChinese((v) => !v);
							setRevealedChineseIds(new Set());
						}}
					>
						{isMaskChinese ? "取消遮罩中文" : "遮罩中文"}
					</button>
				</div>
			</div>

			<div className="flashcard-word-list-scroll">
				<div className="flashcard-word-list-virtual">
					{items.map((item) => {
						const showChinese =
							!isMaskChinese || revealedChineseIds.has(item.id);
						const showEnglish =
							!isMaskEnglish || revealedEnglishIds.has(item.id);

						return (
							<div key={item.id} className="flashcard-word-row">
								<div
									role="button"
									tabIndex={0}
									className={`flashcard-word-cell flashcard-word-cell-left ${
										!showEnglish ? "masked" : ""
									}`}
									onClick={() => handleRevealEnglish(item.id)}
									onKeyDown={(e) =>
										activateOnKey(e, () =>
											handleRevealEnglish(item.id),
										)
									}
									title={
										isMaskEnglish
											? "点击切换显示/隐藏英文"
											: "英文列"
									}
								>
									{showEnglish ? (
										<span className="flashcard-word-front">
											{item.front}
										</span>
									) : (
										<span className="flashcard-word-mask-text">
											点击显示
										</span>
									)}
								</div>
								<div
									role="button"
									tabIndex={0}
									className={`flashcard-word-cell flashcard-word-cell-right ${
										!showChinese ? "masked" : ""
									}`}
									onClick={() => handleRevealChinese(item.id)}
									onKeyDown={(e) =>
										activateOnKey(e, () =>
											handleRevealChinese(item.id),
										)
									}
									title={
										isMaskChinese
											? "点击切换显示/隐藏中文"
											: "中文列"
									}
								>
									{showChinese ? (
										<span className="flashcard-word-back">
											{item.back}
										</span>
									) : (
										<span className="flashcard-word-mask-text">
											点击显示
										</span>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};
