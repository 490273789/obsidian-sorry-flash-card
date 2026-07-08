import React, { useState } from "react";
import {
	Target,
	Shuffle,
	ChartBar,
	CircleX,
	SlidersHorizontal,
	Repeat2,
	ListOrdered,
} from "lucide-react";
import { CardDirection, Deck } from "../../shared/types";
import type { PracticeSessionStartOptions } from "../../sessions/practiceSessionRuntime";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardHeader } from "./FlashcardHeader";
import { useI18n } from "./I18nContext";

const QUICK_QUESTION_COUNTS = [20, 50, 100, 150, 200];

type PracticeSelectionMode = "random-count" | "range";

interface PracticeSetupProps {
	deck: Deck;
	defaultDirection: CardDirection;
	onStartPractice: (options: PracticeSessionStartOptions) => void;
	onBack: () => void;
}

export const PracticeSetup: React.FC<PracticeSetupProps> = ({
	deck,
	defaultDirection,
	onStartPractice,
	onBack,
}) => {
	const { t } = useI18n();
	const maxQuestions = deck.cards.length;
	const defaultQuestionCount = Math.min(50, maxQuestions);
	const [selectionMode, setSelectionMode] = useState<PracticeSelectionMode>("random-count");
	const [questionCount, setQuestionCount] = useState(defaultQuestionCount);
	const [inputValue, setInputValue] = useState(defaultQuestionCount.toString());
	const [rangeStart, setRangeStart] = useState(1);
	const [rangeEnd, setRangeEnd] = useState(defaultQuestionCount);
	const [rangeStartInput, setRangeStartInput] = useState("1");
	const [rangeEndInput, setRangeEndInput] = useState(defaultQuestionCount.toString());
	const [direction, setDirection] = useState<CardDirection>(defaultDirection);
	const rangeQuestionCount = Math.max(0, rangeEnd - rangeStart + 1);
	const currentQuestionCount = selectionMode === "range" ? rangeQuestionCount : questionCount;
	const coverage = maxQuestions > 0 ? Math.round((currentQuestionCount / maxQuestions) * 100) : 0;

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setInputValue(value);

		const num = parseInt(value, 10);
		if (!isNaN(num) && num >= 1) {
			setQuestionCount(Math.min(num, maxQuestions));
		}
	};

	const handleInputBlur = () => {
		// Normalize the value on blur
		const num = parseInt(inputValue, 10);
		if (isNaN(num) || num < 1) {
			setQuestionCount(1);
			setInputValue("1");
		} else {
			const normalized = Math.min(num, maxQuestions);
			setQuestionCount(normalized);
			setInputValue(normalized.toString());
		}
	};

	const handleStart = () => {
		if (selectionMode === "range") {
			if (rangeQuestionCount >= 1 && rangeEnd <= maxQuestions) {
				onStartPractice({
					mode: "range",
					startIndex: rangeStart,
					endIndex: rangeEnd,
					direction,
				});
			}
			return;
		}

		if (questionCount >= 1 && questionCount <= maxQuestions) {
			onStartPractice({
				mode: "random-count",
				questionCount,
				direction,
			});
		}
	};

	const handleQuickSelect = (count: number) => {
		const actualCount = Math.min(count, maxQuestions);
		setQuestionCount(actualCount);
		setInputValue(actualCount.toString());
	};

	const syncRange = (start: number, end: number) => {
		setRangeStart(start);
		setRangeEnd(end);
		setRangeStartInput(start.toString());
		setRangeEndInput(end.toString());
	};

	const handleRangeStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setRangeStartInput(value);

		const num = parseInt(value, 10);
		if (!isNaN(num) && num >= 1) {
			const normalizedStart = Math.min(num, maxQuestions);
			const normalizedEnd = Math.max(rangeEnd, normalizedStart);
			syncRange(normalizedStart, normalizedEnd);
		}
	};

	const handleRangeEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setRangeEndInput(value);

		const num = parseInt(value, 10);
		if (!isNaN(num) && num >= 1) {
			const normalizedEnd = Math.min(Math.max(num, rangeStart), maxQuestions);
			syncRange(rangeStart, normalizedEnd);
		}
	};

	const handleRangeBlur = () => {
		const parsedStart = parseInt(rangeStartInput, 10);
		const parsedEnd = parseInt(rangeEndInput, 10);
		const normalizedStart =
			isNaN(parsedStart) || parsedStart < 1
				? rangeStart
				: Math.min(parsedStart, maxQuestions);
		const normalizedEnd =
			isNaN(parsedEnd) || parsedEnd < normalizedStart
				? normalizedStart
				: Math.min(parsedEnd, maxQuestions);
		syncRange(normalizedStart, normalizedEnd);
	};

	return (
		<div className="flashcard-practice-setup">
			<FlashcardHeader icon={Target} title={t("practice.title")} onBack={onBack} />

			<div className="flashcard-setup-content">
				<div className="flashcard-study-hero flashcard-practice-hero">
					<div className="flashcard-study-hero-copy flashcard-practice-hero-copy">
						<div className="flashcard-deck-name">{deck.name}</div>
						<div className="flashcard-deck-tag">{deck.tag}</div>
						<div className="flashcard-deck-total">
							{t("practice.opportunities", {
								count: maxQuestions,
							})}
						</div>
						<div className="flashcard-practice-setup-subtitle">
							{t("practice.setupSubtitle")}
						</div>
					</div>
					<div className="flashcard-study-hero-meta flashcard-practice-hero-meta">
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								{t("practice.pickMethod")}
							</span>
							<strong>
								{selectionMode === "range"
									? t("practice.rangePick")
									: t("practice.randomPick")}
							</strong>
						</div>
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								{t("practice.currentCount")}
							</span>
							<strong>
								{currentQuestionCount} {t("common.questions")}
							</strong>
						</div>
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								{t("practice.coverage")}
							</span>
							<strong>{coverage}%</strong>
						</div>
					</div>
				</div>

				<div className="flashcard-today-stats">
					<div className="flashcard-stat-card">
						<span className="flashcard-stat-caption">{t("practice.deckScale")}</span>
						<span className="flashcard-stat-value purple">{maxQuestions}</span>
						<span className="flashcard-stat-label">
							{t("practice.availableQuestions")}
						</span>
					</div>
					<div className=" flashcard-stat-card">
						<span className="flashcard-stat-caption">{t("practice.currentCount")}</span>
						<span className="flashcard-stat-value blue">{currentQuestionCount}</span>
						<span className="flashcard-stat-label">
							{t("practice.currentSelection")}
						</span>
					</div>
					<div className="flashcard-stat-card">
						<span className="flashcard-stat-caption">{t("practice.coverage")}</span>
						<span className="flashcard-stat-value green">{coverage}%</span>
						<span className="flashcard-stat-label">{t("practice.scanRange")}</span>
					</div>
				</div>

				<div className="flashcard-study-panel flashcard-practice-question-selector">
					<div className="flashcard-study-panel-heading flashcard-practice-panel-heading">
						<div className="flashcard-practice-panel-title">
							<SlidersHorizontal size={16} /> {t("practice.chooseCount")}
						</div>
						<div className="flashcard-study-panel-note">
							{t("practice.chooseCountNote")}
						</div>
					</div>
					<div className="flashcard-practice-mode-options">
						<FlashcardButton
							className="flashcard-practice-mode-btn"
							active={selectionMode === "random-count"}
							onClick={() => setSelectionMode("random-count")}
						>
							<Shuffle size={16} /> {t("practice.modeRandomCount")}
						</FlashcardButton>
						<FlashcardButton
							className="flashcard-practice-mode-btn"
							active={selectionMode === "range"}
							onClick={() => setSelectionMode("range")}
						>
							<ListOrdered size={16} /> {t("practice.modeRange")}
						</FlashcardButton>
					</div>
					{/* flashcard-practice-quick-btn */}
					{selectionMode === "random-count" ? (
						<>
							<div className="flashcard-practice-quick-buttons">
								{QUICK_QUESTION_COUNTS.map((count) => (
									<FlashcardButton
										key={count}
										className="flashcard-active-orang"
										active={questionCount === Math.min(count, maxQuestions)}
										onClick={() => handleQuickSelect(count)}
										disabled={count > maxQuestions && count !== maxQuestions}
									>
										{count > maxQuestions ? maxQuestions : count}
									</FlashcardButton>
								))}
								<FlashcardButton
									className="flashcard-practice-quick-btn"
									active={questionCount === maxQuestions}
									onClick={() => handleQuickSelect(maxQuestions)}
								>
									{t("common.all")}
								</FlashcardButton>
							</div>

							<div className="flashcard-practice-input-group">
								<span className="flashcard-practice-input-label">
									{t("practice.customCount")}
								</span>
								<input
									type="number"
									className="flashcard-practice-input"
									value={inputValue}
									onChange={handleInputChange}
									onBlur={handleInputBlur}
									min={1}
									max={maxQuestions}
								/>
								<span className="flashcard-practice-input-hint">
									(1 - {maxQuestions})
								</span>
							</div>
						</>
					) : (
						<div className="flashcard-practice-range-group">
							<div className="flashcard-practice-range-inputs">
								<label className="flashcard-practice-input-group">
									<span className="flashcard-practice-input-label">
										{t("practice.rangeStart")}
									</span>
									<input
										type="number"
										className="flashcard-practice-input"
										value={rangeStartInput}
										onChange={handleRangeStartChange}
										onBlur={handleRangeBlur}
										min={1}
										max={maxQuestions}
									/>
								</label>
								<label className="flashcard-practice-input-group">
									<span className="flashcard-practice-input-label">
										{t("practice.rangeEnd")}
									</span>
									<input
										type="number"
										className="flashcard-practice-input"
										value={rangeEndInput}
										onChange={handleRangeEndChange}
										onBlur={handleRangeBlur}
										min={rangeStart}
										max={maxQuestions}
									/>
								</label>
							</div>
							<div className="flashcard-practice-range-summary">
								{t("practice.rangeSummary", {
									start: rangeStart,
									end: rangeEnd,
									count: rangeQuestionCount,
								})}
							</div>
						</div>
					)}
				</div>

				<div className="flashcard-study-panel flashcard-direction-section">
					<div className="flashcard-study-panel-heading flashcard-practice-panel-heading">
						<div className="flashcard-practice-panel-title">
							<Repeat2 size={16} /> {t("mode.direction")}
						</div>
						<div className="flashcard-study-panel-note">
							{direction === "normal" ? t("mode.normalNote") : t("mode.reversedNote")}
						</div>
					</div>
					<div className="flashcard-direction-options">
						<FlashcardButton
							className="flashcard-direction-btn"
							active={direction === "normal"}
							onClick={() => setDirection("normal")}
						>
							<Target size={16} /> {t("mode.normal")}
						</FlashcardButton>
						<FlashcardButton
							className="flashcard-direction-btn"
							active={direction === "reversed"}
							onClick={() => setDirection("reversed")}
						>
							<Repeat2 size={16} /> {t("mode.reversed")}
						</FlashcardButton>
					</div>
				</div>

				<div className="flashcard-study-panel flashcard-practice-info">
					<div className="flashcard-study-panel-heading flashcard-practice-panel-heading">
						<div className="flashcard-practice-panel-title">
							<Target size={16} /> {t("practice.rules")}
						</div>
						<div className="flashcard-study-panel-note">{t("practice.rulesNote")}</div>
					</div>
					<div className="flashcard-practice-info-item">
						<span className="flashcard-practice-info-icon">
							<Shuffle size={16} />
						</span>
						<span>{t("practice.randomOrder")}</span>
					</div>
					<div className="flashcard-practice-info-item">
						<span className="flashcard-practice-info-icon">
							<ChartBar size={16} />
						</span>
						<span>{t("practice.statsAfter")}</span>
					</div>
					<div className="flashcard-practice-info-item">
						<span className="flashcard-practice-info-icon">
							<CircleX size={16} />
						</span>
						<span>{t("practice.reviewMisses")}</span>
					</div>
				</div>

				<div className="flashcard-study-action-bar">
					<div>
						<div className="flashcard-study-action-title">
							{t("practice.challenge", {
								count: currentQuestionCount,
							})}
						</div>
						<div className="flashcard-study-action-subtitle">
							{selectionMode === "range"
								? t("practice.rangeActionSubtitle", {
										start: rangeStart,
										end: rangeEnd,
									})
								: t("practice.actionSubtitle")}
						</div>
					</div>
					<FlashcardButton
						variant="green"
						onClick={handleStart}
						disabled={maxQuestions === 0 || currentQuestionCount < 1}
					>
						{t("practice.startQuestions", {
							count: currentQuestionCount,
						})}
					</FlashcardButton>
				</div>
			</div>
		</div>
	);
};
