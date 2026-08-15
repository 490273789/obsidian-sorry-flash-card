import React, { memo, useCallback, useMemo, useState } from "react";
import {
	CircleCheck,
	Target,
	Lock,
	Brain,
	Dices,
	AudioWaveform,
	Repeat2,
	Keyboard,
} from "lucide-react";
import { CardDirection, Deck, StudyDayInfo } from "../../shared/types";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardHeader } from "./FlashcardHeader";
import { useI18n } from "./I18nContext";
import { SetupControlGroup, SetupSelector } from "./SetupSelector";

interface StudySetupProps {
	deck: Deck;
	todayNewCount: number;
	todayReviewCount: number;
	dayList: StudyDayInfo[];
	defaultStudyOrder: "sequential" | "random";
	defaultDirection?: CardDirection;
	onStart: (studyOrder: "sequential" | "random", direction: CardDirection) => void;
	onStartDay: (
		dayIndex: number,
		studyOrder: "sequential" | "random",
		direction: CardDirection,
	) => void;
	spellingEnabled: boolean;
	onStartDaySpelling: (dayIndex: number) => void;
	onBack: () => void;
}

interface StudyDayRowProps {
	day: StudyDayInfo;
	direction: CardDirection;
	onStartDay: (
		dayIndex: number,
		studyOrder: "sequential" | "random",
		direction: CardDirection,
	) => void;
	spellingEnabled: boolean;
	onStartDaySpelling: (dayIndex: number) => void;
}

const StudyDayRow = memo(function StudyDayRow({
	day,
	direction,
	onStartDay,
	spellingEnabled,
	onStartDaySpelling,
}: StudyDayRowProps) {
	const { t } = useI18n();
	const handleReview = useCallback(() => {
		onStartDay(day.dayIndex, "random", direction);
	}, [day.dayIndex, direction, onStartDay]);
	const handleSpelling = useCallback(() => {
		onStartDaySpelling(day.dayIndex);
	}, [day.dayIndex, onStartDaySpelling]);

	return (
		<div
			className={`flashcard-study-day-item fc-lift ${
				day.isCompleted ? "completed" : day.isCurrent ? "current" : "locked"
			}`}
		>
			<div className="flashcard-study-day-info">
				<span className="flashcard-study-day-badge">
					{day.isCompleted ? (
						<CircleCheck size={16} />
					) : day.isCurrent ? (
						<Target size={16} />
					) : (
						<Lock size={16} />
					)}
				</span>
				<span className="flashcard-study-day-name">
					{t("study.day", { day: day.dayIndex + 1 })}
					{day.isCurrent && (
						<span className="flashcard-study-day-today-badge">{t("study.today")}</span>
					)}
				</span>
			</div>
			<div className="flashcard-study-day-progress">
				<span className="flashcard-study-day-count">
					{day.studiedCards}/{day.totalCards}
				</span>
				{day.isCompleted && (
					<>
						<FlashcardButton
							className="flashcard-study-day-review-btn"
							onClick={handleReview}
						>
							{t("study.review")}
						</FlashcardButton>
						{spellingEnabled && (
							<FlashcardButton
								variant="green"
								icon={Keyboard}
								iconSize={14}
								className="flashcard-study-day-review-btn"
								onClick={handleSpelling}
								title={t("home.spellingModeTitle")}
							>
								{t("home.spelling")}
							</FlashcardButton>
						)}
					</>
				)}
			</div>
		</div>
	);
});

export const StudySetup = React.memo(function StudySetup({
	deck,
	todayNewCount,
	todayReviewCount,
	dayList,
	defaultStudyOrder,
	defaultDirection = "normal",
	onStart,
	onStartDay,
	spellingEnabled,
	onStartDaySpelling,
	onBack,
}: StudySetupProps) {
	const { t } = useI18n();
	const [studyOrder, setStudyOrder] = useState<"sequential" | "random">(defaultStudyOrder);
	const [direction, setDirection] = useState<CardDirection>(defaultDirection);

	const completedDays = useMemo(
		() => dayList.reduce((total, day) => total + (day.isCompleted ? 1 : 0), 0),
		[dayList],
	);
	const allCompleted = dayList.length > 0 && completedDays === dayList.length;
	const hasAnythingToStudy = todayNewCount > 0 || todayReviewCount > 0;
	const todayTotal = todayNewCount + todayReviewCount;

	const handleMainStart = useCallback(() => {
		onStart(allCompleted ? "random" : studyOrder, direction);
	}, [allCompleted, direction, onStart, studyOrder]);

	return (
		<div className="flashcard-practice-setup">
			<FlashcardHeader
				icon={Brain}
				title={t("study.title")}
				onBack={onBack}
				stats={[
					{
						key: "new",
						value: todayNewCount,
						label: t("study.todayNew"),
						tone: "green",
					},
					{
						key: "due",
						value: todayReviewCount,
						label: t("study.dueReview"),
						tone: "purple",
					},
					{
						key: "completed",
						value: completedDays,
						label: t("study.completedDays"),
						tone: "blue",
					},
				]}
			/>

			<div className="flashcard-setup-content">
				<div className="flashcard-study-hero">
					<div className="flashcard-study-hero-copy">
						<div className="flashcard-deck-name-wrapper">
							<div className="flashcard-deck-name">{deck.name}</div>
							<div className="flashcard-deck-tag">{deck.tag}</div>
						</div>
					</div>
				</div>

				{/* Study preferences */}
				<div className="flashcard-study-panel flashcard-setup-controls">
					<SetupControlGroup
						icon={AudioWaveform}
						title={t("study.studyOrder")}
						note={
							studyOrder === "random"
								? t("study.randomNote")
								: t("study.sequentialNote")
						}
					>
						<SetupSelector
							value={studyOrder}
							ariaLabel={t("study.studyOrder")}
							options={[
								{
									value: "sequential",
									label: t("study.sequentialOrder"),
									icon: AudioWaveform,
								},
								{
									value: "random",
									label: t("study.randomOrder"),
									icon: Dices,
								},
							]}
							onChange={setStudyOrder}
						/>
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
									icon: Brain,
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

				{/* Day list */}
				{dayList.length > 0 && (
					<div className="flashcard-study-panel flashcard-study-day-section fc-lift">
						<div className="flashcard-study-panel-heading">
							<div className="flashcard-study-day-section-title">
								{t("study.studyPlan")}
							</div>
							<div className="flashcard-study-panel-note">
								{t("study.completedDaysProgress", {
									completed: completedDays,
									total: dayList.length,
								})}
							</div>
						</div>
						<div className="flashcard-study-day-list">
							{dayList.map((day) => (
								<StudyDayRow
									key={day.dayIndex}
									day={day}
									direction={direction}
									onStartDay={onStartDay}
									spellingEnabled={spellingEnabled}
									onStartDaySpelling={onStartDaySpelling}
								/>
							))}
						</div>
					</div>
				)}

				<div className="flashcard-study-action-bar">
					<div>
						<div className="flashcard-study-action-title">
							{allCompleted
								? t("study.startReviewStage")
								: hasAnythingToStudy
									? t("study.readyToStart", {
											count: todayNewCount + todayReviewCount,
										})
									: t("study.tasksCompleted")}
						</div>
						<div className="flashcard-study-action-subtitle">
							{allCompleted
								? t("study.reviewStageSubtitle")
								: hasAnythingToStudy
									? t("study.readySubtitle")
									: t("study.completedSubtitle")}
						</div>
					</div>
					<FlashcardButton
						variant="green"
						onClick={handleMainStart}
						disabled={!hasAnythingToStudy && !allCompleted}
					>
						{allCompleted
							? t("study.startReview")
							: hasAnythingToStudy
								? t("study.startCards", {
										count: todayTotal,
									})
								: t("study.tasksCompletedButton")}
					</FlashcardButton>
				</div>
			</div>
		</div>
	);
});
