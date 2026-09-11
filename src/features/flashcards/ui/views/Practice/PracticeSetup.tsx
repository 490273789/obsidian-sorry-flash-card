import React, { useState } from "react";
import { Target, Shuffle, SlidersHorizontal, Repeat2, ListOrdered } from "lucide-react";
import type { CardDirection, Deck } from "../../../../../core/shared/types";
import type { SessionStartRequest } from "../../../domain/sessions/sessionLifecycle";
import type { PracticeSetupPlan } from "../../../domain/sessions/sessionPlanner";
import { FlashcardButton } from "../../../../../core/ui/primitives/Button";
import { FlashcardHeader } from "../../../../../core/ui/primitives/Header";
import { FlashcardInput } from "../../../../../core/ui/primitives/Input";
import { useFlashcardI18n } from "../../../strings/context";
import { SetupControlGroup, SetupSelector } from "../../../../../core/ui/primitives/SetupSelector";

const QUICK_QUESTION_COUNTS = [20, 50, 100, 150, 200];

type PracticeSelectionMode = "random" | "range";

interface PracticeSetupProps {
	deck: Deck;
	plan: PracticeSetupPlan;
	defaultDirection?: CardDirection;
	initialDirection?: CardDirection;
	onStartSession: (request: SessionStartRequest) => void;
	onBack: () => void;
}

export const PracticeSetup = React.memo(function PracticeSetup({
	deck,
	plan,
	defaultDirection = "normal",
	initialDirection,
	onStartSession,
	onBack,
}: PracticeSetupProps) {
	const { t } = useFlashcardI18n();
	const maxQuestions = plan.maxQuestions;
	const maxRangeStart = plan.maxRangeStart;
	const quickQuestionCounts = Array.from(
		new Set(
			QUICK_QUESTION_COUNTS.map((count) => Math.min(count, maxQuestions)).filter(
				(count) => count > 0 && count < maxQuestions,
			),
		),
	);
	const [selectionMode, setSelectionMode] = useState<PracticeSelectionMode>(
		plan.initialSelectionMode,
	);
	const [questionCount, setQuestionCount] = useState(plan.initialQuestionCount);
	const [inputValue, setInputValue] = useState(plan.initialQuestionCount.toString());
	const [rangeStart, setRangeStart] = useState(plan.initialRangeStart);
	const [rangeEnd, setRangeEnd] = useState(plan.initialRangeEnd);
	const [rangeStartInput, setRangeStartInput] = useState(plan.initialRangeStart.toString());
	const [rangeEndInput, setRangeEndInput] = useState(plan.initialRangeEnd.toString());
	const [direction, setDirection] = useState<CardDirection>(initialDirection ?? defaultDirection);
	const rangeQuestionCount = Math.max(0, rangeEnd - rangeStart + 1);
	const currentQuestionCount = selectionMode === "range" ? rangeQuestionCount : questionCount;

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

	const getNormalizedRange = () => {
		const parsedStart = parseInt(rangeStartInput, 10);
		const parsedEnd = parseInt(rangeEndInput, 10);
		const start =
			isNaN(parsedStart) || parsedStart < 1
				? rangeStart
				: Math.min(parsedStart, maxRangeStart);
		const end =
			isNaN(parsedEnd) || parsedEnd < start ? start : Math.min(parsedEnd, maxQuestions);

		return { start, end };
	};

	const handleStart = () => {
		if (selectionMode === "range") {
			const { start, end } = getNormalizedRange();
			syncRange(start, end);

			if (end >= start && end <= maxQuestions) {
				onStartSession({
					mode: "practice",
					deckId: deck.id,
					direction,
					selection: {
						kind: "range",
						startIndex: start,
						endIndex: end,
					},
				});
			}
			return;
		}

		if (questionCount >= 1 && questionCount <= maxQuestions) {
			onStartSession({
				mode: "practice",
				deckId: deck.id,
				direction,
				selection: {
					kind: "random",
					questionCount,
				},
			});
		}
	};

	const handleQuickSelect = (count: number) => {
		const actualCount = Math.min(count, maxQuestions);
		setQuestionCount(actualCount);
		setInputValue(actualCount.toString());
	};

	const syncRange = (start: number, end: number) => {
		setRangeStart(start);
		setRangeEnd(end);
		setRangeStartInput(start.toString());
		setRangeEndInput(end.toString());
	};

	const handleRangeStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setRangeStartInput(e.target.value);
	};

	const handleRangeEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setRangeEndInput(e.target.value);
	};

	const handleRangeBlur = () => {
		const { start, end } = getNormalizedRange();
		syncRange(start, end);
	};

	return (
		<div className="flashcard-practice-setup fc-page fc-page--fill">
			<FlashcardHeader icon={Target} title={t("practice.title")} onBack={onBack} />

			<div className="flashcard-setup-content fc-page__body fc-page__body--narrow">
				<div className="flashcard-study-hero flashcard-practice-hero">
					<div className="flashcard-deck-name-wrapper">
						<div className="flashcard-deck-name">{deck.name}</div>
						<div className="flashcard-deck-tag">{deck.tag}</div>
					</div>
				</div>

				<div className="flashcard-study-panel flashcard-setup-controls">
					<SetupControlGroup
						icon={SlidersHorizontal}
						title={t("practice.chooseCount")}
						note={t("practice.chooseCountNote")}
					>
						<SetupSelector
							value={selectionMode}
							ariaLabel={t("practice.chooseCount")}
							options={[
								{
									value: "random",
									label: t("practice.modeRandomCount"),
									icon: Shuffle,
								},
								{
									value: "range",
									label: t("practice.modeRange"),
									icon: ListOrdered,
								},
							]}
							onChange={setSelectionMode}
						/>

						<div className="flashcard-setup-control-detail">
							{selectionMode === "random" ? (
								<>
									<div className="flashcard-practice-quick-buttons">
										{quickQuestionCounts.map((count) => (
											<FlashcardButton
												key={count}
												type="button"
												className="flashcard-setup-chip"
												active={questionCount === count}
												onClick={() => handleQuickSelect(count)}
											>
												{count}
											</FlashcardButton>
										))}
										<FlashcardButton
											type="button"
											className="flashcard-setup-chip"
											active={questionCount === maxQuestions}
											onClick={() => handleQuickSelect(maxQuestions)}
										>
											{t("common.all")}
										</FlashcardButton>
									</div>

									<label className="flashcard-setup-custom-field">
										<span className="flashcard-practice-input-label">
											{t("practice.customCount")}
										</span>
										<FlashcardInput
											type="number"
											className="flashcard-practice-input"
											value={inputValue}
											onChange={handleInputChange}
											onBlur={handleInputBlur}
											min={1}
											max={maxQuestions}
										/>
										<span className="flashcard-practice-input-hint">
											1–{maxQuestions}
										</span>
									</label>
								</>
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
												value={rangeStartInput}
												onChange={handleRangeStartChange}
												onBlur={handleRangeBlur}
											/>
										</label>
										<label className="flashcard-setup-range-field">
											<span className="flashcard-practice-input-label">
												{t("practice.rangeEnd")}
											</span>
											<FlashcardInput
												type="number"
												className="flashcard-practice-input"
												value={rangeEndInput}
												onChange={handleRangeEndChange}
												onBlur={handleRangeBlur}
											/>
										</label>
									</div>
								</div>
							)}
						</div>
					</SetupControlGroup>

					<SetupControlGroup
						icon={Repeat2}
						title={t("mode.direction")}
						note={
							direction === "normal" ? t("mode.normalNote") : t("mode.reversedNote")
						}
					>
						<SetupSelector
							value={direction}
							ariaLabel={t("mode.direction")}
							options={[
								{
									value: "normal",
									label: t("mode.normal"),
									icon: Target,
								},
								{
									value: "reversed",
									label: t("mode.reversed"),
									icon: Repeat2,
								},
							]}
							onChange={setDirection}
						/>
					</SetupControlGroup>
				</div>

				<div className="flashcard-study-action-bar">
					<FlashcardButton
						variant="primary"
						preset="show"
						size="lg"
						onClick={handleStart}
						disabled={maxQuestions === 0 || currentQuestionCount < 1}
					>
						{t("practice.startQuestions", {
							count: currentQuestionCount,
						})}
					</FlashcardButton>
				</div>
			</div>
		</div>
	);
});
