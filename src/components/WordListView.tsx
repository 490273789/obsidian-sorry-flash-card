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
import { useI18n } from "./I18nContext";

interface WordListViewProps {
	deck: Deck;
	onBack: () => void;
}

interface WordItem {
	id: string;
	front: string;
	back: string;
	explanation: string;
	index: number;
}

function stripHashSymbols(text: string): string {
	return text.replace(/#/g, "").trim();
}

function toWordItem(card: FlashCard): WordItem {
	return {
		id: card.id,
		front: stripHashSymbols(card.front),
		back: card.back.trim(),
		explanation: card.explanation?.trim() ?? "",
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
	const { t } = useI18n();
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
				title={
					isMaskEnglish
						? t("wordList.toggleEnglish")
						: t("wordList.englishColumn")
				}
			>
				{showEnglish ? (
					<span className="flashcard-word-front">{item.front}</span>
				) : (
					<span className="flashcard-word-mask-text">
						{t("wordList.clickToShow")}
					</span>
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
				title={
					isMaskChinese
						? t("wordList.toggleChinese")
						: t("wordList.chineseColumn")
				}
			>
				{showChinese ? (
					<span className="flashcard-word-back">
						{item.back}
						{item.explanation && (
							<span className="flashcard-word-explanation">
								{item.explanation}
							</span>
						)}
					</span>
				) : (
					<span className="flashcard-word-mask-text">
						{t("wordList.clickToShow")}
					</span>
				)}
			</div>
		</div>
	);
});

export const WordListView: React.FC<WordListViewProps> = ({ deck, onBack }) => {
	const { t } = useI18n();
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
								{t("wordList.title", {
									deckName: deck.name,
								})}
							</div>
							<div className="flashcard-word-list-subtitle">
								{t("wordList.subtitle", {
									count: items.length,
									tag: deck.tag,
								})}
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
						{isShuffled
							? t("wordList.restoreOrder")
							: t("wordList.shuffle")}
					</FlashcardButton>
					<FlashcardButton
						variant="blue"
						className="english"
						active={isMaskEnglish}
						onClick={handleToggleEnglishMask}
					>
						{isMaskEnglish
							? t("wordList.unmaskEnglish")
							: t("wordList.maskEnglish")}
					</FlashcardButton>
					<FlashcardButton
						variant="orange"
						className="chinese"
						active={isMaskChinese}
						onClick={handleToggleChineseMask}
					>
						{isMaskChinese
							? t("wordList.unmaskChinese")
							: t("wordList.maskChinese")}
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
