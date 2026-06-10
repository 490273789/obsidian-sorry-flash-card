import React, {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { Deck, FlashCard } from "../types";
import { shuffleArray } from "../utils";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardHeader } from "./FlashcardHeader";

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

function activateOnKey(
	e: React.KeyboardEvent<HTMLDivElement>,
	action: () => void,
): void {
	if (e.key === "Enter" || e.key === " ") {
		e.preventDefault();
		action();
	}
}

interface WordRowProps {
	item: WordItem;
	showChinese: boolean;
	showEnglish: boolean;
	isMaskChinese: boolean;
	isMaskEnglish: boolean;
	onRevealChinese: (itemId: string) => void;
	onRevealEnglish: (itemId: string) => void;
}

const WordRow = memo(function WordRow({
	item,
	showChinese,
	showEnglish,
	isMaskChinese,
	isMaskEnglish,
	onRevealChinese,
	onRevealEnglish,
}: WordRowProps) {
	const handleRevealEnglish = useCallback(() => {
		onRevealEnglish(item.id);
	}, [item.id, onRevealEnglish]);

	const handleRevealChinese = useCallback(() => {
		onRevealChinese(item.id);
	}, [item.id, onRevealChinese]);

	return (
		<div className="flashcard-word-row">
			<div
				role="button"
				tabIndex={0}
				className={`flashcard-word-cell flashcard-word-cell-left ${
					!showEnglish ? "masked" : ""
				}`}
				onClick={handleRevealEnglish}
				onKeyDown={(e) => activateOnKey(e, handleRevealEnglish)}
				title={isMaskEnglish ? "点击切换显示/隐藏英文" : "英文列"}
			>
				{showEnglish ? (
					<span className="flashcard-word-front">{item.front}</span>
				) : (
					<span className="flashcard-word-mask-text">点击显示</span>
				)}
			</div>
			<div
				role="button"
				tabIndex={0}
				className={`flashcard-word-cell flashcard-word-cell-right ${
					!showChinese ? "masked" : ""
				}`}
				onClick={handleRevealChinese}
				onKeyDown={(e) => activateOnKey(e, handleRevealChinese)}
				title={isMaskChinese ? "点击切换显示/隐藏中文" : "中文列"}
			>
				{showChinese ? (
					<span className="flashcard-word-back">{item.back}</span>
				) : (
					<span className="flashcard-word-mask-text">点击显示</span>
				)}
			</div>
		</div>
	);
});

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
	const [shuffledItems, setShuffledItems] = useState<WordItem[] | null>(
		null,
	);
	const [revealedChineseIds, setRevealedChineseIds] = useState<Set<string>>(
		new Set(),
	);
	const [revealedEnglishIds, setRevealedEnglishIds] = useState<Set<string>>(
		new Set(),
	);

	const isShuffled = shuffledItems !== null;
	const items = shuffledItems ?? sourceItems;

	useEffect(() => {
		setShuffledItems(null);
		setRevealedChineseIds(new Set());
		setRevealedEnglishIds(new Set());
	}, [sourceItems]);

	const handleShuffleToggle = useCallback(() => {
		setShuffledItems((currentItems) =>
			currentItems ? null : shuffleArray(sourceItems),
		);
	}, [sourceItems]);

	const handleRevealChinese = useCallback((itemId: string) => {
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
	}, [isMaskChinese]);

	const handleRevealEnglish = useCallback((itemId: string) => {
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
	}, [isMaskEnglish]);

	const handleToggleEnglishMask = useCallback(() => {
		setIsMaskEnglish((value) => !value);
		setRevealedEnglishIds(new Set());
	}, []);

	const handleToggleChineseMask = useCallback(() => {
		setIsMaskChinese((value) => !value);
		setRevealedChineseIds(new Set());
	}, []);

	return (
		<div className="flashcard-word-list-view">
			<div className="flashcard-word-list-sticky-top">
				<FlashcardHeader
					title={
						<div className="flashcard-word-list-header-main">
							<div className="flashcard-word-list-title">
								📖 {deck.name} 单词List
							</div>
							<div className="flashcard-word-list-subtitle">
								共 {items.length} 个单词 · 标签 {deck.tag}
							</div>
						</div>
					}
					onBack={onBack}
				/>

				<div className="flashcard-word-list-toolbar">
					<FlashcardButton
						variant="green"
						className="shuffle"
						active={isShuffled}
						onClick={handleShuffleToggle}
					>
						{isShuffled ? "恢复顺序" : "乱序"}
					</FlashcardButton>
					<FlashcardButton
						variant="blue"
						className="english"
						active={isMaskEnglish}
						onClick={handleToggleEnglishMask}
					>
						{isMaskEnglish ? "取消遮罩英文" : "遮罩英文"}
					</FlashcardButton>
					<FlashcardButton
						variant="orange"
						className="chinese"
						active={isMaskChinese}
						onClick={handleToggleChineseMask}
					>
						{isMaskChinese ? "取消遮罩中文" : "遮罩中文"}
					</FlashcardButton>
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
							<WordRow
								key={item.id}
								item={item}
								showChinese={showChinese}
								showEnglish={showEnglish}
								isMaskChinese={isMaskChinese}
								isMaskEnglish={isMaskEnglish}
								onRevealChinese={handleRevealChinese}
								onRevealEnglish={handleRevealEnglish}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
};
