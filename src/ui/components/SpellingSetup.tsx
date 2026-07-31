import React, { useState } from "react";
import { BrainCircuit, Keyboard, ListOrdered, SlidersHorizontal } from "lucide-react";
import type { Deck } from "../../shared/types";
import type {
	SpellingDeckProgressStats,
	SpellingSessionStartOptions,
} from "../../sessions/spellingSessionRuntime";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardHeader } from "./FlashcardHeader";
import { useI18n } from "./I18nContext";
import { SetupControlGroup, SetupSelector } from "./SetupSelector";

const QUICK_COUNTS = [10, 20, 50];

interface SpellingSetupProps {
	deck: Deck;
	stats: SpellingDeckProgressStats;
	onStart: (options: SpellingSessionStartOptions) => void;
	onBack: () => void;
}

export const SpellingSetup: React.FC<SpellingSetupProps> = ({ deck, stats, onStart, onBack }) => {
	const { t } = useI18n();
	const maxQuestions = stats.total;
	const defaultCount = Math.min(20, maxQuestions);
	const [mode, setMode] = useState<"smart" | "range">("smart");
	const [questionCount, setQuestionCount] = useState(defaultCount);
	const [rangeStart, setRangeStart] = useState(1);
	const [rangeEnd, setRangeEnd] = useState(defaultCount);
	const rangeCount = Math.max(0, rangeEnd - rangeStart + 1);
	const currentCount = mode === "smart" ? questionCount : rangeCount;

	const handleStart = () => {
		if (mode === "range") {
			onStart({
				mode: "range",
				startIndex: rangeStart,
				endIndex: rangeEnd,
			});
			return;
		}
		onStart({ mode: "smart", questionCount });
	};

	return (
		<div className="flashcard-practice-setup flashcard-spelling-setup">
			<FlashcardHeader
				icon={Keyboard}
				title={t("spelling.title")}
				onBack={onBack}
				stats={[
					{
						key: "total",
						value: stats.total,
						label: t("spelling.totalWords"),
						tone: "blue",
					},
					{
						key: "unpracticed",
						value: stats.unpracticed,
						label: t("spelling.unpracticed"),
						tone: "orange",
					},
					{
						key: "reinforcement",
						value: stats.reinforcement,
						label: t("spelling.reinforcement"),
						tone: "red",
					},
					{
						key: "stable",
						value: stats.stable,
						label: t("spelling.stable"),
						tone: "green",
					},
				]}
			/>

			<div className="flashcard-setup-content">
				<div className="flashcard-study-hero flashcard-spelling-hero">
					<div className="flashcard-study-hero-copy">
						<div className="flashcard-deck-name-wrapper">
							<div className="flashcard-deck-name">{deck.name}</div>
							<div className="flashcard-deck-tag">{deck.tag}</div>
						</div>

						<div className="flashcard-practice-setup-subtitle">
							{t("spelling.setupSubtitle")}
						</div>
					</div>
				</div>

				<div className="flashcard-study-panel flashcard-setup-controls">
					<SetupControlGroup
						icon={SlidersHorizontal}
						title={t("spelling.chooseWords")}
						note={t("spelling.chooseWordsNote")}
					>
						<SetupSelector
							value={mode}
							ariaLabel={t("spelling.chooseWords")}
							options={[
								{
									value: "smart",
									label: t("spelling.smartSelection"),
									icon: BrainCircuit,
								},
								{
									value: "range",
									label: t("spelling.rangeSelection"),
									icon: ListOrdered,
								},
							]}
							onChange={setMode}
						/>

						<div className="flashcard-setup-control-detail">
							{mode === "smart" ? (
								<div className="flashcard-practice-quick-buttons">
									{QUICK_COUNTS.map((count) => (
										<FlashcardButton
											key={count}
											type="button"
											className="flashcard-setup-chip"
											active={questionCount === count}
											onClick={() => setQuestionCount(count)}
											disabled={count > maxQuestions}
										>
											{count}
										</FlashcardButton>
									))}
									<FlashcardButton
										type="button"
										className="flashcard-setup-chip"
										active={questionCount === maxQuestions}
										onClick={() => setQuestionCount(maxQuestions)}
									>
										{t("common.all")}
									</FlashcardButton>
								</div>
							) : (
								<div className="flashcard-practice-range-group">
									<div className="flashcard-practice-range-inputs">
										<label className="flashcard-setup-range-field">
											<span className="flashcard-practice-input-label">
												{t("practice.rangeStart")}
											</span>
											<input
												type="number"
												className="flashcard-practice-input"
												min={1}
												max={maxQuestions}
												value={rangeStart}
												onChange={(event) => {
													const next = Math.max(
														1,
														Math.min(
															Number(event.target.value),
															rangeEnd,
														),
													);
													setRangeStart(next);
												}}
											/>
										</label>
										<label className="flashcard-setup-range-field">
											<span className="flashcard-practice-input-label">
												{t("practice.rangeEnd")}
											</span>
											<input
												type="number"
												className="flashcard-practice-input"
												min={rangeStart}
												max={maxQuestions}
												value={rangeEnd}
												onChange={(event) => {
													const next = Math.max(
														rangeStart,
														Math.min(
															Number(event.target.value),
															maxQuestions,
														),
													);
													setRangeEnd(next);
												}}
											/>
										</label>
									</div>
									<div className="flashcard-practice-range-summary">
										{t("spelling.rangeSummary", {
											start: rangeStart,
											end: rangeEnd,
											count: rangeCount,
										})}
									</div>
								</div>
							)}
						</div>
					</SetupControlGroup>
				</div>

				<div className="flashcard-study-panel flashcard-practice-info">
					<div className="flashcard-study-panel-heading flashcard-practice-panel-heading">
						<div className="flashcard-practice-panel-title">
							<Keyboard size={16} /> {t("spelling.rules")}
						</div>
						<div className="flashcard-study-panel-note">{t("spelling.rulesNote")}</div>
					</div>
					<div className="flashcard-practice-info-item">
						<span>{t("spelling.rulePrompt")}</span>
					</div>
					<div className="flashcard-practice-info-item">
						<span>{t("spelling.ruleCorrection")}</span>
					</div>
					<div className="flashcard-practice-info-item">
						<span>{t("spelling.ruleMatching")}</span>
					</div>
				</div>

				<div className="flashcard-study-action-bar">
					<div>
						<div className="flashcard-study-action-title">
							{t("spelling.challenge", { count: currentCount })}
						</div>
						<div className="flashcard-study-action-subtitle">
							{mode === "smart"
								? t("spelling.smartActionSubtitle")
								: t("spelling.rangeActionSubtitle")}
						</div>
					</div>
					<FlashcardButton
						variant="green"
						onClick={handleStart}
						disabled={currentCount < 1}
					>
						{t("spelling.start", { count: currentCount })}
					</FlashcardButton>
				</div>
			</div>
		</div>
	);
};
