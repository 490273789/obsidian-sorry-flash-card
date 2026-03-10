import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Deck, FlashCard } from "../types";

interface WordListViewProps {
	deck: Deck;
	onBack: () => void;
}

interface WordItem {
	id: string;
	word: string;
	phonetic: string;
	meaning: string;
	index: number;
}

const META_PREFIXES = ["prefix", "root", "suffix", "考察形式", "词根", "词缀"];
const ESTIMATED_ROW_HEIGHT = 76;
const OVERSCAN = 8;

function findStartIndex(offsets: number[], scrollTop: number): number {
	let low = 0;
	let high = Math.max(0, offsets.length - 2);

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const start = offsets[mid] ?? 0;
		const next = offsets[mid + 1] ?? Number.MAX_SAFE_INTEGER;

		if (start <= scrollTop && next > scrollTop) {
			return mid;
		}

		if (start < scrollTop) {
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return Math.max(0, Math.min(low, offsets.length - 2));
}

function isMetaLine(line: string): boolean {
	const normalized = line.trim().toLowerCase();
	return META_PREFIXES.some((prefix) =>
		normalized.startsWith(prefix.toLowerCase()),
	);
}

function formatMeaningWithPos(rawMeaning: string): string {
	const normalized = rawMeaning
		.replace(/；/g, ";")
		.replace(/\s+/g, " ")
		.trim();
	const segments = normalized
		.split(";")
		.map((s) => s.trim())
		.filter(Boolean);

	const posStartRegex = /^(n|v|adj|adv|prep|conj|pron|int|vt|vi|aux|art)\./i;
	const posSegments = segments.filter((segment) =>
		posStartRegex.test(segment),
	);

	if (posSegments.length > 0) {
		return posSegments.join("\n");
	}

	return rawMeaning.trim();
}

function stripMarkdown(text: string): string {
	return text
		.replace(/^#{1,6}\s*/gm, "")
		.replace(/\*|_|~|`|>|\[|\]|\(|\)/g, "")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[[^\]]+\]\([^)]*\)/g, "$1")
		.trim();
}

function extractWord(question: string): string {
	const lines = question
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	for (const line of lines) {
		const wordMarker = line.match(/^(?:word|单词)\s*[:：]\s*(.+)$/i);
		if (wordMarker?.[1]) {
			return stripMarkdown(wordMarker[1]);
		}
	}

	return lines.length > 0 ? stripMarkdown(lines[0] ?? "") : "";
}

function extractPhonetic(answer: string): string {
	const lines = answer
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	for (const line of lines) {
		const marker = line.match(/^(?:phonetic|音标)\s*[:：]\s*(.+)$/i);
		if (marker?.[1]) {
			return marker[1].trim();
		}
	}

	const match = answer.match(/\/(?:[^/\n]|\\\/)+\//);
	return match?.[0]?.trim() ?? "";
}

function extractMeaning(answer: string): string {
	const lines = answer
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	for (const line of lines) {
		const marker = line.match(/^(?:meaning|中文|释义)\s*[:：]\s*(.+)$/i);
		if (marker?.[1]) {
			return formatMeaningWithPos(marker[1]);
		}
	}

	const firstMeaningIndex = lines.findIndex(
		(line) => /[\u4e00-\u9fff]/.test(line) && !isMetaLine(line),
	);
	if (firstMeaningIndex === -1) {
		return "";
	}

	const meaningLines: string[] = [];
	for (let i = firstMeaningIndex; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (isMetaLine(line)) {
			break;
		}
		if (!/[\u4e00-\u9fff]/.test(line)) {
			break;
		}
		meaningLines.push(line);
	}

	const merged = meaningLines.join("\n").trim();
	if (!merged) {
		return "";
	}

	return formatMeaningWithPos(merged);
}

function toWordItem(card: FlashCard): WordItem {
	const word = extractWord(card.question);
	const phonetic = extractPhonetic(card.answer);
	const meaning = extractMeaning(card.answer);

	return {
		id: card.id,
		word: word || "(未识别单词)",
		phonetic,
		meaning: meaning || "(未识别中文释义)",
		index: card.indexInFile,
	};
}

function shuffleItems(items: WordItem[]): WordItem[] {
	const shuffled = [...items];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const temp = shuffled[i];
		if (!temp || !shuffled[j]) {
			continue;
		}
		shuffled[i] = shuffled[j];
		shuffled[j] = temp;
	}
	return shuffled;
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
	const [containerHeight, setContainerHeight] = useState(0);
	const [scrollTop, setScrollTop] = useState(0);
	const [rowHeightsVersion, setRowHeightsVersion] = useState(0);
	const [isScrolling, setIsScrolling] = useState(false);
	const listRef = useRef<HTMLDivElement>(null);
	const rowHeightsRef = useRef<Map<number, number>>(new Map());
	const scrollStopTimerRef = useRef<number | null>(null);

	useEffect(() => {
		setItems(sourceItems);
		setIsShuffled(false);
		setRevealedChineseIds(new Set());
		setRevealedEnglishIds(new Set());
		rowHeightsRef.current.clear();
		setRowHeightsVersion((v) => v + 1);
		setScrollTop(0);
	}, [sourceItems]);

	useEffect(() => {
		const updateContainerHeight = () => {
			if (!listRef.current) {
				return;
			}
			setContainerHeight(listRef.current.clientHeight);
		};

		updateContainerHeight();
		window.addEventListener("resize", updateContainerHeight);

		return () => {
			window.removeEventListener("resize", updateContainerHeight);
		};
	}, []);

	useEffect(() => {
		return () => {
			if (scrollStopTimerRef.current !== null) {
				window.clearTimeout(scrollStopTimerRef.current);
			}
		};
	}, []);

	const handleShuffleToggle = () => {
		if (isShuffled) {
			setItems(sourceItems);
			setIsShuffled(false);
		} else {
			setItems(shuffleItems(sourceItems));
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

	const offsets = useMemo(() => {
		const nextOffsets = new Array<number>(items.length + 1);
		nextOffsets[0] = 0;

		for (let i = 0; i < items.length; i++) {
			const measured = rowHeightsRef.current.get(i);
			const prev = nextOffsets[i] ?? 0;
			nextOffsets[i + 1] = prev + (measured ?? ESTIMATED_ROW_HEIGHT);
		}

		return nextOffsets;
	}, [items, rowHeightsVersion]);

	const totalHeight = offsets[offsets.length - 1] ?? 0;
	const viewportBottom = scrollTop + containerHeight;
	const firstVisibleIndex = findStartIndex(offsets, Math.max(0, scrollTop));
	const startIndex = Math.max(0, firstVisibleIndex - OVERSCAN);

	let endIndex = firstVisibleIndex;
	while (
		endIndex < items.length &&
		(offsets[endIndex] ?? 0) < viewportBottom
	) {
		endIndex++;
	}
	endIndex = Math.min(items.length, endIndex + OVERSCAN);

	const visibleItems = items.slice(startIndex, endIndex);
	const offsetY = offsets[startIndex] ?? 0;

	const setMeasuredRowHeight = (index: number, height: number) => {
		const prev = rowHeightsRef.current.get(index);
		if (prev !== undefined && Math.abs(prev - height) < 1) {
			return;
		}
		rowHeightsRef.current.set(index, height);
		setRowHeightsVersion((v) => v + 1);
	};

	useEffect(() => {
		if (isScrolling || !listRef.current) {
			return;
		}

		const rows = listRef.current.querySelectorAll<HTMLDivElement>(
			".flashcard-word-row[data-row-index]",
		);
		let hasChanges = false;

		rows.forEach((row) => {
			const indexAttr = row.dataset.rowIndex;
			if (!indexAttr) {
				return;
			}

			const index = Number(indexAttr);
			if (!Number.isFinite(index)) {
				return;
			}

			const height = row.getBoundingClientRect().height;
			const prev = rowHeightsRef.current.get(index);
			if (prev === undefined || Math.abs(prev - height) >= 1) {
				rowHeightsRef.current.set(index, height);
				hasChanges = true;
			}
		});

		if (hasChanges) {
			setRowHeightsVersion((v) => v + 1);
		}
	}, [
		isScrolling,
		startIndex,
		endIndex,
		isMaskChinese,
		isMaskEnglish,
		revealedChineseIds,
		revealedEnglishIds,
	]);

	const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
		setScrollTop(e.currentTarget.scrollTop);
		setIsScrolling(true);

		if (scrollStopTimerRef.current !== null) {
			window.clearTimeout(scrollStopTimerRef.current);
		}

		scrollStopTimerRef.current = window.setTimeout(() => {
			setIsScrolling(false);
			scrollStopTimerRef.current = null;
		}, 120);
	};

	return (
		<div className="flashcard-word-list-view">
			<div className="flashcard-word-list-header">
				<button
					className="flashcard-btn flashcard-btn-back"
					onClick={onBack}
				>
					← 返回
				</button>
				<div className="flashcard-word-list-header-main">
					<h2 className="flashcard-word-list-title">
						📖 {deck.name} 单词列表
					</h2>
					<div className="flashcard-word-list-subtitle">
						共 {items.length} 个单词 · 标签 {deck.tag}
					</div>
				</div>
			</div>

			<div className="flashcard-word-list-toolbar">
				<button
					className={`flashcard-btn flashcard-word-tool-btn flashcard-tool-mask-cn ${isMaskChinese ? "active" : ""}`}
					onClick={() => {
						setIsMaskChinese((v) => !v);
						setRevealedChineseIds(new Set());
					}}
				>
					{isMaskChinese ? "取消遮罩中文" : "遮罩中文"}
				</button>
				<button
					className={`flashcard-btn flashcard-word-tool-btn flashcard-tool-mask-en ${isMaskEnglish ? "active" : ""}`}
					onClick={() => {
						setIsMaskEnglish((v) => !v);
						setRevealedEnglishIds(new Set());
					}}
				>
					{isMaskEnglish ? "取消遮罩英文" : "遮罩英文"}
				</button>
				<button
					className={`flashcard-btn flashcard-word-tool-btn flashcard-tool-shuffle ${isShuffled ? "active" : ""}`}
					onClick={handleShuffleToggle}
				>
					{isShuffled ? "恢复顺序" : "乱序"}
				</button>
			</div>

			<div className="flashcard-word-list-head-row">
				<div className="flashcard-word-col-left">英文 / 音标</div>
				<div className="flashcard-word-col-right">中文释义</div>
			</div>

			<div
				className="flashcard-word-list-scroll"
				ref={listRef}
				onScroll={handleScroll}
			>
				<div
					style={{ height: `${totalHeight}px`, position: "relative" }}
				>
					<div
						className="flashcard-word-list-virtual"
						style={{ transform: `translateY(${offsetY}px)` }}
					>
						{visibleItems.map((item, visibleIndex) => {
							const itemIndex = startIndex + visibleIndex;
							const showChinese =
								!isMaskChinese ||
								revealedChineseIds.has(item.id);
							const showEnglish =
								!isMaskEnglish ||
								revealedEnglishIds.has(item.id);

							return (
								<div
									key={item.id}
									className="flashcard-word-row"
									data-row-index={itemIndex}
									ref={(el) => {
										if (!el || isScrolling) return;
										setMeasuredRowHeight(
											itemIndex,
											el.getBoundingClientRect().height,
										);
									}}
								>
									<div
										role="button"
										tabIndex={0}
										className={`flashcard-word-cell flashcard-word-cell-left ${
											!showEnglish ? "masked" : ""
										}`}
										onClick={() =>
											handleRevealEnglish(item.id)
										}
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
											<>
												<span className="flashcard-word-word">
													{item.word}
												</span>
												<span className="flashcard-word-phonetic">
													{item.phonetic || "-"}
												</span>
											</>
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
										onClick={() =>
											handleRevealChinese(item.id)
										}
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
											<span className="flashcard-word-meaning">
												{item.meaning}
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
		</div>
	);
};
