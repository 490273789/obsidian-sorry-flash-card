import React, { useState } from "react";
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
			<div className="flashcard-practice-setup-header">
				<button
					className="flashcard-btn flashcard-btn-back"
					onClick={onBack}
				>
					← 返回
				</button>
				<h2 className="flashcard-practice-setup-title">🎯 装杯模式</h2>
			</div>

			<div className="flashcard-practice-setup-content">
				<div className="flashcard-practice-deck-info">
					<div className="flashcard-practice-deck-name">
						{deck.name}
					</div>
					<div className="flashcard-practice-deck-tag">
						{deck.tag}
					</div>
					<div className="flashcard-practice-deck-total">
						共 <strong>{maxQuestions}</strong> 次装杯机会
					</div>
				</div>

				<div className="flashcard-practice-question-selector">
					<label className="flashcard-practice-label">
						选择装杯次数
					</label>

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

				<div className="flashcard-practice-info">
					<div className="flashcard-practice-info-item">
						<span className="flashcard-practice-info-icon">🔀</span>
						<span>装杯顺序随机</span>
					</div>
					<div className="flashcard-practice-info-item">
						<span className="flashcard-practice-info-icon">📊</span>
						<span>完成后查看成功装杯率统计</span>
					</div>
					<div className="flashcard-practice-info-item">
						<span className="flashcard-practice-info-icon">❌</span>
						<span>查看装杯失败列表</span>
					</div>
				</div>

				<button
					className="flashcard-btn flashcard-btn-primary flashcard-practice-start-btn"
					onClick={handleStart}
					disabled={maxQuestions === 0}
				>
					开始整活 ({questionCount} 次)
				</button>
			</div>
		</div>
	);
};
