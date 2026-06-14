import React, {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import ReactDOM from "react-dom";
import {
	BookOpen,
	Brain,
	Calculator,
	ChartSpline,
	FileText,
	Inbox,
	Layers3,
	List,
	NotebookPen,
	Plus,
	RefreshCcw,
	ScanEye,
	Settings,
	Sparkles,
	Target,
} from "lucide-react";
import { Deck, DeckStats, FlashcardSettings, StudySettings } from "../types";
import { DataStore } from "../dataStore";
import { FlashcardButton } from "./FlashcardButton";
import { useI18n } from "./I18nContext";
import { formatStudyOrder } from "../i18n";

// ── Per-deck settings modal ───────────────────────────────────────────────────

interface DeckSettingsModalProps {
	deckName: string;
	totalCards: number;
	globalSettings: FlashcardSettings;
	deckOverrides: Partial<StudySettings> | undefined;
	onSave: (overrides: Partial<StudySettings> | null) => Promise<void>;
	onClose: () => void;
}

const DeckSettingsModal = memo(function DeckSettingsModal({
	deckName,
	totalCards,
	globalSettings,
	deckOverrides,
	onSave,
	onClose,
}: DeckSettingsModalProps) {
	const { t, language } = useI18n();
	const [useCustom, setUseCustom] = useState(deckOverrides !== undefined);

	const effective = {
		dailyNewCards:
			deckOverrides?.dailyNewCards ?? globalSettings.dailyNewCards,
		dailyReviewCards:
			deckOverrides?.dailyReviewCards ?? globalSettings.dailyReviewCards,
		studyOrder: deckOverrides?.studyOrder ?? globalSettings.studyOrder,
		requestRetention:
			deckOverrides?.fsrsParameters?.requestRetention ??
			globalSettings.fsrsParameters.requestRetention,
		maximumInterval:
			deckOverrides?.fsrsParameters?.maximumInterval ??
			globalSettings.fsrsParameters.maximumInterval,
	};

	const [dailyNewCards, setDailyNewCards] = useState(effective.dailyNewCards);
	const [dailyReviewCards, setDailyReviewCards] = useState(
		effective.dailyReviewCards,
	);
	const [studyOrder, setStudyOrder] = useState<"sequential" | "random">(
		effective.studyOrder,
	);
	const [requestRetention, setRequestRetention] = useState(
		effective.requestRetention,
	);
	const [maximumInterval, setMaximumInterval] = useState(
		String(effective.maximumInterval),
	);

	// Days-to-complete: bidirectionally linked with dailyNewCards
	const calcDays = (perDay: number) =>
		totalCards > 0 ? Math.ceil(totalCards / perDay) : 0;
	const [daysToComplete, setDaysToComplete] = useState(
		String(calcDays(effective.dailyNewCards)),
	);

	const handleDailyNewCardsChange = (val: number) => {
		setDailyNewCards(val);
		setDaysToComplete(String(calcDays(val)));
	};

	const handleDaysToCompleteChange = (raw: string) => {
		setDaysToComplete(raw);
		const days = parseInt(raw, 10);
		if (!isNaN(days) && days >= 1 && totalCards > 0) {
			const newPerDay = Math.ceil(totalCards / days);
			const clamped = Math.max(1, Math.min(200, newPerDay));
			setDailyNewCards(clamped);
		}
	};

	const handleSave = async () => {
		if (!useCustom) {
			await onSave(null);
		} else {
			const intervalNum = parseInt(maximumInterval);
			await onSave({
				dailyNewCards,
				dailyReviewCards,
				studyOrder,
				fsrsParameters: {
					requestRetention,
					maximumInterval:
						!isNaN(intervalNum) && intervalNum >= 30
							? intervalNum
							: globalSettings.fsrsParameters.maximumInterval,
				},
			});
		}
		onClose();
	};

	const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (e.target === e.currentTarget) onClose();
	};

	const modal = (
		<div className="flashcard-modal-backdrop" onClick={handleBackdropClick}>
			<div className="flashcard-modal">
				<div className="flashcard-modal-header">
					<div className="flashcard-modal-heading">
						<div className="flashcard-modal-kicker fc-kicker">
							<Sparkles size={14} /> {t("deckSettings.kicker")}
						</div>
						<span className="flashcard-modal-title">
							{t("deckSettings.title", { deckName })}
						</span>
						<span className="flashcard-modal-subtitle">
							{t("deckSettings.subtitle", {
								totalCards,
								mode: useCustom
									? t("deckSettings.usingCustom")
									: t("deckSettings.usingGlobal"),
							})}
						</span>
					</div>
					<button
						className="flashcard-modal-close"
						onClick={onClose}
						aria-label={t("common.close")}
					>
						✕
					</button>
				</div>

				<div className="flashcard-modal-body">
					<div className="flashcard-deck-settings-toggle flashcard-deck-settings-card">
						<label className="flashcard-deck-settings-toggle-label">
							<input
								type="checkbox"
								checked={useCustom}
								onChange={(e) => setUseCustom(e.target.checked)}
							/>
							<span>{t("deckSettings.useCustom")}</span>
						</label>
						<p className="flashcard-deck-settings-toggle-copy">
							{t("deckSettings.useCustomCopy")}
						</p>
					</div>

					{!useCustom ? (
						<div className="flashcard-deck-settings-hint flashcard-deck-settings-card">
							{t("deckSettings.globalHint", {
								dailyNewCards: globalSettings.dailyNewCards,
								dailyReviewCards:
									globalSettings.dailyReviewCards,
								studyOrder: formatStudyOrder(
									language,
									globalSettings.studyOrder,
								),
							})}
							{totalCards > 0 && (
								<span>
									&nbsp;
									{t("deckSettings.estimatedDays", {
										days: calcDays(
											globalSettings.dailyNewCards,
										),
									})}
								</span>
							)}
						</div>
					) : (
						<div className="flashcard-deck-settings-fields">
							<div className="flashcard-deck-settings-summary flashcard-deck-settings-card">
								<div>
									<span className="flashcard-deck-settings-summary-label">
										{t("deckSettings.completionPace")}
									</span>
									<strong className="flashcard-deck-settings-summary-value">
										{t("deckSettings.days", {
											count: daysToComplete,
										})}
									</strong>
								</div>
								<span className="flashcard-deck-settings-summary-label">
									{t("deckSettings.dailySummary", {
										dailyNewCards,
										dailyReviewCards,
									})}
								</span>
							</div>
							<div className="flashcard-deck-settings-field">
								<label>
									<span>{t("deckSettings.dailyNewCards")}</span>
									<strong>{dailyNewCards}</strong>
								</label>
								<input
									type="range"
									min={1}
									max={200}
									value={dailyNewCards}
									onChange={(e) =>
										handleDailyNewCardsChange(
											parseInt(e.target.value),
										)
									}
								/>
							</div>
							{totalCards > 0 && (
								<div className="flashcard-deck-settings-field flashcard-deck-settings-field-row flashcard-deck-settings-days">
									<label>
										{t("deckSettings.estimatedDaysLabel")}
									</label>
									<div className="flashcard-deck-settings-days-inputs">
										<input
											type="number"
											min={1}
											max={totalCards}
											value={daysToComplete}
											onChange={(e) =>
												handleDaysToCompleteChange(
													e.target.value,
												)
											}
										/>
										<span className="flashcard-deck-settings-days-unit">
											{t("deckSettings.daysUnit")}
										</span>
										<span className="flashcard-deck-settings-days-hint">
											{t("deckSettings.totalCardsHint", {
												totalCards,
											})}
										</span>
									</div>
								</div>
							)}
							<div className="flashcard-deck-settings-field">
								<label>
									<span>
										{t("deckSettings.dailyReviewCards")}
									</span>
									<strong>{dailyReviewCards}</strong>
								</label>
								<input
									type="range"
									min={1}
									max={500}
									step={10}
									value={dailyReviewCards}
									onChange={(e) =>
										setDailyReviewCards(
											parseInt(e.target.value),
										)
									}
								/>
							</div>
							<div className="flashcard-deck-settings-field flashcard-deck-settings-field-row">
								<label>{t("deckSettings.studyOrder")}</label>
								<select
									value={studyOrder}
									onChange={(e) =>
										setStudyOrder(
											e.target.value as
												| "sequential"
												| "random",
										)
									}
								>
									<option value="sequential">
										{t("order.sequential")}
									</option>
									<option value="random">
										{t("order.random")}
									</option>
								</select>
							</div>
							<div className="flashcard-deck-settings-field">
								<label>
									<span>
										{t("deckSettings.targetRetention")}
									</span>
									<strong>
										{requestRetention.toFixed(2)}
									</strong>
								</label>
								<input
									type="range"
									min={0.7}
									max={0.99}
									step={0.01}
									value={requestRetention}
									onChange={(e) =>
										setRequestRetention(
											parseFloat(e.target.value),
										)
									}
								/>
							</div>
							<div className="flashcard-deck-settings-field flashcard-deck-settings-field-row">
								<label>
									{t("deckSettings.maxReviewInterval")}
								</label>
								<input
									type="number"
									min={30}
									max={3650}
									value={maximumInterval}
									onChange={(e) =>
										setMaximumInterval(e.target.value)
									}
								/>
							</div>
						</div>
					)}
				</div>

				<div className="flashcard-modal-footer">
					<FlashcardButton
						variant="green"
						onClick={() => void handleSave()}
					>
						{t("common.save")}
					</FlashcardButton>
					<FlashcardButton onClick={onClose}>
						{t("common.cancel")}
					</FlashcardButton>
				</div>
			</div>
		</div>
	);

	// Keep the modal inside the plugin root so design tokens remain available.
	const container =
		activeDocument.querySelector(".flashcard-root") ?? activeDocument.body;
	return ReactDOM.createPortal(modal, container);
});

interface HomeTotals {
	totalCards: number;
	newCards: number;
	dueCards: number;
	studyCount: number;
}

interface HomeStatsBarProps {
	deckCount: number;
	totals: HomeTotals;
}

const HomeStatsBar = memo(function HomeStatsBar({
	deckCount,
	totals,
}: HomeStatsBarProps) {
	const { t } = useI18n();

	return (
		<div className="flashcard-home-pills">
			<span className="flashcard-home-pill fc-pill">
				<Layers3 size={16} />
				<span className="blue">{deckCount}</span>
				{t("home.decks")}
			</span>
			<span className="flashcard-home-pill fc-pill">
				<Brain size={16} />
				<span className="green">{totals.newCards}</span>
				{t("home.newCards")}
			</span>
			<span className="flashcard-home-pill fc-pill">
				<ScanEye size={16} />
				<span className="red">{totals.dueCards}</span>
				{t("home.reviewCards")}
			</span>
			<span className="flashcard-home-pill fc-pill">
				<Calculator size={16} />
				<span className="purple">{totals.totalCards}</span>
				{t("home.totalCards")}
			</span>
			<span className="flashcard-home-pill fc-pill">
				<NotebookPen size={16} />
				<span className="orange">{totals.studyCount}</span>
				{t("home.studyCount")}
			</span>
		</div>
	);
});

interface DeckCardProps {
	deck: Deck;
	deckStats: DeckStats | undefined;
	onSelectDeck: (deckId: string) => void;
	onOpenWordList: (deckId: string) => void;
	onStartPractice: (deckId: string) => void;
	onOpenSourceFile: (filePath: string) => void;
	onOpenSettings: (deckId: string) => void;
}

const DeckCard = memo(function DeckCard({
	deck,
	deckStats,
	onSelectDeck,
	onOpenWordList,
	onStartPractice,
	onOpenSourceFile,
	onOpenSettings,
}: DeckCardProps) {
	const { t } = useI18n();
	const totalCards = deckStats?.totalCards ?? 0;
	const newCards = deckStats?.newCards ?? 0;
	const dueCards = deckStats?.dueCards ?? 0;

	return (
		<article className="flashcard-deck-item fc-lift">
			<div className="flashcard-deck-main">
				<div className="flashcard-deck-headline">
					<div className="flashcard-deck-info">
						<div className="flashcard-deck-name">{deck.name}</div>
						<span className="flashcard-deck-badge fc-pill">
							{deck.tag}
						</span>
					</div>
					<span
						className={`flashcard-deck-review-chip${
							dueCards > 0 ? " has-due" : ""
						}`}
					>
						<ScanEye size={14} />
						<strong>{dueCards}</strong>
						{t("home.toBeReviewed")}
					</span>
				</div>
				<div className="flashcard-deck-stats">
					<div className="flashcard-deck-stat">
						<span className="flashcard-deck-stat-value orange">
							{totalCards}
						</span>
						<span className="flashcard-deck-stat-label">
							{t("home.total")}
						</span>
					</div>
					<div className="flashcard-deck-stat">
						<span className="flashcard-deck-stat-value blue">
							{newCards}
						</span>
						<span className="flashcard-deck-stat-label">
							{t("home.new")}
						</span>
					</div>
					<div className="flashcard-deck-stat">
						<span
							className={`flashcard-deck-stat-value${
								dueCards > 0 ? " red" : ""
							}`}
						>
							{dueCards}
						</span>
						<span className="flashcard-deck-stat-label">
							{t("home.toBeReviewed")}
						</span>
					</div>
					<div className="flashcard-deck-stat">
						<span className="flashcard-deck-stat-value purple">
							{deck.studyCount}
						</span>
						<span className="flashcard-deck-stat-label">
							{t("home.studyCount")}
						</span>
					</div>
				</div>
			</div>

			<div className="flashcard-deck-side">
				<div className="flashcard-deck-actions2">
					<FlashcardButton
						variant="purple"
						icon={Brain}
						onClick={(e) => {
							e.stopPropagation();
							onSelectDeck(deck.id);
						}}
						title={t("home.studyModeTitle")}
					>
						<span>{t("home.study")}</span>
					</FlashcardButton>
					<FlashcardButton
						variant="blue"
						icon={Target}
						onClick={(e) => {
							e.stopPropagation();
							onStartPractice(deck.id);
						}}
						title={t("home.practiceModeTitle")}
					>
						<span>{t("home.practice")}</span>
					</FlashcardButton>
				</div>
				<div className="flashcard-deck-actions3">
					<FlashcardButton
						preset="icon"
						className="flashcard-deck-utility-btn"
						icon={List}
						onClick={(e) => {
							e.stopPropagation();
							onOpenWordList(deck.id);
						}}
						title={t("home.wordListTitle")}
						aria-label={t("home.wordListTitle")}
					/>
					<FlashcardButton
						preset="icon"
						className="flashcard-deck-utility-btn"
						icon={FileText}
						onClick={(e) => {
							e.stopPropagation();
							onOpenSourceFile(deck.filePath);
						}}
						title={t("home.openSourceTitle")}
						aria-label={t("home.openSourceTitle")}
					/>
					<FlashcardButton
						preset="icon"
						className="flashcard-deck-utility-btn"
						icon={Settings}
						onClick={(e) => {
							e.stopPropagation();
							onOpenSettings(deck.id);
						}}
						title={t("home.studySettingsTitle")}
						aria-label={t("home.studySettingsTitle")}
					/>
				</div>
			</div>
		</article>
	);
});

// ── DeckList ─────────────────────────────────────────────────────────────────

interface DeckListProps {
	dataStore: DataStore;
	settings: FlashcardSettings;
	refreshKey: number;
	onSelectDeck: (deckId: string) => void;
	onOpenWordList: (deckId: string) => void;
	onStartPractice: (deckId: string) => void;
	onRefresh: () => Promise<void>;
	onUpdateDeckStudySettings: (
		deckId: string,
		overrides: Partial<StudySettings> | null,
	) => Promise<void>;
	onOpenSourceFile: (filePath: string) => void;
	onOpenStats: () => void;
	onOpenAddCard: () => void;
}

export const DeckList: React.FC<DeckListProps> = ({
	dataStore,
	settings,
	refreshKey,
	onSelectDeck,
	onOpenWordList,
	onStartPractice,
	onRefresh,
	onUpdateDeckStudySettings,
	onOpenSourceFile,
	onOpenStats,
	onOpenAddCard,
}) => {
	const { t } = useI18n();
	const [decks, setDecks] = useState<Deck[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [modalDeckId, setModalDeckId] = useState<string | null>(null);

	const loadDecks = useCallback(() => {
		const allDecks = dataStore.getAllDecks();
		setDecks(allDecks);
	}, [dataStore]);

	useEffect(() => {
		loadDecks();
	}, [loadDecks, refreshKey]);

	const deckStatsById = useMemo(() => {
		const nextStats = new Map<string, DeckStats>();
		for (const deck of decks) {
			nextStats.set(deck.id, dataStore.getDeckStats(deck));
		}
		return nextStats;
	}, [dataStore, decks]);

	const totals = useMemo<HomeTotals>(() => {
		return decks.reduce(
			(accumulator, deck) => {
				const deckStats = deckStatsById.get(deck.id);
				accumulator.totalCards += deckStats?.totalCards ?? 0;
				accumulator.newCards += deckStats?.newCards ?? 0;
				accumulator.dueCards += deckStats?.dueCards ?? 0;
				accumulator.studyCount += deck.studyCount;
				return accumulator;
			},
			{ totalCards: 0, newCards: 0, dueCards: 0, studyCount: 0 },
		);
	}, [decks, deckStatsById]);

	const handleRefresh = useCallback(async () => {
		setIsLoading(true);
		try {
			await onRefresh();
			loadDecks();
		} finally {
			setIsLoading(false);
		}
	}, [loadDecks, onRefresh]);

	const handleCloseModal = useCallback(() => {
		setModalDeckId(null);
	}, []);

	const handleSaveDeckSettings = useCallback(
		async (overrides: Partial<StudySettings> | null) => {
			if (modalDeckId === null) return;
			await onUpdateDeckStudySettings(modalDeckId, overrides);
		},
		[modalDeckId, onUpdateDeckStudySettings],
	);

	const modalDeck = useMemo(
		() => decks.find((deck) => deck.id === modalDeckId),
		[decks, modalDeckId],
	);

	return (
		<div className="flashcard-home">
			<div className="flashcard-home-hero">
				<div className="flashcard-header">
					<div className="flashcard-title">
						<BookOpen size={22} /> {t("home.title")}
					</div>
					<div className="flashcard-header-actions">
						<FlashcardButton
							preset="icon"
							icon={ChartSpline}
							onClick={onOpenStats}
							title={t("home.statsTitle")}
						/>
						<FlashcardButton
							preset="icon"
							icon={RefreshCcw}
							onClick={() => void handleRefresh()}
							disabled={isLoading}
							title={t("home.refreshTitle")}
							iconClassName={isLoading ? "spinning" : ""}
						/>
					</div>
				</div>
				<HomeStatsBar deckCount={decks.length} totals={totals} />
			</div>

			{decks.length === 0 ? (
				<div className="flashcard-empty">
					<div className="flashcard-empty-icon">
						<Inbox size={48} />
					</div>
					<p>{t("home.emptyTitle")}</p>
					<p className="flashcard-empty-hint">
						{t("home.emptyHint", { tag: "#wordTag" })}
					</p>
				</div>
			) : (
				<div className="flashcard-deck-list">
					{decks.map((deck) => (
						<DeckCard
							key={deck.id}
							deck={deck}
							deckStats={deckStatsById.get(deck.id)}
							onSelectDeck={onSelectDeck}
							onOpenWordList={onOpenWordList}
							onStartPractice={onStartPractice}
							onOpenSourceFile={onOpenSourceFile}
							onOpenSettings={setModalDeckId}
						/>
					))}
				</div>
			)}

			{modalDeckId !== null && modalDeck && (
				<DeckSettingsModal
					deckName={modalDeck.name}
					totalCards={modalDeck.cards.length}
					globalSettings={settings}
					deckOverrides={settings.deckStudySettings?.[modalDeckId]}
					onSave={handleSaveDeckSettings}
					onClose={handleCloseModal}
				/>
			)}

			<FlashcardButton
				preset="icon"
				className="flashcard-add-card-fab"
				icon={Plus}
				iconSize={22}
				onClick={onOpenAddCard}
				title={t("cardEditor.addCardTitle")}
				aria-label={t("cardEditor.addCardTitle")}
			/>
		</div>
	);
};
