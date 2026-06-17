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

type WordColumnKey = "front" | "back" | "explanation";

interface WordColumnConfig {
	key: WordColumnKey;
	className: string;
	textClassName: string;
	buttonClassName: string;
	variant: "blue" | "orange" | "purple";
	labelKey:
		| "wordList.firstColumn"
		| "wordList.secondColumn"
		| "wordList.thirdColumn";
	maskKey:
		| "wordList.maskFirstColumn"
		| "wordList.maskSecondColumn"
		| "wordList.maskThirdColumn";
	unmaskKey:
		| "wordList.unmaskFirstColumn"
		| "wordList.unmaskSecondColumn"
		| "wordList.unmaskThirdColumn";
	toggleKey:
		| "wordList.toggleFirstColumn"
		| "wordList.toggleSecondColumn"
		| "wordList.toggleThirdColumn";
}

const WORD_COLUMNS: readonly WordColumnConfig[] = [
	{
		key: "front",
		className: "flashcard-word-cell-first",
		textClassName: "flashcard-word-front",
		buttonClassName: "word-column-front",
		variant: "blue",
		labelKey: "wordList.firstColumn",
		maskKey: "wordList.maskFirstColumn",
		unmaskKey: "wordList.unmaskFirstColumn",
		toggleKey: "wordList.toggleFirstColumn",
	},
	{
		key: "back",
		className: "flashcard-word-cell-second",
		textClassName: "flashcard-word-back",
		buttonClassName: "word-column-back",
		variant: "orange",
		labelKey: "wordList.secondColumn",
		maskKey: "wordList.maskSecondColumn",
		unmaskKey: "wordList.unmaskSecondColumn",
		toggleKey: "wordList.toggleSecondColumn",
	},
	{
		key: "explanation",
		className: "flashcard-word-cell-third",
		textClassName: "flashcard-word-explanation-cell",
		buttonClassName: "word-column-explanation",
		variant: "purple",
		labelKey: "wordList.thirdColumn",
		maskKey: "wordList.maskThirdColumn",
		unmaskKey: "wordList.unmaskThirdColumn",
		toggleKey: "wordList.toggleThirdColumn",
	},
];

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
	maskedColumns: ReadonlySet<WordColumnKey>;
	revealedIdsByColumn: Record<WordColumnKey, ReadonlySet<string>>;
	onReveal: (columnKey: WordColumnKey, itemId: string) => void;
}

const WordRow = memo(function WordRow({
	item,
	maskedColumns,
	revealedIdsByColumn,
	onReveal,
}: WordRowProps) {
	const { t } = useI18n();

	return (
		<div className="flashcard-word-row">
			{WORD_COLUMNS.map((column) => {
				const isMasked = maskedColumns.has(column.key);
				const isRevealed = revealedIdsByColumn[column.key].has(item.id);
				const showContent = !isMasked || isRevealed;
				const value = item[column.key];
				const handleReveal = () => onReveal(column.key, item.id);

				return (
					<div
						key={column.key}
						role="button"
						tabIndex={0}
						className={`flashcard-word-cell ${column.className} ${
							!showContent ? "masked" : ""
						}`}
						onClick={handleReveal}
						onKeyDown={(e) => activateOnKey(e, handleReveal)}
						title={
							isMasked ? t(column.toggleKey) : t(column.labelKey)
						}
					>
						{showContent ? (
							<span
								className={
									value
										? column.textClassName
										: "flashcard-word-empty"
								}
							>
								{value || t("wordList.emptyColumn")}
							</span>
						) : (
							<span className="flashcard-word-mask-text">
								{t("wordList.clickToShow")}
							</span>
						)}
					</div>
				);
			})}
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
	const [maskedColumns, setMaskedColumns] = useState<Set<WordColumnKey>>(
		new Set(),
	);
	const [shuffledItems, setShuffledItems] = useState<WordItem[] | null>(
		null,
	);
	const [revealedIdsByColumn, setRevealedIdsByColumn] = useState<
		Record<WordColumnKey, Set<string>>
	>({
		front: new Set(),
		back: new Set(),
		explanation: new Set(),
	});

	const isShuffled = shuffledItems !== null;
	const items = shuffledItems ?? sourceItems;

	useEffect(() => {
		setShuffledItems(null);
		setRevealedIdsByColumn({
			front: new Set(),
			back: new Set(),
			explanation: new Set(),
		});
	}, [sourceItems]);

	const handleShuffleToggle = useCallback(() => {
		setShuffledItems((currentItems) =>
			currentItems ? null : shuffleArray(sourceItems),
		);
	}, [sourceItems]);

	const handleReveal = useCallback(
		(columnKey: WordColumnKey, itemId: string) => {
			if (!maskedColumns.has(columnKey)) return;
			setRevealedIdsByColumn((prev) => {
				const columnIds = new Set(prev[columnKey]);
				if (columnIds.has(itemId)) {
					columnIds.delete(itemId);
				} else {
					columnIds.add(itemId);
				}
				return {
					...prev,
					[columnKey]: columnIds,
				};
			});
		},
		[maskedColumns],
	);

	const handleToggleColumnMask = useCallback((columnKey: WordColumnKey) => {
		setMaskedColumns((prev) => {
			const next = new Set(prev);
			if (next.has(columnKey)) {
				next.delete(columnKey);
			} else {
				next.add(columnKey);
			}
			return next;
		});
		setRevealedIdsByColumn((prev) => ({
			...prev,
			[columnKey]: new Set(),
		}));
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
					{WORD_COLUMNS.map((column) => {
						const isMasked = maskedColumns.has(column.key);
						return (
							<FlashcardButton
								key={column.key}
								variant={column.variant}
								className={column.buttonClassName}
								active={isMasked}
								onClick={() =>
									handleToggleColumnMask(column.key)
								}
							>
								{isMasked
									? t(column.unmaskKey)
									: t(column.maskKey)}
							</FlashcardButton>
						);
					})}
				</div>
			</div>

			<div className="flashcard-word-list-scroll">
				<div className="flashcard-word-list-virtual">
					{items.map((item) => (
						<WordRow
							key={item.id}
							item={item}
							maskedColumns={maskedColumns}
							revealedIdsByColumn={revealedIdsByColumn}
							onReveal={handleReveal}
						/>
					))}
				</div>
			</div>
		</div>
	);
};
