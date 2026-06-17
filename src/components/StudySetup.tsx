import React, { memo, useCallback, useMemo, useState } from "react";
import {
	CircleCheck,
	Target,
	Lock,
	Brain,
	Dices,
	AudioWaveform,
	Repeat2,
} from "lucide-react";
import { CardDirection, Deck, StudyDayInfo } from "../types";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardHeader } from "./FlashcardHeader";
import { useI18n } from "./I18nContext";

interface StudySetupProps {
	deck: Deck;
	todayNewCount: number;
	todayReviewCount: number;
	dayList: StudyDayInfo[];
	defaultStudyOrder: "sequential" | "random";
	onStart: (
		studyOrder: "sequential" | "random",
		direction: CardDirection,
	) => void;
	onStartDay: (
		dayIndex: number,
		studyOrder: "sequential" | "random",
		direction: CardDirection,
	) => void;
	onBack: () => void;
}

interface StudyDayRowProps {
	day: StudyDayInfo;
	studyOrder: "sequential" | "random";
	direction: CardDirection;
	onStartDay: (
		dayIndex: number,
		studyOrder: "sequential" | "random",
		direction: CardDirection,
	) => void;
}

const StudyDayRow = memo(function StudyDayRow({
	day,
	studyOrder,
	direction,
	onStartDay,
}: StudyDayRowProps) {
	const { t } = useI18n();
	const handleReview = useCallback(() => {
		onStartDay(day.dayIndex, studyOrder, direction);
	}, [day.dayIndex, direction, onStartDay, studyOrder]);

	return (
		<div
			className={`flashcard-study-day-item fc-lift ${
				day.isCompleted
					? "completed"
					: day.isCurrent
						? "current"
						: "locked"
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
						<span className="flashcard-study-day-today-badge">
							{t("study.today")}
						</span>
					)}
				</span>
			</div>
			<div className="flashcard-study-day-progress">
				<span className="flashcard-study-day-count">
					{day.studiedCards}/{day.totalCards}
				</span>
				{day.isCompleted && (
					<FlashcardButton
						className="flashcard-study-day-review-btn"
						onClick={handleReview}
					>
						{t("study.review")}
					</FlashcardButton>
				)}
			</div>
		</div>
	);
});

export const StudySetup: React.FC<StudySetupProps> = ({
	deck,
	todayNewCount,
	todayReviewCount,
	dayList,
	defaultStudyOrder,
	onStart,
	onStartDay,
	onBack,
}) => {
	const { t } = useI18n();
	const [studyOrder, setStudyOrder] = useState<"sequential" | "random">(
		defaultStudyOrder,
	);
	const [direction, setDirection] = useState<CardDirection>("normal");

	const currentDay = dayList.find((d) => d.isCurrent);
	const completedDays = useMemo(
		() =>
			dayList.reduce(
				(total, day) => total + (day.isCompleted ? 1 : 0),
				0,
			),
		[dayList],
	);
	const allCompleted = dayList.length > 0 && completedDays === dayList.length;
	const hasAnythingToStudy = todayNewCount > 0 || todayReviewCount > 0;
	const todayTotal = todayNewCount + todayReviewCount;

	const handleMainStart = useCallback(() => {
		onStart(studyOrder, direction);
	}, [direction, onStart, studyOrder]);

	return (
		<div className="flashcard-practice-setup">
			<FlashcardHeader icon={Brain} title={t("study.title")} onBack={onBack} />

			<div className="flashcard-setup-content">
				<div className="flashcard-study-hero">
					<div className="flashcard-study-hero-copy">
						<div className="flashcard-deck-name">{deck.name}</div>
						<div className="flashcard-deck-name-wrapper">
							<div className="flashcard-deck-total">
								{t("study.totalCards", {
									count: deck.cards.length,
								})}
							</div>
							<div className="flashcard-deck-tag">{deck.tag}</div>
						</div>
					</div>
					<div className="flashcard-study-hero-meta">
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								{t("study.totalDays")}
							</span>
							<strong>{dayList.length || 1}</strong>
						</div>
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								{t("study.currentStage")}
							</span>
							<strong>
								{allCompleted
									? t("study.reviewStage")
									: t("study.day", {
											day:
												(currentDay?.dayIndex ?? 0) +
												1,
										})}
							</strong>
						</div>
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								{t("study.todayTasks")}
							</span>
							<strong>{todayTotal}</strong>
						</div>
					</div>
				</div>

				{/* Today's session stats */}
				<div className="flashcard-today-stats">
					<div className="flashcard-stat-card">
						<span className="flashcard-stat-caption">
							{t("study.newContent")}
						</span>
						<span className="flashcard-stat-value green">
							{todayNewCount}
						</span>
						<span className="flashcard-stat-label">
							{t("study.todayNew")}
						</span>
					</div>
					<div className="flashcard-stat-card">
						<span className="flashcard-stat-caption">
							{t("study.consolidation")}
						</span>
						<span className="flashcard-stat-value purple">
							{todayReviewCount}
						</span>
						<span className="flashcard-stat-label">
							{t("study.dueReview")}
						</span>
					</div>
					<div className="flashcard-stat-card">
						<span className="flashcard-stat-caption">
							{t("study.progress")}
						</span>
						<span className="flashcard-stat-value blue">
							{completedDays}
						</span>
						<span className="flashcard-stat-label">
							{t("study.completedDays")}
						</span>
					</div>
				</div>

				{/* Study order selector */}
				<div className="flashcard-study-panel flashcard-study-order-section fc-lift">
					<div className="flashcard-study-panel-heading">
						<div className="flashcard-study-order-label">
							{t("study.studyOrder")}
						</div>
						<div className="flashcard-study-panel-note">
							{studyOrder === "random"
								? t("study.randomNote")
								: t("study.sequentialNote")}
						</div>
					</div>
					<div className="flashcard-study-order-options">
						<FlashcardButton
							className="flashcard-study-order-btn"
							active={studyOrder === "sequential"}
							onClick={() => setStudyOrder("sequential")}
						>
							<AudioWaveform size={16} />{" "}
							{t("study.sequentialOrder")}
						</FlashcardButton>
						<FlashcardButton
							className="flashcard-study-order-btn"
							active={studyOrder === "random"}
							onClick={() => setStudyOrder("random")}
						>
							<Dices size={16} /> {t("study.randomOrder")}
						</FlashcardButton>
					</div>
				</div>

				<div className="flashcard-study-panel flashcard-direction-section fc-lift">
					<div className="flashcard-study-panel-heading">
						<div className="flashcard-study-order-label">
							{t("mode.direction")}
						</div>
						<div className="flashcard-study-panel-note">
							{direction === "normal"
								? t("mode.normalNote")
								: t("mode.reversedNote")}
						</div>
					</div>
					<div className="flashcard-direction-options">
						<FlashcardButton
							className="flashcard-direction-btn"
							active={direction === "normal"}
							onClick={() => setDirection("normal")}
						>
							<Brain size={16} /> {t("mode.normal")}
						</FlashcardButton>
						<FlashcardButton
							className="flashcard-direction-btn"
							active={direction === "reversed"}
							onClick={() => setDirection("reversed")}
						>
							<Repeat2 size={16} /> {t("mode.reversed")}
						</FlashcardButton>
					</div>
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
									studyOrder={studyOrder}
									direction={direction}
									onStartDay={onStartDay}
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
											count:
												todayNewCount +
												todayReviewCount,
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
};
