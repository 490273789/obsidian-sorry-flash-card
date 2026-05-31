import React, { useEffect, useRef } from "react";
import {
	FileText,
	Check,
	X,
	Timer,
	CircleX,
	RotateCw,
	House,
} from "lucide-react";
import { Deck, FlashCard, PracticeResult, FlashcardSettings } from "../types";
import { DataStore } from "../dataStore";

interface PracticeSummaryProps {
	deck: Deck;
	dataStore: DataStore;
	result: PracticeResult;
	settings: FlashcardSettings;
	onRestart: () => void;
	onPracticeIncorrect: () => void;
	onHome: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

export const PracticeSummary: React.FC<PracticeSummaryProps> = ({
	deck,
	dataStore,
	result,
	settings,
	onRestart,
	onPracticeIncorrect,
	onHome,
	markdownRenderer,
}) => {
	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}分${secs}秒`;
	};

	const getRandomMessage = (messages: string[]): string => {
		if (messages.length === 0) return "刷题完成！";
		const randomIndex = Math.floor(Math.random() * messages.length);
		return messages[randomIndex] || "刷题完成！";
	};

	const getCompletionMessage = (): string => {
		if (result.incorrectCount === 0) {
			// 全对，使用全对文案
			return getRandomMessage(settings.practicePerfectMessages);
		} else {
			// 有错题，使用错题文案
			return getRandomMessage(settings.practiceErrorMessages);
		}
	};

	const getAccuracyColor = (accuracy: number): string => {
		if (accuracy >= 90) return "var(--color-green)";
		if (accuracy >= 70) return "var(--color-blue)";
		if (accuracy >= 50) return "var(--color-orange)";
		return "var(--color-red)";
	};

	const incorrectCards: FlashCard[] = result.incorrectCardIds
		.map((id) => dataStore.getCard(deck.id, id))
		.filter((card): card is FlashCard => card !== undefined);

	return (
		<div className="flashcard-practice-summary">
			<div className="flashcard-practice-summary-header">
				<div className="flashcard-home-kicker">Session recap</div>
				<h2 className="flashcard-practice-summary-title">
					{getCompletionMessage()}
				</h2>
				<div className="flashcard-practice-summary-deck">
					{deck.name} · 共 {result.totalQuestions} 题 · 用时{" "}
					{formatTime(result.timeSpent)}
				</div>
			</div>

			<div className="flashcard-practice-summary-stats">
				<div className="flashcard-practice-stat-card flashcard-practice-stat-accuracy">
					<div
						className="flashcard-practice-stat-value"
						style={{ color: getAccuracyColor(result.accuracy) }}
					>
						{result.accuracy.toFixed(1)}%
					</div>
					<div className="flashcard-practice-stat-label">正确率</div>
				</div>

				<div className="flashcard-practice-stat-row">
					<div className="flashcard-practice-stat-item">
						<span className="flashcard-practice-stat-icon">
							<FileText size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							总题数: <strong>{result.totalQuestions}</strong>
						</span>
					</div>
					<div className="flashcard-practice-stat-item flashcard-practice-stat-correct">
						<span className="flashcard-practice-stat-icon">
							<Check size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							正确: <strong>{result.correctCount}</strong>
						</span>
					</div>
					<div className="flashcard-practice-stat-item flashcard-practice-stat-wrong">
						<span className="flashcard-practice-stat-icon">
							<X size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							错误: <strong>{result.incorrectCount}</strong>
						</span>
					</div>
					<div className="flashcard-practice-stat-item">
						<span className="flashcard-practice-stat-icon">
							<Timer size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							用时:{" "}
							<strong>{formatTime(result.timeSpent)}</strong>
						</span>
					</div>
				</div>
			</div>

			{incorrectCards.length > 0 && (
				<div className="flashcard-practice-incorrect-section">
					<h3 className="flashcard-practice-incorrect-title">
						<CircleX size={16} /> 错题列表 ({incorrectCards.length}
						题)
					</h3>
					<div className="flashcard-practice-incorrect-list">
						{incorrectCards.map((card, index) => (
							<IncorrectCardItem
								key={card.id}
								card={card}
								index={index + 1}
								markdownRenderer={markdownRenderer}
							/>
						))}
					</div>
				</div>
			)}

			<div className="flashcard-practice-summary-actions">
				<button
					className="flashcard-btn flashcard-btn-primary flashcard-practice-action-btn"
					onClick={onRestart}
				>
					<RotateCw size={14} /> 再装一次
				</button>
				{result.incorrectCount > 0 && (
					<button
						className="flashcard-btn flashcard-btn-danger flashcard-practice-action-btn"
						onClick={onPracticeIncorrect}
					>
						<CircleX size={14} /> 装杯失败 ({result.incorrectCount})
					</button>
				)}
				<button
					className="flashcard-btn flashcard-btn-secondary flashcard-practice-action-btn"
					onClick={onHome}
				>
					<House size={14} /> 返回首页
				</button>
			</div>
		</div>
	);
};

interface IncorrectCardItemProps {
	card: FlashCard;
	index: number;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

const IncorrectCardItem: React.FC<IncorrectCardItemProps> = ({
	card,
	index,
	markdownRenderer,
}) => {
	const questionRef = useRef<HTMLDivElement>(null);
	const answerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (questionRef.current) {
			questionRef.current.innerHTML = "";
			void markdownRenderer(card.question, questionRef.current);
		}
		if (answerRef.current) {
			answerRef.current.innerHTML = "";
			void markdownRenderer(card.answer, answerRef.current);
		}
	}, [card, markdownRenderer]);

	return (
		<div className="flashcard-practice-incorrect-item">
			<div className="flashcard-practice-incorrect-index">{index}</div>
			<div className="flashcard-practice-incorrect-content">
				<div className="flashcard-practice-incorrect-question">
					<span className="flashcard-practice-incorrect-label">
						问:
					</span>
					<div
						ref={questionRef}
						className="flashcard-practice-incorrect-text"
					/>
				</div>
				<div className="flashcard-practice-incorrect-answer">
					<span className="flashcard-practice-incorrect-label">
						答:
					</span>
					<div
						ref={answerRef}
						className="flashcard-practice-incorrect-text"
					/>
				</div>
			</div>
		</div>
	);
};
