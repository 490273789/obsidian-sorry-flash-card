import React, { useMemo } from "react";
import { ChartBar, Sprout } from "lucide-react";
import { DataStore } from "../dataStore";
import { StudyHistoryEntry } from "../types";
import { FlashcardHeader } from "./FlashcardHeader";

interface StatsViewProps {
	dataStore: DataStore;
	onBack: () => void;
}

const WEEK_DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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
	return `${display}（${WEEK_DAYS[d.getDay()]}）`;
}

const MODE_CONFIG: Record<
	StudyHistoryEntry["mode"],
	{ label: string; cls: string }
> = {
	study: { label: "⚡ Study", cls: "stats-mode-study" },
	practice: { label: "⚔️ Practice", cls: "stats-mode-practice" },
	"word-list": { label: "📜 List", cls: "stats-mode-list" },
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

	const totals = useMemo(
		() =>
			history.reduce(
				(accumulator, entry) => ({
					duration: accumulator.duration + entry.duration,
					cards: accumulator.cards + entry.cardCount,
				}),
				{ duration: 0, cards: 0 },
			),
		[history],
	);

	return (
		<div className="flashcard-stats-view">
			<div className="flashcard-stats-top">
				{/* Header */}
				<FlashcardHeader
					icon={ChartBar}
					title="Study Stats"
					onBack={onBack}
					right={
						<span className="flashcard-stats-range">
							Last 20 Days
						</span>
					}
				/>

				{/* Summary bar */}
				<div className="flashcard-stats-summary">
					<div className="flashcard-stats-summary-item fc-lift">
						<div className="flashcard-stats-summary-value">
							{grouped.length}
						</div>
						<div className="flashcard-summary-label">
							Days Studied
						</div>
					</div>
					<div className="flashcard-stats-summary-divider" />
					<div className="flashcard-stats-summary-item fc-lift">
						<div className="flashcard-stats-summary-value">
							{formatDuration(totals.duration)}
						</div>
						<div className="flashcard-summary-label">
							Total Duration
						</div>
					</div>
					<div className="flashcard-stats-summary-divider" />
					<div className="flashcard-stats-summary-item fc-lift">
						<div className="flashcard-stats-summary-value">
							{totals.cards}
						</div>
						<div className="flashcard-summary-label">
							Total Cards
						</div>
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
						<p>No study records</p>
						<p className="flashcard-empty-hint">
							After completing a study session, the data will be
							displayed here
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
								<div
									key={date}
									className="flashcard-stats-day fc-lift"
								>
									<div className="flashcard-stats-day-header">
										<span className="flashcard-stats-day-date">
											{formatDate(date)}
										</span>
										<span className="flashcard-stats-day-meta">
											{entries.length} Records ·
											{formatDuration(dayDur)}
											{dayCards > 0 &&
												` · ${dayCards} Cards`}
										</span>
									</div>

									<div className="flashcard-stats-sessions">
										{entries.map((entry, idx) => (
											<div
												key={idx}
												className={`flashcard-stats-session ${MODE_CONFIG[entry.mode].cls} fc-lift`}
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
															{entry.cardCount}{" "}
															Cards
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
