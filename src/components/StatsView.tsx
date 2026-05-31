import React, { useMemo } from "react";
import { ArrowLeft, ChartBar, Sprout } from "lucide-react";
import { DataStore } from "../dataStore";
import { StudyHistoryEntry } from "../types";

interface StatsViewProps {
	dataStore: DataStore;
	onBack: () => void;
}

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds}秒`;
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	if (m < 60) return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
	const h = Math.floor(m / 60);
	const mm = m % 60;
	return mm > 0 ? `${h}小时${mm}分钟` : `${h}小时`;
}

function formatDate(dateStr: string): string {
	const now = new Date();
	const todayStr = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("-");
	const yesterday = new Date(now.getTime() - 86400000);
	const yesterdayStr = [
		yesterday.getFullYear(),
		String(yesterday.getMonth() + 1).padStart(2, "0"),
		String(yesterday.getDate()).padStart(2, "0"),
	].join("-");

	const parts = dateStr.split("-");
	const display = `${parts[1]}月${parts[2]}日`;

	if (dateStr === todayStr) return `${display}（今天）`;
	if (dateStr === yesterdayStr) return `${display}（昨天）`;

	// Show day of week for recent days
	const d = new Date(dateStr + "T00:00:00");
	const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
	return `${display}（${weekDays[d.getDay()]}）`;
}

const MODE_CONFIG: Record<
	StudyHistoryEntry["mode"],
	{ label: string; cls: string }
> = {
	study: { label: "⚡ 悟道", cls: "stats-mode-study" },
	practice: { label: "⚔️ 装杯", cls: "stats-mode-practice" },
	"word-list": { label: "📜 列表", cls: "stats-mode-list" },
};

interface DayGroup {
	date: string;
	entries: StudyHistoryEntry[];
	totalDuration: number;
	totalCards: number;
}

export const StatsView: React.FC<StatsViewProps> = ({ dataStore, onBack }) => {
	const history = useMemo(() => dataStore.getStudyHistory(), [dataStore]);

	const grouped: DayGroup[] = useMemo(() => {
		const map = new Map<string, StudyHistoryEntry[]>();
		for (const entry of history) {
			const arr = map.get(entry.date) ?? [];
			arr.push(entry);
			map.set(entry.date, arr);
		}
		return Array.from(map.entries())
			.sort(([a], [b]) => b.localeCompare(a))
			.map(([date, entries]) => ({
				date,
				entries: [...entries].sort((a, b) => a.timestamp - b.timestamp),
				totalDuration: entries.reduce((s, e) => s + e.duration, 0),
				totalCards: entries.reduce((s, e) => s + e.cardCount, 0),
			}));
	}, [history]);

	const totalDuration = history.reduce((s, e) => s + e.duration, 0);
	const totalCards = history.reduce((s, e) => s + e.cardCount, 0);

	return (
		<div className="flashcard-stats-view">
			{/* Header */}
			<div className="flashcard-stats-header">
				<button
					className="flashcard-btn flashcard-btn-icon flashcard-stats-back"
					onClick={onBack}
					title="返回"
				>
					<ArrowLeft size={18} />
				</button>
				<div className="flashcard-stats-header-main">
					<div className="flashcard-home-kicker">Study archive</div>
					<h2 className="flashcard-stats-title">
						<ChartBar size={18} /> 学习统计
					</h2>
					<div className="flashcard-stats-subtitle">
						按天回看悟道、装杯和列表浏览的学习节奏。
					</div>
				</div>
				<div className="flashcard-stats-header-right">
					<span className="flashcard-stats-range">近 20 天</span>
				</div>
			</div>

			{/* Summary bar */}
			<div className="flashcard-stats-summary">
				<div className="flashcard-stats-summary-item">
					<div className="flashcard-stats-summary-value">
						{grouped.length}
					</div>
					<div className="flashcard-stats-summary-label">
						学习天数
					</div>
				</div>
				<div className="flashcard-stats-summary-divider" />
				<div className="flashcard-stats-summary-item">
					<div className="flashcard-stats-summary-value">
						{formatDuration(totalDuration)}
					</div>
					<div className="flashcard-stats-summary-label">总时长</div>
				</div>
				<div className="flashcard-stats-summary-divider" />
				<div className="flashcard-stats-summary-item">
					<div className="flashcard-stats-summary-value">
						{totalCards}
					</div>
					<div className="flashcard-stats-summary-label">
						总卡片数
					</div>
				</div>
			</div>

			{/* Day list */}
			<div className="flashcard-stats-body">
				{grouped.length === 0 ? (
					<div className="flashcard-empty">
						<div className="flashcard-empty-icon">
							<Sprout size={48} />
						</div>
						<p>暂无学习记录</p>
						<p className="flashcard-empty-hint">
							完成一次学习后，数据将在这里展示
						</p>
					</div>
				) : (
					<div className="flashcard-stats-days">
						{grouped.map(
							({
								date,
								entries,
								totalDuration: dayDur,
								totalCards: dayCards,
							}) => (
								<div key={date} className="flashcard-stats-day">
									<div className="flashcard-stats-day-header">
										<span className="flashcard-stats-day-date">
											{formatDate(date)}
										</span>
										<span className="flashcard-stats-day-meta">
											{entries.length} 次记录 ·
											{formatDuration(dayDur)}
											{dayCards > 0 &&
												` · ${dayCards} 张`}
										</span>
									</div>

									<div className="flashcard-stats-sessions">
										{entries.map((entry, idx) => (
											<div
												key={idx}
												className={`flashcard-stats-session ${MODE_CONFIG[entry.mode].cls}`}
											>
												<span className="flashcard-stats-session-mode">
													{
														MODE_CONFIG[entry.mode]
															.label
													}
												</span>
												<span className="flashcard-stats-session-deck">
													{entry.deckName}
												</span>
												<div className="flashcard-stats-session-right">
													{entry.cardCount > 0 && (
														<span className="flashcard-stats-session-cards">
															{entry.cardCount} 张
														</span>
													)}
													<span className="flashcard-stats-session-dur">
														{formatDuration(
															entry.duration,
														)}
													</span>
												</div>
											</div>
										))}
									</div>
								</div>
							),
						)}
					</div>
				)}
			</div>
		</div>
	);
};
