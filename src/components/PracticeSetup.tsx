import React, { useState } from "react";
import {
	Target,
	Shuffle,
	ChartBar,
	CircleX,
	Sparkles,
	SlidersHorizontal,
} from "lucide-react";
import { Deck } from "../types";

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
		<div className="flashcard-practice-setup flashcard-practice-setup-screen">
			<div className="flashcard-practice-setup-header">
				<button
					className="flashcard-btn flashcard-btn-back"
					onClick={onBack}
				>
					← 返回
				</button>
				<h2 className="flashcard-practice-setup-title">
					<Target size={18} /> 装杯模式
				</h2>
			</div>

			<div className="flashcard-practice-setup-content">
				<div className="flashcard-study-hero flashcard-practice-hero">
					<div className="flashcard-study-hero-copy flashcard-practice-hero-copy">
						<div className="flashcard-home-kicker">Challenge setup</div>
						<div className="flashcard-study-hero-kicker flashcard-practice-hero-kicker">
							<Sparkles size={14} /> 装杯前配置
						</div>
						<div className="flashcard-practice-deck-name">
							{deck.name}
						</div>
						<div className="flashcard-practice-deck-tag">
							{deck.tag}
						</div>
						<div className="flashcard-practice-deck-total">
							共 <strong>{maxQuestions}</strong> 次装杯机会
						</div>
						<div className="flashcard-practice-setup-subtitle">
							选择本轮题量后，系统会随机抽题，并在结束后汇总正确率与装杯失败列表。
						</div>
					</div>
					<div className="flashcard-study-hero-meta flashcard-practice-hero-meta">
						<div className="flashcard-study-hero-pill flashcard-practice-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								抽题方式
							</span>
							<strong>随机抽取</strong>
						</div>
						<div className="flashcard-study-hero-pill flashcard-practice-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								当前题量
							</span>
							<strong>{questionCount} 题</strong>
						</div>
						<div className="flashcard-study-hero-pill flashcard-practice-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								覆盖率
							</span>
							<strong>{coverage}%</strong>
						</div>
					</div>
				</div>

				<div className="flashcard-study-today-stats flashcard-practice-setup-metrics">
					<div className="flashcard-study-stat-card flashcard-practice-stat-card flashcard-practice-stat-pool">
						<span className="flashcard-study-stat-caption">
							题库规模
						</span>
						<span className="flashcard-study-stat-value">
							{maxQuestions}
						</span>
						<span className="flashcard-study-stat-label">
							可抽取题目
						</span>
					</div>
					<div className="flashcard-study-stat-card flashcard-practice-stat-card flashcard-practice-stat-session">
						<span className="flashcard-study-stat-caption">
							本次题量
						</span>
						<span className="flashcard-study-stat-value">
							{questionCount}
						</span>
						<span className="flashcard-study-stat-label">
							当前选择
						</span>
					</div>
					<div className="flashcard-study-stat-card flashcard-practice-stat-card flashcard-practice-stat-coverage">
						<span className="flashcard-study-stat-caption">
							覆盖率
						</span>
						<span className="flashcard-study-stat-value">
							{coverage}%
						</span>
						<span className="flashcard-study-stat-label">
							本轮扫描范围
						</span>
					</div>
				</div>

				<div className="flashcard-study-panel flashcard-practice-question-selector">
					<div className="flashcard-study-panel-heading flashcard-practice-panel-heading">
						<div className="flashcard-practice-panel-title">
							<SlidersHorizontal size={16} /> 选择装杯次数
						</div>
						<div className="flashcard-study-panel-note">
							建议先从接近整轮题量开始，方便快速感知整体状态
						</div>
					</div>

					<div className="flashcard-practice-quick-buttons">
						{[20, 50, 100, 150, 200].map((count) => (
							<button
								key={count}
								className={`flashcard-btn flashcard-practice-quick-btn flashcard-btn-reset ${
									questionCount ===
									Math.min(count, maxQuestions)
										? "active"
										: ""
								}`}
								onClick={() => handleQuickSelect(count)}
								disabled={
									count > maxQuestions &&
									count !== maxQuestions
								}
							>
								{count > maxQuestions ? maxQuestions : count}
							</button>
						))}
						<button
							className={`flashcard-btn flashcard-practice-quick-btn ${
								questionCount === maxQuestions ? "active" : ""
							}`}
							onClick={() => handleQuickSelect(maxQuestions)}
						>
							全部
						</button>
					</div>

					<div className="flashcard-practice-input-group">
						<span className="flashcard-practice-input-label">
							自定义数量:
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
							<Target size={16} /> 本轮规则
						</div>
						<div className="flashcard-study-panel-note">
							开始后直接进入答题流，结果页统一收口本轮表现
						</div>
					</div>
					<div className="flashcard-practice-info-item">
						<span className="flashcard-practice-info-icon">
							<Shuffle size={16} />
						</span>
						<span>装杯顺序随机</span>
					</div>
					<div className="flashcard-practice-info-item">
						<span className="flashcard-practice-info-icon">
							<ChartBar size={16} />
						</span>
						<span>完成后查看成功装杯率统计</span>
					</div>
					<div className="flashcard-practice-info-item">
						<span className="flashcard-practice-info-icon">
							<CircleX size={16} />
						</span>
						<span>查看装杯失败列表</span>
					</div>
				</div>

				<div className="flashcard-study-action-bar flashcard-practice-action-bar">
					<div className="flashcard-study-action-copy flashcard-practice-action-copy">
						<div className="flashcard-study-action-title">
							准备开始 {questionCount} 题装杯挑战
						</div>
						<div className="flashcard-study-action-subtitle">
							系统将从题库中随机抽取题目，你可以在结束后回看成功率和失误项。
						</div>
					</div>
					<button
						className="flashcard-btn flashcard-btn-primary flashcard-practice-start-btn"
						onClick={handleStart}
						disabled={maxQuestions === 0}
					>
						开始整活 · {questionCount} 题
					</button>
				</div>
			</div>
		</div>
	);
};
