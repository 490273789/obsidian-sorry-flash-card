import React, { memo, useMemo } from "react";
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
import { FlashcardButton } from "./FlashcardButton";
import { MarkdownContent } from "./MarkdownContent";

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

function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}分${secs}秒`;
}

function getRandomMessage(messages: string[]): string {
	if (messages.length === 0) return "刷题完成！";
	const randomIndex = Math.floor(Math.random() * messages.length);
	return messages[randomIndex] || "刷题完成！";
}

function getAccuracyColor(accuracy: number): string {
	if (accuracy >= 90) return "var(--color-green)";
	if (accuracy >= 70) return "var(--color-blue)";
	if (accuracy >= 50) return "var(--color-orange)";
	return "var(--color-red)";
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
	const completionMessage = useMemo(() => {
		if (result.incorrectCount === 0) {
			// 全对，使用全对文案
			return getRandomMessage(settings.practicePerfectMessages);
		}

		// 有错题，使用错题文案
		return getRandomMessage(settings.practiceErrorMessages);
	}, [
		result.incorrectCount,
		settings.practiceErrorMessages,
		settings.practicePerfectMessages,
	]);

	const cardById = useMemo(
		() => new Map(deck.cards.map((card) => [card.id, card])),
		[deck.cards],
	);

	const incorrectCards: FlashCard[] = useMemo(() => {
		const cards: FlashCard[] = [];
		for (const id of result.incorrectCardIds) {
			const card = cardById.get(id) ?? dataStore.getCard(deck.id, id);
			if (card) cards.push(card);
		}
		return cards;
	}, [cardById, dataStore, deck.id, result.incorrectCardIds]);

	return (
		<div className="flashcard-practice-summary">
			<div className="flashcard-practice-summary-header">
				<div className="flashcard-practice-summary-title">
					{completionMessage}
				</div>
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
					<div className="flashcard-practice-stat-item fc-lift">
						<span className="flashcard-practice-stat-icon">
							<FileText size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							总题数: <strong>{result.totalQuestions}</strong>
						</span>
					</div>
					<div className="flashcard-practice-stat-item flashcard-practice-stat-correct fc-lift">
						<span className="flashcard-practice-stat-icon">
							<Check size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							正确: <strong>{result.correctCount}</strong>
						</span>
					</div>
					<div className="flashcard-practice-stat-item flashcard-practice-stat-wrong fc-lift">
						<span className="flashcard-practice-stat-icon">
							<X size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							错误: <strong>{result.incorrectCount}</strong>
						</span>
					</div>
					<div className="flashcard-practice-stat-item fc-lift">
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
						<CircleX size={16} /> 错题List ({incorrectCards.length}
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
				<FlashcardButton
					variant="green"
					icon={RotateCw}
					iconSize={14}
					onClick={onRestart}
				>
					再装一次
				</FlashcardButton>
				{result.incorrectCount > 0 && (
					<FlashcardButton
						variant="red"
						icon={CircleX}
						iconSize={14}
						onClick={onPracticeIncorrect}
					>
						Practice失败 ({result.incorrectCount})
					</FlashcardButton>
				)}
				<FlashcardButton
					variant="blue"
					icon={House}
					iconSize={14}
					onClick={onHome}
				>
					Back to Deck
				</FlashcardButton>
			</div>
		</div>
	);
};

interface IncorrectCardItemProps {
	card: FlashCard;
	index: number;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

const IncorrectCardItem = memo(function IncorrectCardItem({
	card,
	index,
	markdownRenderer,
}: IncorrectCardItemProps) {
	return (
		<div className="flashcard-practice-incorrect-item fc-lift">
			<div className="flashcard-practice-incorrect-index">{index}</div>
			<div className="flashcard-practice-incorrect-content">
				<div className="flashcard-practice-incorrect-question">
					<span className="flashcard-practice-incorrect-label">
						问:
					</span>
					<MarkdownContent
						content={card.question}
						className="flashcard-practice-incorrect-text"
						markdownRenderer={markdownRenderer}
					/>
				</div>
				<div className="flashcard-practice-incorrect-answer">
					<span className="flashcard-practice-incorrect-label">
						答:
					</span>
					<MarkdownContent
						content={card.answer}
						className="flashcard-practice-incorrect-text"
						markdownRenderer={markdownRenderer}
					/>
				</div>
			</div>
		</div>
	);
});
