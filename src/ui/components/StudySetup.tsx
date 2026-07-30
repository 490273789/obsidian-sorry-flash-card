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
import { SetupStats } from "./SetupStats";

interface StudySetupProps {
	deck: Deck;
	todayNewCount: number;
	todayReviewCount: number;
	dayList: StudyDayInfo[];
	defaultStudyOrder: "sequential" | "random";
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

export const StudySetup: React.FC<StudySetupProps> = ({
	deck,
	todayNewCount,
	todayReviewCount,
	dayList,
	defaultStudyOrder,
	onStart,
	onStartDay,
	spellingEnabled,
	onStartDaySpelling,
	onBack,
}) => {
	const { t } = useI18n();
	const [studyOrder, setStudyOrder] = useState<"sequential" | "random">(defaultStudyOrder);
	const [direction, setDirection] = useState<CardDirection>("normal");

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
			<FlashcardHeader icon={Brain} title={t("study.title")} onBack={onBack} />

			<div className="flashcard-setup-content">
				<div className="flashcard-study-hero">
					<div className="flashcard-study-hero-copy">
						<div className="flashcard-deck-name-wrapper">
							<div className="flashcard-deck-name">{deck.name}</div>
							<div className="flashcard-deck-tag">{deck.tag}</div>
						</div>
					</div>
				</div>

				{/* Today's session stats */}
				<SetupStats
					items={[
						{
							value: todayNewCount,
							label: t("study.todayNew"),
							tone: "green",
						},
						{
							value: todayReviewCount,
							label: t("study.dueReview"),
							tone: "purple",
						},
						{
							value: completedDays,
							label: t("study.completedDays"),
							tone: "blue",
						},
					]}
				/>

				{/* Study order selector */}
				<div className="flashcard-study-panel flashcard-study-order-section fc-lift">
					<div className="flashcard-study-panel-heading">
						<div className="flashcard-study-order-label">{t("study.studyOrder")}</div>
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
							<AudioWaveform size={16} /> {t("study.sequentialOrder")}
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
						<div className="flashcard-study-order-label">{t("mode.direction")}</div>
						<div className="flashcard-study-panel-note">
							{direction === "normal" ? t("mode.normalNote") : t("mode.reversedNote")}
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
};
