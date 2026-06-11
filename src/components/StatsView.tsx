import React, { useMemo } from "react";
import { ChartBar, Sprout } from "lucide-react";
import { DataStore } from "../dataStore";
import { StudyHistoryEntry } from "../types";
import { FlashcardHeader } from "./FlashcardHeader";
import { useI18n } from "./I18nContext";
import { formatCompactDuration } from "../i18n";

interface StatsViewProps {
	dataStore: DataStore;
	onBack: () => void;
}

function formatDate(
	dateStr: string,
	language: "zh" | "en",
	t: ReturnType<typeof useI18n>["t"],
): string {
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
	const month = parts[1] ?? "";
	const day = parts[2] ?? "";
	const display = t("stats.monthDay", { month, day });

	if (dateStr === todayStr) {
		return t("stats.dateWithLabel", {
			date: display,
			label: t("stats.today"),
		});
	}
	if (dateStr === yesterdayStr) {
		return t("stats.dateWithLabel", {
			date: display,
			label: t("stats.yesterday"),
		});
	}

	// Show day of week for recent days
	const d = new Date(dateStr + "T00:00:00");
	const weekday = new Intl.DateTimeFormat(
		language === "zh" ? "zh-CN" : "en-US",
		{ weekday: "short" },
	).format(d);
	return t("stats.dateWithLabel", { date: display, label: weekday });
}

const MODE_CONFIG: Record<
	StudyHistoryEntry["mode"],
	{ labelKey: "stats.modeStudy" | "stats.modePractice" | "stats.modeList"; cls: string }
> = {
	study: { labelKey: "stats.modeStudy", cls: "stats-mode-study" },
	practice: { labelKey: "stats.modePractice", cls: "stats-mode-practice" },
	"word-list": { labelKey: "stats.modeList", cls: "stats-mode-list" },
};

interface DayGroup {
	date: string;
	entries: StudyHistoryEntry[];
	totalDuration: number;
	totalCards: number;
}

export const StatsView: React.FC<StatsViewProps> = ({ dataStore, onBack }) => {
	const { t, language } = useI18n();
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
					title={t("stats.title")}
					onBack={onBack}
					right={
						<span className="flashcard-stats-range">
							{t("stats.last20Days")}
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
							{t("stats.daysStudied")}
						</div>
					</div>
					<div className="flashcard-stats-summary-divider" />
					<div className="flashcard-stats-summary-item fc-lift">
						<div className="flashcard-stats-summary-value">
							{formatCompactDuration(language, totals.duration)}
						</div>
						<div className="flashcard-summary-label">
							{t("stats.totalDuration")}
						</div>
					</div>
					<div className="flashcard-stats-summary-divider" />
					<div className="flashcard-stats-summary-item fc-lift">
						<div className="flashcard-stats-summary-value">
							{totals.cards}
						</div>
						<div className="flashcard-summary-label">
							{t("stats.totalCards")}
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
						<p>{t("stats.noRecords")}</p>
						<p className="flashcard-empty-hint">
							{t("stats.noRecordsHint")}
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
											{formatDate(date, language, t)}
										</span>
										<span className="flashcard-stats-day-meta">
											{t("stats.records", {
												count: entries.length,
											})}{" "}
											·{" "}
											{formatCompactDuration(
												language,
												dayDur,
											)}
											{dayCards > 0 &&
												` · ${t("stats.cards", {
													count: dayCards,
												})}`}
										</span>
									</div>

									<div className="flashcard-stats-sessions">
										{entries.map((entry, idx) => (
											<div
												key={idx}
												className={`flashcard-stats-session ${MODE_CONFIG[entry.mode].cls} fc-lift`}
											>
												<span className="flashcard-stats-session-mode">
													{t(
														MODE_CONFIG[entry.mode]
															.labelKey,
													)}
												</span>
												<span className="flashcard-stats-session-deck">
													{entry.deckName}
												</span>
												<div className="flashcard-stats-session-right">
													{entry.cardCount > 0 && (
														<span className="flashcard-stats-session-cards">
															{t("stats.cards", {
																count:
																	entry.cardCount,
															})}
														</span>
													)}
													<span className="flashcard-stats-session-dur">
														{formatCompactDuration(
															language,
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
