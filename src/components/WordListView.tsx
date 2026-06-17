import React, {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import ReactDOM from "react-dom";
import { BookOpenText, X } from "lucide-react";
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

type VisibleWordColumnKey = "front" | "back";

const DEFAULT_WORD_ROW_HEIGHT = 118;
const DEFAULT_WORD_ROW_GAP = 12;
const WORD_LIST_OVERSCAN_ROWS = 8;

interface WordColumnConfig {
	key: VisibleWordColumnKey;
	className: string;
	textClassName: string;
	buttonClassName: string;
	variant: "blue" | "orange";
	labelKey: "wordList.firstColumn" | "wordList.secondColumn";
	maskKey:
		| "wordList.maskFirstColumn"
		| "wordList.maskSecondColumn";
	unmaskKey:
		| "wordList.unmaskFirstColumn"
		| "wordList.unmaskSecondColumn";
	toggleKey:
		| "wordList.toggleFirstColumn"
		| "wordList.toggleSecondColumn";
}

const VISIBLE_WORD_COLUMNS: readonly WordColumnConfig[] = [
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
];

interface WordRowLayout {
	item: WordItem;
	index: number;
	top: number;
	height: number;
}

interface VirtualWordRows {
	rows: WordRowLayout[];
	totalHeight: number;
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

function getVirtualWordRows(
	items: WordItem[],
	rowHeights: ReadonlyMap<string, number>,
	rowGap: number,
): VirtualWordRows {
	let offsetTop = 0;
	const rows = items.map((item, index) => {
		const height = rowHeights.get(item.id) ?? DEFAULT_WORD_ROW_HEIGHT;
		const row = {
			item,
			index,
			top: offsetTop,
			height,
		};
		offsetTop += height + rowGap;
		return row;
	});

	return {
		rows,
		totalHeight: Math.max(0, offsetTop - rowGap),
	};
}

function findFirstVisibleIndex(
	rows: readonly WordRowLayout[],
	targetTop: number,
): number {
	let low = 0;
	let high = rows.length - 1;
	let result = rows.length;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const row = rows[middle];
		if (!row) break;
		if (row.top + row.height >= targetTop) {
			result = middle;
			high = middle - 1;
		} else {
			low = middle + 1;
		}
	}

	return result;
}

function findLastVisibleIndex(
	rows: readonly WordRowLayout[],
	targetBottom: number,
): number {
	let low = 0;
	let high = rows.length - 1;
	let result = -1;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const row = rows[middle];
		if (!row) break;
		if (row.top <= targetBottom) {
			result = middle;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}

	return result;
}

interface WordRowProps {
	item: WordItem;
	maskedColumns: ReadonlySet<VisibleWordColumnKey>;
	revealedIdsByColumn: Record<VisibleWordColumnKey, ReadonlySet<string>>;
	onReveal: (columnKey: VisibleWordColumnKey, itemId: string) => void;
	onShowExplanation: (item: WordItem) => void;
}

const WordRow = memo(function WordRow({
	item,
	maskedColumns,
	revealedIdsByColumn,
	onReveal,
	onShowExplanation,
}: WordRowProps) {
	const { t } = useI18n();
	const revealTimerRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (revealTimerRef.current !== null) {
				window.clearTimeout(revealTimerRef.current);
			}
		};
	}, []);

	return (
		<div className="flashcard-word-row">
			{VISIBLE_WORD_COLUMNS.map((column) => {
				const isMasked = maskedColumns.has(column.key);
				const isRevealed = revealedIdsByColumn[column.key].has(item.id);
				const showContent = !isMasked || isRevealed;
				const value = item[column.key];
				const handleReveal = (
					e: React.MouseEvent<HTMLDivElement>,
				) => {
					if (e.detail > 1) return;
					if (revealTimerRef.current !== null) {
						window.clearTimeout(revealTimerRef.current);
					}
					revealTimerRef.current = window.setTimeout(() => {
						revealTimerRef.current = null;
						onReveal(column.key, item.id);
					}, 160);
				};
				const handleRevealFromKeyboard = () =>
					onReveal(column.key, item.id);
				const handleShowExplanation = () => {
					if (revealTimerRef.current !== null) {
						window.clearTimeout(revealTimerRef.current);
						revealTimerRef.current = null;
					}
					onShowExplanation(item);
				};

				return (
					<div
						key={column.key}
						role="button"
						tabIndex={0}
						className={`flashcard-word-cell ${column.className} ${
							!showContent ? "masked" : ""
						}`}
						onClick={handleReveal}
						onDoubleClick={handleShowExplanation}
						onKeyDown={(e) =>
							activateOnKey(e, handleRevealFromKeyboard)
						}
						title={
							isMasked
								? `${t(column.toggleKey)} · ${t(
										"wordList.openThirdColumnHint",
									)}`
								: `${t(column.labelKey)} · ${t(
										"wordList.openThirdColumnHint",
									)}`
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

interface WordExplanationModalProps {
	item: WordItem;
	onClose: () => void;
}

const WordExplanationModal = memo(function WordExplanationModal({
	item,
	onClose,
}: WordExplanationModalProps) {
	const { t } = useI18n();
	const handleBackdropClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (e.target === e.currentTarget) onClose();
		},
		[onClose],
	);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		activeDocument.addEventListener("keydown", handleKeyDown);
		return () => {
			activeDocument.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	const modal = (
		<div className="flashcard-modal-backdrop" onClick={handleBackdropClick}>
			<div className="flashcard-modal flashcard-word-explanation-modal">
				<div className="flashcard-modal-header">
					<div className="flashcard-modal-heading">
						<div className="flashcard-modal-kicker fc-kicker">
							<BookOpenText size={14} />{" "}
							{t("wordList.thirdColumn")}
						</div>
						<span className="flashcard-modal-title">
							{item.front}
						</span>
						<span className="flashcard-modal-subtitle">
							{item.back}
						</span>
					</div>
					<FlashcardButton
						preset="icon"
						icon={X}
						onClick={onClose}
						title={t("common.close")}
						aria-label={t("common.close")}
					/>
				</div>

				<div className="flashcard-modal-body">
					<div className="flashcard-word-explanation-content">
						{item.explanation || t("wordList.emptyColumn")}
					</div>
				</div>
			</div>
		</div>
	);

	const container =
		activeDocument.querySelector(".flashcard-root") ?? activeDocument.body;
	return ReactDOM.createPortal(modal, container);
});

export const WordListView: React.FC<WordListViewProps> = ({ deck, onBack }) => {
	const { t } = useI18n();
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const sourceItems = useMemo(
		() =>
			[...deck.cards]
				.sort((a, b) => a.indexInFile - b.indexInFile)
				.map(toWordItem),
		[deck.cards],
	);
	const [maskedColumns, setMaskedColumns] = useState<
		Set<VisibleWordColumnKey>
	>(new Set());
	const [shuffledItems, setShuffledItems] = useState<WordItem[] | null>(
		null,
	);
	const [revealedIdsByColumn, setRevealedIdsByColumn] = useState<
		Record<VisibleWordColumnKey, Set<string>>
	>({
		front: new Set(),
		back: new Set(),
	});
	const [activeExplanationItem, setActiveExplanationItem] =
		useState<WordItem | null>(null);
	const [rowHeights, setRowHeights] = useState<Map<string, number>>(
		new Map(),
	);
	const [rowGap, setRowGap] = useState(DEFAULT_WORD_ROW_GAP);
	const [viewport, setViewport] = useState({
		scrollTop: 0,
		height: DEFAULT_WORD_ROW_HEIGHT * 10,
		width: 0,
	});

	const isShuffled = shuffledItems !== null;
	const items = shuffledItems ?? sourceItems;
	const virtualRows = useMemo(
		() => getVirtualWordRows(items, rowHeights, rowGap),
		[items, rowGap, rowHeights],
	);
	const visibleRows = useMemo(() => {
		if (virtualRows.rows.length === 0) return [];

		const overscanPixels =
			(DEFAULT_WORD_ROW_HEIGHT + rowGap) * WORD_LIST_OVERSCAN_ROWS;
		const startIndex = Math.max(
			0,
			findFirstVisibleIndex(
				virtualRows.rows,
				viewport.scrollTop - overscanPixels,
			),
		);
		const endIndex = Math.min(
			virtualRows.rows.length - 1,
			findLastVisibleIndex(
				virtualRows.rows,
				viewport.scrollTop + viewport.height + overscanPixels,
			),
		);

		if (endIndex < startIndex) return [];
		return virtualRows.rows.slice(startIndex, endIndex + 1);
	}, [rowGap, viewport.height, viewport.scrollTop, virtualRows.rows]);

	useEffect(() => {
		setShuffledItems(null);
		setRevealedIdsByColumn({
			front: new Set(),
			back: new Set(),
		});
		setRowHeights(new Map());
		setActiveExplanationItem(null);
	}, [sourceItems]);

	useLayoutEffect(() => {
		const scrollEl = scrollRef.current;
		if (!scrollEl) return;

		let frameId = 0;
		const updateViewport = () => {
			if (frameId !== 0) return;
			frameId = window.requestAnimationFrame(() => {
				frameId = 0;
				setViewport((prev) => {
					const next = {
						scrollTop: scrollEl.scrollTop,
						height: scrollEl.clientHeight,
						width: scrollEl.clientWidth,
					};
					if (
						prev.scrollTop === next.scrollTop &&
						prev.height === next.height &&
						prev.width === next.width
					) {
						return prev;
					}
					return next;
				});

				const listEl = listRef.current;
				if (!listEl) return;
				const parsedGap = Number.parseFloat(
					window.getComputedStyle(listEl).gap,
				);
				if (!Number.isFinite(parsedGap)) return;
				setRowGap((prev) =>
					Math.abs(prev - parsedGap) > 0.5 ? parsedGap : prev,
				);
			});
		};

		updateViewport();
		scrollEl.addEventListener("scroll", updateViewport, { passive: true });

		const resizeObserver = new ResizeObserver(updateViewport);
		resizeObserver.observe(scrollEl);

		return () => {
			if (frameId !== 0) {
				window.cancelAnimationFrame(frameId);
			}
			scrollEl.removeEventListener("scroll", updateViewport);
			resizeObserver.disconnect();
		};
	}, []);

	useEffect(() => {
		setRowHeights(new Map());
	}, [viewport.width]);

	const handleShuffleToggle = useCallback(() => {
		setShuffledItems((currentItems) =>
			currentItems ? null : shuffleArray(sourceItems),
		);
	}, [sourceItems]);

	const handleReveal = useCallback(
		(columnKey: VisibleWordColumnKey, itemId: string) => {
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

	const handleToggleColumnMask = useCallback(
		(columnKey: VisibleWordColumnKey) => {
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
		},
		[],
	);

	const handleShowExplanation = useCallback((item: WordItem) => {
		setActiveExplanationItem(item);
	}, []);

	const handleCloseExplanation = useCallback(() => {
		setActiveExplanationItem(null);
	}, []);

	const handleMeasureRow = useCallback(
		(itemId: string, element: HTMLDivElement | null) => {
			if (!element) return;
			const measuredHeight = element.getBoundingClientRect().height;
			if (measuredHeight <= 0) return;

			setRowHeights((prev) => {
				const currentHeight = prev.get(itemId);
				if (
					currentHeight !== undefined &&
					Math.abs(currentHeight - measuredHeight) <= 1
				) {
					return prev;
				}
				const next = new Map(prev);
				next.set(itemId, measuredHeight);
				return next;
			});
		},
		[],
	);

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
					{VISIBLE_WORD_COLUMNS.map((column) => {
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

			<div className="flashcard-word-list-scroll" ref={scrollRef}>
				<div
					ref={listRef}
					className="flashcard-word-list-virtual flashcard-word-list-virtualized"
					style={{ height: virtualRows.totalHeight }}
				>
					{visibleRows.map((row) => (
						<div
							key={row.item.id}
							ref={(element) =>
								handleMeasureRow(row.item.id, element)
							}
							className="flashcard-word-row-frame"
							style={{
								transform: `translateY(${row.top}px)`,
							}}
						>
							<WordRow
								item={row.item}
								maskedColumns={maskedColumns}
								revealedIdsByColumn={revealedIdsByColumn}
								onReveal={handleReveal}
								onShowExplanation={handleShowExplanation}
							/>
						</div>
					))}
				</div>
			</div>
			{activeExplanationItem && (
				<WordExplanationModal
					item={activeExplanationItem}
					onClose={handleCloseExplanation}
				/>
			)}
		</div>
	);
};
