import React, { useState } from "react";
import { CircleCheck, Target, Lock } from "lucide-react";
import { Deck, StudyDayInfo } from "../types";

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
		<div className="flashcard-practice-setup flashcard-study-setup-screen">
			<div className="flashcard-practice-setup-header">
				<button
					className="flashcard-btn flashcard-btn-back"
					onClick={onBack}
				>
					← 返回
				</button>
				<h2 className="flashcard-practice-setup-title">⚡ 悟道模式</h2>
			</div>

			<div className="flashcard-study-setup-content">
				<div className="flashcard-study-hero">
					<div className="flashcard-study-hero-copy">
						<div className="flashcard-practice-deck-name">
							{deck.name}
						</div>
						<div className="flashcard-practice-deck-tag">
							{deck.tag}
						</div>
						<div className="flashcard-practice-deck-total">
							共 <strong>{deck.cards.length}</strong> 张卡片
						</div>
						<div className="flashcard-study-hero-description">
							按天推进新内容，并把当天需要复习的卡片一起收拢在这个视图里。
						</div>
					</div>
					<div className="flashcard-study-hero-meta">
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								总天数
							</span>
							<strong>{dayList.length || 1}</strong>
						</div>
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								当前
							</span>
							<strong>
								{allCompleted
									? "复习阶段"
									: `第 ${(currentDay?.dayIndex ?? 0) + 1} 天`}
							</strong>
						</div>
						<div className="flashcard-study-hero-pill">
							<span className="flashcard-study-hero-pill-label">
								今日任务
							</span>
							<strong>{todayTotal}</strong>
						</div>
					</div>
				</div>

				{/* Today's session stats */}
				<div className="flashcard-study-today-stats">
					<div className="flashcard-study-stat-card flashcard-study-stat-new">
						<span className="flashcard-study-stat-caption">
							新内容
						</span>
						<span className="flashcard-study-stat-value">
							{todayNewCount}
						</span>
						<span className="flashcard-study-stat-label">
							今日新学
						</span>
					</div>
					<div className="flashcard-study-stat-card flashcard-study-stat-review">
						<span className="flashcard-study-stat-caption">
							巩固
						</span>
						<span className="flashcard-study-stat-value">
							{todayReviewCount}
						</span>
						<span className="flashcard-study-stat-label">
							待复习
						</span>
					</div>
					<div className="flashcard-study-stat-card flashcard-study-stat-progress">
						<span className="flashcard-study-stat-caption">
							进度
						</span>
						<span className="flashcard-study-stat-value">
							{completedDays}
						</span>
						<span className="flashcard-study-stat-label">
							已完成天数
						</span>
					</div>
				</div>

				{/* Study order selector */}
				<div className="flashcard-study-panel flashcard-study-order-section">
					<div className="flashcard-study-panel-heading">
						<div className="flashcard-study-order-label">
							出现顺序
						</div>
						<div className="flashcard-study-panel-note">
							{studyOrder === "random"
								? "适合查漏补缺"
								: "适合稳定推进"}
						</div>
					</div>
					<div className="flashcard-study-order-options">
						<button
							className={`flashcard-btn flashcard-study-order-btn ${studyOrder === "sequential" ? "active" : ""}`}
							onClick={() => setStudyOrder("sequential")}
						>
							📋 按顺序
						</button>
						<button
							className={`flashcard-btn flashcard-study-order-btn ${studyOrder === "random" ? "active" : ""}`}
							onClick={() => setStudyOrder("random")}
						>
							🔀 随机顺序
						</button>
					</div>
				</div>

				{/* Day list */}
				{dayList.length > 0 && (
					<div className="flashcard-study-panel flashcard-study-day-section">
						<div className="flashcard-study-panel-heading">
							<div className="flashcard-study-day-section-title">
								学习进度
							</div>
							<div className="flashcard-study-panel-note">
								已完成 {completedDays}/{dayList.length} 天
							</div>
						</div>
						<div className="flashcard-study-day-list">
							{dayList.map((day) => (
								<div
									key={day.dayIndex}
									className={`flashcard-study-day-item ${
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
											第 {day.dayIndex + 1} 天
											{day.isCurrent && (
												<span className="flashcard-study-day-today-badge">
													今日
												</span>
											)}
										</span>
									</div>
									<div className="flashcard-study-day-progress">
										<span className="flashcard-study-day-count">
											{day.studiedCards}/{day.totalCards}
										</span>
										{day.isCompleted && (
											<button
												className="flashcard-btn flashcard-study-day-review-btn"
												onClick={() =>
													onStartDay(
														day.dayIndex,
														studyOrder,
													)
												}
											>
												复习
											</button>
										)}
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				<div className="flashcard-study-action-bar">
					<div className="flashcard-study-action-copy">
						<div className="flashcard-study-action-title">
							{allCompleted
								? "今日进入复习轮次"
								: hasAnythingToStudy
									? `准备开始 ${todayNewCount + todayReviewCount} 张卡片`
									: "今日学习任务已完成"}
						</div>
						<div className="flashcard-study-action-subtitle">
							{allCompleted
								? "已完成全部学习天数，可继续复习巩固。"
								: hasAnythingToStudy
									? "保持节奏，先完成当前日程再切换新模式。"
									: "可以稍后回来复习，系统会保留当前进度。"}
						</div>
					</div>
					<button
						className="flashcard-btn flashcard-btn-green "
						onClick={handleMainStart}
						disabled={!hasAnythingToStudy && !allCompleted}
					>
						{allCompleted
							? "开始复习 🔄"
							: hasAnythingToStudy
								? `开始学习 (${todayTotal} 张)`
								: "今日任务已完成 🎉"}
					</button>
				</div>
			</div>
		</div>
	);
};
