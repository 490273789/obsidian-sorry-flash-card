import React, { useState } from "react";
import {
	Target,
	Shuffle,
	ChartBar,
	CircleX,
	SlidersHorizontal,
} from "lucide-react";
import { Deck } from "../types";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardHeader } from "./FlashcardHeader";
import { useI18n } from "./I18nContext";

const QUICK_QUESTION_COUNTS = [20, 50, 100, 150, 200];

interface PracticeSetupProps {
	deck: Deck;
	onStartPractice: (questionCount: number) => void;
	onBack: () => void;
}

export const PracticeSetup: React.FC<PracticeSetupProps> = ({
	deck,
	onStartPractice,
	onBack,
}) => {
	const { t } = useI18n();
	const maxQuestions = deck.cards.length;
	const [questionCount, setQuestionCount] = useState(
		Math.min(50, maxQuestions),
	);
	const coverage =
		maxQuestions > 0 ? Math.round((questionCount / maxQuestions) * 100) : 0;
	const [inputValue, setInputValue] = useState(
		Math.min(50, maxQuestions).toString(),
	);

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
		if (questionCount >= 1 && questionCount <= maxQuestions) {
			onStartPractice(questionCount);
		}
	};

	const handleQuickSelect = (count: number) => {
		const actualCount = Math.min(count, maxQuestions);
		setQuestionCount(actualCount);
		setInputValue(actualCount.toString());
	};

	return (
		<div className="flashcard-practice-setup">
			<FlashcardHeader
				icon={Target}
				title={t("practice.title")}
				onBack={onBack}
			/>

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
							<strong>{t("practice.randomPick")}</strong>
						</div>
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								{t("practice.currentCount")}
							</span>
							<strong>
								{questionCount} {t("common.questions")}
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
						<span className="flashcard-stat-caption">
							{t("practice.deckScale")}
						</span>
						<span className="flashcard-stat-value purple">
							{maxQuestions}
						</span>
						<span className="flashcard-stat-label">
							{t("practice.availableQuestions")}
						</span>
					</div>
					<div className=" flashcard-stat-card">
						<span className="flashcard-stat-caption">
							{t("practice.currentCount")}
						</span>
						<span className="flashcard-stat-value blue">
							{questionCount}
						</span>
						<span className="flashcard-stat-label">
							{t("practice.currentSelection")}
						</span>
					</div>
					<div className="flashcard-stat-card">
						<span className="flashcard-stat-caption">
							{t("practice.coverage")}
						</span>
						<span className="flashcard-stat-value green">
							{coverage}%
						</span>
						<span className="flashcard-stat-label">
							{t("practice.scanRange")}
						</span>
					</div>
				</div>

				<div className="flashcard-study-panel flashcard-practice-question-selector">
					<div className="flashcard-study-panel-heading flashcard-practice-panel-heading">
						<div className="flashcard-practice-panel-title">
							<SlidersHorizontal size={16} />{" "}
							{t("practice.chooseCount")}
						</div>
						<div className="flashcard-study-panel-note">
							{t("practice.chooseCountNote")}
						</div>
					</div>
					{/* flashcard-practice-quick-btn */}
					<div className="flashcard-practice-quick-buttons">
						{QUICK_QUESTION_COUNTS.map((count) => (
							<FlashcardButton
								key={count}
								className="flashcard-active-orang"
								active={
									questionCount ===
									Math.min(count, maxQuestions)
								}
								onClick={() => handleQuickSelect(count)}
								disabled={
									count > maxQuestions &&
									count !== maxQuestions
								}
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
				</div>

				<div className="flashcard-study-panel flashcard-practice-info">
					<div className="flashcard-study-panel-heading flashcard-practice-panel-heading">
						<div className="flashcard-practice-panel-title">
							<Target size={16} /> {t("practice.rules")}
						</div>
						<div className="flashcard-study-panel-note">
							{t("practice.rulesNote")}
						</div>
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
								count: questionCount,
							})}
						</div>
						<div className="flashcard-study-action-subtitle">
							{t("practice.actionSubtitle")}
						</div>
					</div>
					<FlashcardButton
						variant="green"
						onClick={handleStart}
						disabled={maxQuestions === 0}
					>
						{t("practice.startQuestions", {
							count: questionCount,
						})}
					</FlashcardButton>
				</div>
			</div>
		</div>
	);
};
