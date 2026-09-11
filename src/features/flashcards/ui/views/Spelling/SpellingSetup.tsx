import React, { useState } from "react";
import { BrainCircuit, Keyboard, ListOrdered, SlidersHorizontal } from "lucide-react";
import type { Deck } from "../../../../../core/shared/types";
import type { SessionStartRequest } from "../../../domain/sessions/sessionLifecycle";
import type { SpellingSetupPlan } from "../../../domain/sessions/sessionPlanner";
import { FlashcardButton } from "../../../../../core/ui/primitives/Button";
import { FlashcardHeader } from "../../../../../core/ui/primitives/Header";
import { FlashcardInput } from "../../../../../core/ui/primitives/Input";
import { useFlashcardI18n } from "../../../strings/context";
import { SetupControlGroup, SetupSelector } from "../../../../../core/ui/primitives/SetupSelector";

const QUICK_COUNTS = [10, 20, 50];

interface SpellingSetupProps {
	deck: Deck;
	plan: SpellingSetupPlan;
	onStartSession: (request: SessionStartRequest) => void;
	onBack: () => void;
}

export const SpellingSetup = React.memo(function SpellingSetup({
	deck,
	plan,
	onStartSession,
	onBack,
}: SpellingSetupProps) {
	const { t } = useFlashcardI18n();
	const maxQuestions = plan.maxQuestions;
	const quickCounts = Array.from(
		new Set(
			QUICK_COUNTS.map((count) => Math.min(count, maxQuestions)).filter(
				(count) => count > 0 && count < maxQuestions,
			),
		),
	);
	const stats = plan.stats;
	const [mode, setMode] = useState<"smart" | "range">(plan.initialSelectionMode);
	const [questionCount, setQuestionCount] = useState(plan.initialQuestionCount);
	const [rangeStart, setRangeStart] = useState(plan.initialRangeStart);
	const [rangeEnd, setRangeEnd] = useState(plan.initialRangeEnd);
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
									{quickCounts.map((count) => (
										<FlashcardButton
											key={count}
											type="button"
											className="flashcard-setup-chip"
											active={questionCount === count}
											onClick={() => setQuestionCount(count)}
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
						variant="primary"
						preset="show"
						size="lg"
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
