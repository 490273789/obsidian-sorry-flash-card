import React, { useState } from "react";
import { CircleCheck, Target, Lock, Brain } from "lucide-react";
import { Deck, StudyDayInfo } from "../types";
import { FlashcardButton } from "./FlashcardButton";

interface StudySetupProps {
	deck: Deck;
	todayNewCount: number;
	todayReviewCount: number;
	dayList: StudyDayInfo[];
	defaultStudyOrder: "sequential" | "random";
	onStart: (studyOrder: "sequential" | "random") => void;
	onStartDay: (dayIndex: number, studyOrder: "sequential" | "random") => void;
	onBack: () => void;
}

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
	const [studyOrder, setStudyOrder] = useState<"sequential" | "random">(
		defaultStudyOrder,
	);

	const currentDay = dayList.find((d) => d.isCurrent);
	const completedDays = dayList.filter((d) => d.isCompleted).length;
	const allCompleted =
		dayList.length > 0 && dayList.every((d) => d.isCompleted);
	const hasAnythingToStudy = todayNewCount > 0 || todayReviewCount > 0;
	const todayTotal = todayNewCount + todayReviewCount;

	const handleMainStart = () => {
		onStart(studyOrder);
	};

	return (
		<div className="flashcard-practice-setup">
			<div className="flashcard-common-header">
				<div className="flashcard-header-left">
					<FlashcardButton preset="back" onClick={onBack}>
						← Back
					</FlashcardButton>
				</div>
				<div className="flashcard-header-center">
					<Brain size={18} /> Study
				</div>
				<div className="flashcard-header-right"></div>
			</div>

			<div className="flashcard-setup-content">
				<div className="flashcard-study-hero">
					<div className="flashcard-study-hero-copy">
						<div className="flashcard-deck-name">{deck.name}</div>
						<div className="flashcard-deck-name-wrapper">
							<div className="flashcard-deck-total">
								Total <strong>{deck.cards.length}</strong> Cards
							</div>
							<div className="flashcard-deck-tag">{deck.tag}</div>
						</div>
					</div>
					<div className="flashcard-study-hero-meta">
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								Total Days
							</span>
							<strong>{dayList.length || 1}</strong>
						</div>
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								Current Stage
							</span>
							<strong>
								{allCompleted
									? "Review Stage"
									: `Day ${(currentDay?.dayIndex ?? 0) + 1}`}
							</strong>
						</div>
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								Today's Tasks
							</span>
							<strong>{todayTotal}</strong>
						</div>
					</div>
				</div>

				{/* Today's session stats */}
				<div className="flashcard-today-stats">
					<div className="flashcard-stat-card">
						<span className="flashcard-stat-caption">新内容</span>
						<span className="flashcard-stat-value green">
							{todayNewCount}
						</span>
						<span className="flashcard-stat-label">今日新学</span>
					</div>
					<div className="flashcard-stat-card">
						<span className="flashcard-stat-caption">巩固</span>
						<span className="flashcard-stat-value purple">
							{todayReviewCount}
						</span>
						<span className="flashcard-stat-label">待复习</span>
					</div>
					<div className="flashcard-stat-card">
						<span className="flashcard-stat-caption">进度</span>
						<span className="flashcard-stat-value blue">
							{completedDays}
						</span>
						<span className="flashcard-stat-label">已完成天数</span>
					</div>
				</div>

				{/* Study order selector */}
				<div className="flashcard-study-panel flashcard-study-order-section fc-lift">
					<div className="flashcard-study-panel-heading">
						<div className="flashcard-study-order-label">
							Study Order
						</div>
						<div className="flashcard-study-panel-note">
							{studyOrder === "random"
								? "Suitable for reviewing missed cards"
								: "Suitable for steady progress"}
						</div>
					</div>
					<div className="flashcard-study-order-options">
						<FlashcardButton
							className="flashcard-study-order-btn"
							active={studyOrder === "sequential"}
							onClick={() => setStudyOrder("sequential")}
						>
							📋 Sequential Order
						</FlashcardButton>
						<FlashcardButton
							className="flashcard-study-order-btn"
							active={studyOrder === "random"}
							onClick={() => setStudyOrder("random")}
						>
							🔀 Random Order
						</FlashcardButton>
					</div>
				</div>

				{/* Day list */}
				{dayList.length > 0 && (
					<div className="flashcard-study-panel flashcard-study-day-section fc-lift">
						<div className="flashcard-study-panel-heading">
							<div className="flashcard-study-day-section-title">
								Study Plan
							</div>
							<div className="flashcard-study-panel-note">
								Completed {completedDays}/{dayList.length} Days
							</div>
						</div>
						<div className="flashcard-study-day-list">
							{dayList.map((day) => (
								<div
									key={day.dayIndex}
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
											Day {day.dayIndex + 1}
											{day.isCurrent && (
												<span className="flashcard-study-day-today-badge">
													Today
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
												onClick={() =>
													onStartDay(
														day.dayIndex,
														studyOrder,
													)
												}
											>
												Review
											</FlashcardButton>
										)}
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				<div className="flashcard-study-action-bar">
					<div>
						<div className="flashcard-study-action-title">
							{allCompleted
								? "Start Review Stage"
								: hasAnythingToStudy
									? `Ready to start ${todayNewCount + todayReviewCount} cards`
									: "Today's tasks completed"}
						</div>
						<div className="flashcard-study-action-subtitle">
							{allCompleted
								? "已完成全部学习天数，可继续复习巩固。"
								: hasAnythingToStudy
									? "保持节奏，先完成当前日程再切换新模式。"
									: "可以稍后回来复习，系统会保留当前进度。"}
						</div>
					</div>
					<FlashcardButton
						variant="green"
						onClick={handleMainStart}
						disabled={!hasAnythingToStudy && !allCompleted}
					>
						{allCompleted
							? "Start Review"
							: hasAnythingToStudy
								? `Start (${todayTotal} Cards)`
								: "Today's tasks completed 🎉"}
					</FlashcardButton>
				</div>
			</div>
		</div>
	);
};
