import React, { useMemo } from "react";
import { ChartBar, Sprout } from "lucide-react";
import type { StudyHistoryEntry } from "../../../../../core/shared/types";
import {
	buildStudyHistoryPresentationModel,
	STUDY_HISTORY_MODE_PRESENTATION,
} from "../../../domain/history/studyHistoryPresentationModel";
import { FlashcardHeader } from "../../../../../core/ui/primitives/Header";
import { useFlashcardI18n } from "../../../strings/context";
import { formatCompactDuration } from "../../../strings/index";

interface StatsViewProps {
	history: StudyHistoryEntry[];
	onBack: () => void;
}

export const StatsView = React.memo(function StatsView({ history, onBack }: StatsViewProps) {
	const { t, language } = useFlashcardI18n();
	const presentation = useMemo(
		() => buildStudyHistoryPresentationModel(history, { language, t }),
		[history, language, t],
	);
	const { dayGroups, totals } = presentation;

	return (
		<div className="flashcard-stats-view fc-page fc-page--fill">
			<FlashcardHeader
				icon={ChartBar}
				title={t("stats.title")}
				onBack={onBack}
				stats={[
					{
						key: "duration",
						value: totals.durationLabel,
						label: t("stats.totalDuration"),
						tone: "purple",
					},
					{
						key: "cards",
						value: totals.cards,
						label: t("stats.totalCards"),
						tone: "green",
					},
				]}
			/>

			{/* Day list */}
			<div className="flashcard-stats-body fc-page__body">
				{dayGroups.length === 0 ? (
					<div className="flashcard-empty">
						<div className="flashcard-empty-icon">
							<Sprout size={48} />
						</div>
						<p>{t("stats.noRecords")}</p>
						<p className="flashcard-empty-hint">{t("stats.noRecordsHint")}</p>
					</div>
				) : (
					<div className="flashcard-stats-days">
						{dayGroups.map(
							({ date, displayDate, entries, totalDurationLabel, totalCards }) => (
								<div key={date} className="flashcard-stats-day fc-lift">
									<div className="flashcard-stats-day-header">
										<span className="flashcard-stats-day-date">
											{displayDate}
										</span>
										<span className="flashcard-stats-day-meta">
											{t("stats.records", {
												count: entries.length,
											})}{" "}
											· {totalDurationLabel}
											{totalCards > 0 &&
												` · ${t("stats.cards", {
													count: totalCards,
												})}`}
										</span>
									</div>

									<div className="flashcard-stats-sessions">
										{entries.map((entry) => (
											<div
												key={`${entry.timestamp}-${entry.deckId}-${entry.mode}`}
												className={`flashcard-stats-session ${
													STUDY_HISTORY_MODE_PRESENTATION[entry.mode].cls
												} fc-lift`}
											>
												<span className="flashcard-stats-session-mode">
													{t(
														STUDY_HISTORY_MODE_PRESENTATION[entry.mode]
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
																count: entry.cardCount,
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
});
