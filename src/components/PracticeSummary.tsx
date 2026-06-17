import React, { memo, useMemo } from "react";
import { FileText, Check, X, Timer, CircleX, RotateCw, House } from "lucide-react";
import { Deck, FlashCard, PracticeResult } from "../types";
import { DataStore } from "../dataStore";
import { FlashcardButton } from "./FlashcardButton";
import { MarkdownContent } from "./MarkdownContent";
import { useI18n } from "./I18nContext";
import { formatCompactDuration } from "../i18n";
import { getDisplayCardContent } from "../cardDisplay";

interface PracticeSummaryProps {
	deck: Deck;
	dataStore: DataStore;
	result: PracticeResult;
	onRestart: () => void;
	onPracticeIncorrect: () => void;
	onHome: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
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
	onRestart,
	onPracticeIncorrect,
	onHome,
	markdownRenderer,
}) => {
	const { t, language } = useI18n();
	const completionMessage = useMemo(() => {
		if (result.incorrectCount === 0) {
			return t("practice.completePerfect");
		}

		return t("practice.completeWithErrors");
	}, [result.incorrectCount, t]);

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
				<div className="flashcard-practice-summary-title">{completionMessage}</div>
				<div className="flashcard-practice-summary-deck">
					{t("practice.summaryDeck", {
						deckName: deck.name,
						totalQuestions: result.totalQuestions,
						time: formatCompactDuration(language, result.timeSpent),
					})}
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
					<div className="flashcard-practice-stat-label">{t("practice.accuracy")}</div>
				</div>

				<div className="flashcard-practice-stat-row">
					<div className="flashcard-practice-stat-item fc-lift">
						<span className="flashcard-practice-stat-icon">
							<FileText size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							{t("practice.totalQuestions")}
							<strong>{result.totalQuestions}</strong>
						</span>
					</div>
					<div className="flashcard-practice-stat-item flashcard-practice-stat-correct fc-lift">
						<span className="flashcard-practice-stat-icon">
							<Check size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							{t("practice.correct")}
							<strong>{result.correctCount}</strong>
						</span>
					</div>
					<div className="flashcard-practice-stat-item flashcard-practice-stat-wrong fc-lift">
						<span className="flashcard-practice-stat-icon">
							<X size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							{t("practice.incorrect")}
							<strong>{result.incorrectCount}</strong>
						</span>
					</div>
					<div className="flashcard-practice-stat-item fc-lift">
						<span className="flashcard-practice-stat-icon">
							<Timer size={14} />
						</span>
						<span className="flashcard-practice-stat-text">
							{t("practice.timeSpent")}
							<strong>{formatCompactDuration(language, result.timeSpent)}</strong>
						</span>
					</div>
				</div>
			</div>

			{incorrectCards.length > 0 && (
				<div className="flashcard-practice-incorrect-section">
					<h3 className="flashcard-practice-incorrect-title">
						<CircleX size={16} />{" "}
						{t("practice.incorrectList", {
							count: incorrectCards.length,
						})}
					</h3>
					<div className="flashcard-practice-incorrect-list">
						{incorrectCards.map((card, index) => (
							<IncorrectCardItem
								key={card.id}
								card={card}
								index={index + 1}
								direction={result.direction}
								markdownRenderer={markdownRenderer}
							/>
						))}
					</div>
				</div>
			)}

			<div className="flashcard-practice-summary-actions">
				<FlashcardButton variant="green" icon={RotateCw} iconSize={14} onClick={onRestart}>
					{t("practice.restart")}
				</FlashcardButton>
				{result.incorrectCount > 0 && (
					<FlashcardButton
						variant="red"
						icon={CircleX}
						iconSize={14}
						onClick={onPracticeIncorrect}
					>
						{t("practice.failed", {
							count: result.incorrectCount,
						})}
					</FlashcardButton>
				)}
				<FlashcardButton variant="blue" icon={House} iconSize={14} onClick={onHome}>
					{t("practice.home")}
				</FlashcardButton>
			</div>
		</div>
	);
};

interface IncorrectCardItemProps {
	card: FlashCard;
	index: number;
	direction: PracticeResult["direction"];
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

const IncorrectCardItem = memo(function IncorrectCardItem({
	card,
	index,
	direction,
	markdownRenderer,
}: IncorrectCardItemProps) {
	const { t } = useI18n();
	const displayContent = getDisplayCardContent(card, direction);

	return (
		<div className="flashcard-practice-incorrect-item fc-lift">
			<div className="flashcard-practice-incorrect-index">{index}</div>
			<div className="flashcard-practice-incorrect-content">
				<div className="flashcard-practice-incorrect-question">
					<span className="flashcard-practice-incorrect-label">
						{t("practice.questionLabel")}
					</span>
					<MarkdownContent
						content={displayContent.prompt}
						className="flashcard-practice-incorrect-text"
						markdownRenderer={markdownRenderer}
					/>
				</div>
				<div className="flashcard-practice-incorrect-answer">
					<span className="flashcard-practice-incorrect-label">
						{t("practice.answerLabel")}
					</span>
					<MarkdownContent
						content={displayContent.answer}
						className="flashcard-practice-incorrect-text"
						markdownRenderer={markdownRenderer}
					/>
				</div>
				{displayContent.explanation && (
					<div className="flashcard-practice-incorrect-explanation">
						<span className="flashcard-practice-incorrect-label">
							{t("common.explanation")}:
						</span>
						<MarkdownContent
							content={displayContent.explanation}
							className="flashcard-practice-incorrect-text"
							markdownRenderer={markdownRenderer}
						/>
					</div>
				)}
			</div>
		</div>
	);
});
