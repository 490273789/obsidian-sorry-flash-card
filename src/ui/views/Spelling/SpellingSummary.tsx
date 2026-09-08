import React, { memo } from "react";
import { Check, CircleX, House, Keyboard, RotateCw, Target, Timer } from "lucide-react";
import type {
	SpellingIncorrectCardSnapshot,
	SpellingResultSnapshot,
} from "../../../sessions/sessionLifecycle";
import { FlashcardButton } from "../../primitives/Button";
import { FlashcardHeader } from "../../primitives/Header";
import { MarkdownContent } from "../../primitives/Markdown";
import { useI18n } from "../../context/I18nContext";
import { formatCompactDuration } from "../../../i18n";

interface SpellingSummaryProps {
	result: SpellingResultSnapshot;
	onRetryIncorrect: () => void;
	onRestart: () => void;
	onHome: () => void;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}

export const SpellingSummary = React.memo(function SpellingSummary({
	result,
	onRetryIncorrect,
	onRestart,
	onHome,
	markdownRenderer,
}: SpellingSummaryProps) {
	const { t, language } = useI18n();
	const incorrectCards = result.incorrectCards;

	return (
		<div className="flashcard-practice-summary flashcard-spelling-summary">
			<FlashcardHeader icon={Keyboard} title={t("spelling.title")} onBack={onHome} />
			<div className="flashcard-practice-summary-scroll">
				<div className="flashcard-practice-summary-header">
					<div className="flashcard-practice-summary-title">
						{result.firstTryIncorrectCount === 0
							? t("spelling.completePerfect")
							: t("spelling.completeWithErrors")}
					</div>
					<div className="flashcard-practice-summary-deck">
						{t("spelling.summaryDeck", {
							deckName: result.originDeck.name,
							totalWords: result.totalWords,
							time: formatCompactDuration(language, result.timeSpent),
						})}
					</div>
				</div>

				<div className="flashcard-practice-summary-stats">
					<div className="flashcard-practice-stat-card flashcard-practice-stat-accuracy">
						<div className="flashcard-practice-stat-value">
							{result.firstTryAccuracy.toFixed(1)}%
						</div>
						<div className="flashcard-practice-stat-label">
							{t("spelling.firstTryAccuracy")}
						</div>
					</div>
					<div className="flashcard-practice-stat-row">
						<SummaryStat
							icon={Check}
							label={t("spelling.firstTryCorrect")}
							value={result.firstTryCorrectCount}
						/>
						<SummaryStat
							icon={CircleX}
							label={t("spelling.firstTryIncorrect")}
							value={result.firstTryIncorrectCount}
						/>
						<SummaryStat
							icon={Target}
							label={t("spelling.totalAttempts")}
							value={result.totalRetrievalAttempts}
						/>
						<SummaryStat
							icon={Timer}
							label={t("practice.timeSpent")}
							value={formatCompactDuration(language, result.timeSpent)}
						/>
					</div>
				</div>

				{incorrectCards.length > 0 && (
					<div className="flashcard-practice-incorrect-section">
						<h3 className="flashcard-practice-incorrect-title">
							<CircleX size={16} />{" "}
							{t("spelling.incorrectList", {
								count: incorrectCards.length,
							})}
						</h3>
						<div className="flashcard-practice-incorrect-list">
							{incorrectCards.map((card, index) => (
								<IncorrectSpellingItem
									key={card.identity}
									card={card}
									index={index + 1}
									markdownRenderer={markdownRenderer}
								/>
							))}
						</div>
					</div>
				)}
			</div>

			<div className="flashcard-practice-summary-actions">
				{incorrectCards.length > 0 && (
					<FlashcardButton variant="danger" icon={CircleX} onClick={onRetryIncorrect}>
						{t("spelling.retryIncorrect", {
							count: incorrectCards.length,
						})}
					</FlashcardButton>
				)}
				<FlashcardButton variant="primary" icon={RotateCw} onClick={onRestart}>
					{t("spelling.chooseAgain")}
				</FlashcardButton>
				<FlashcardButton variant="secondary" icon={House} onClick={onHome}>
					{t("practice.home")}
				</FlashcardButton>
			</div>
		</div>
	);
});

function SummaryStat({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Check;
	label: string;
	value: string | number;
}) {
	return (
		<div className="flashcard-practice-stat-item fc-lift">
			<span className="flashcard-practice-stat-icon">
				<Icon size={14} />
			</span>
			<span className="flashcard-practice-stat-text">
				{label}
				<strong>{value}</strong>
			</span>
		</div>
	);
}

const IncorrectSpellingItem = memo(function IncorrectSpellingItem({
	card,
	index,
	markdownRenderer,
}: {
	card: SpellingIncorrectCardSnapshot;
	index: number;
	markdownRenderer: (content: string, el: HTMLElement) => Promise<void>;
}) {
	const { t } = useI18n();
	return (
		<div className="flashcard-practice-incorrect-item fc-lift">
			<div className="flashcard-practice-incorrect-index">{index}</div>
			<div className="flashcard-practice-incorrect-content">
				<div className="flashcard-practice-incorrect-question">
					<span className="flashcard-practice-incorrect-label">
						{t("spelling.meaningPrompt")}
					</span>
					<MarkdownContent
						content={card.back}
						className="flashcard-practice-incorrect-text"
						markdownRenderer={markdownRenderer}
					/>
				</div>
				<div className="flashcard-spelling-summary-answer-row">
					<span>
						{t("spelling.firstInput")}: <strong>{card.firstInput || "—"}</strong>
					</span>
					<span>
						{t("spelling.correctAnswer")}: <strong>{card.expectedAnswer}</strong>
					</span>
				</div>
			</div>
		</div>
	);
});
