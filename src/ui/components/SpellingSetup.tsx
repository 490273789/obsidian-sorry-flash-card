import React, { useState } from "react";
import { BrainCircuit, Keyboard, ListOrdered, SlidersHorizontal } from "lucide-react";
import type { Deck, SpellingSelection } from "../../shared/types";
import type { SessionStartRequest } from "../../sessions/sessionLifecycle";
import type { SpellingDeckProgressStats } from "../../sessions/spellingSessionPlanner";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardHeader } from "./FlashcardHeader";
import { FlashcardInput } from "./FlashcardInput";
import { useI18n } from "./I18nContext";
import { SetupControlGroup, SetupSelector } from "./SetupSelector";

const QUICK_COUNTS = [10, 20, 50];

interface SpellingSetupProps {
	deck: Deck;
	stats: SpellingDeckProgressStats;
	initialSelection?: SpellingSelection;
	onStartSession: (request: SessionStartRequest) => void;
	onBack: () => void;
}

export const SpellingSetup = React.memo(function SpellingSetup({
	deck,
	stats,
	initialSelection,
	onStartSession,
	onBack,
}: SpellingSetupProps) {
	const { t } = useI18n();
	const maxQuestions = stats.total;
	const defaultCount = Math.min(20, maxQuestions);
	const [mode, setMode] = useState<"smart" | "range">(
		initialSelection?.kind === "range" ? "range" : "smart",
	);
	const [questionCount, setQuestionCount] = useState(
		initialSelection?.kind === "smart"
			? Math.min(initialSelection.questionCount, maxQuestions)
			: defaultCount,
	);
	const [rangeStart, setRangeStart] = useState(
		initialSelection?.kind === "range" ? Math.max(1, initialSelection.startIndex) : 1,
	);
	const [rangeEnd, setRangeEnd] = useState(
		initialSelection?.kind === "range"
			? Math.min(initialSelection.endIndex, maxQuestions)
			: defaultCount,
	);
	const rangeCount = Math.max(0, rangeEnd - rangeStart + 1);
	const currentCount = mode === "smart" ? questionCount : rangeCount;

	const handleStart = () => {
		if (mode === "range") {
			onStartSession({
				mode: "spelling",
				deckId: deck.id,
				selection: {
					kind: "range",
					startIndex: rangeStart,
					endIndex: rangeEnd,
				},
			});
			return;
		}
		onStartSession({
			mode: "spelling",
			deckId: deck.id,
			selection: {
				kind: "smart",
				questionCount,
			},
		});
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
				]}
			/>

			<div className="flashcard-setup-content">
				<div className="flashcard-study-hero flashcard-spelling-hero">
					<div className="flashcard-deck-name-wrapper">
						<div className="flashcard-deck-name">{deck.name}</div>
						<div className="flashcard-deck-tag">{deck.tag}</div>
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
											<FlashcardInput
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
											<FlashcardInput
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
								</div>
							)}
						</div>
					</SetupControlGroup>
				</div>

				<div className="flashcard-study-action-bar">
					<FlashcardButton
						variant="green"
						preset="show"
						onClick={handleStart}
						disabled={currentCount < 1}
					>
						{t("spelling.start", { count: currentCount })}
					</FlashcardButton>
				</div>
			</div>
		</div>
	);
});
