import React, {
	memo,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import ReactDOM from "react-dom";
import {
	BookOpen,
	Brain,
	Calculator,
	ChartSpline,
	Ellipsis,
	FileDown,
	FileText,
	Inbox,
	Keyboard,
	Layers3,
	List,
	LoaderCircle,
	NotebookPen,
	Plus,
	RefreshCcw,
	Settings,
	Sparkles,
	Target,
	TriangleAlert,
} from "lucide-react";
import {
	Deck,
	DeckStats,
	FlashcardSettings,
	StudySettings,
} from "../../shared/types";
import type { DeckHomeSnapshot } from "../../decks/deckHomeRuntime";
import {
	applyDailyNewCardsToDeckSettingsDraft,
	applyDaysToCompleteToDeckSettingsDraft,
	buildDeckSettingsSavePayload,
	calculateDaysToComplete,
	createDeckSettingsDraft,
} from "../../decks/deckSettingsViewModel";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardHeader } from "./FlashcardHeader";
import { useI18n } from "./I18nContext";
import { formatStudyOrder } from "../../i18n";
import { validateSpellingDeck } from "../../cards/spellingWord";
import { isStableCardIdentity } from "../../identity/cardIdentity";

// ── Per-deck settings modal ───────────────────────────────────────────────────

interface DeckSettingsModalProps {
	deck: Deck;
	globalSettings: FlashcardSettings;
	deckOverrides: Partial<StudySettings> | undefined;
	wordLearningEnabled: boolean;
	onSave: (
		overrides: Partial<StudySettings> | null,
		wordLearningEnabled: boolean,
	) => Promise<void>;
	onOpenSourceFile: () => void;
	onMigrateIdentity: () => Promise<boolean>;
	onClose: () => void;
}

const DeckSettingsModal = memo(function DeckSettingsModal({
	deck,
	globalSettings,
	deckOverrides,
	wordLearningEnabled,
	onSave,
	onOpenSourceFile,
	onMigrateIdentity,
	onClose,
}: DeckSettingsModalProps) {
	const { t, language } = useI18n();
	const totalCards = deck.cards.length;
	const [draft, setDraft] = useState(() =>
		createDeckSettingsDraft({
			totalCards,
			globalSettings,
			deckOverrides,
		}),
	);
	const [wordLearningDraft, setWordLearningDraft] =
		useState(wordLearningEnabled);
	const [isMigratingIdentity, setIsMigratingIdentity] = useState(false);
	const spellingValidation = useMemo(
		() => validateSpellingDeck(deck),
		[deck],
	);
	const hasStableIdentities = useMemo(
		() => deck.cards.every((card) => isStableCardIdentity(card.id)),
		[deck.cards],
	);
	const spellingBlocked =
		wordLearningDraft &&
		(!spellingValidation.canStart || !hasStableIdentities);

	const handleDailyNewCardsChange = (val: number) => {
		setDraft((current) =>
			applyDailyNewCardsToDeckSettingsDraft(current, totalCards, val),
		);
	};

	const handleDaysToCompleteChange = (raw: string) => {
		setDraft((current) =>
			applyDaysToCompleteToDeckSettingsDraft(current, totalCards, raw),
		);
	};

	const handleSave = async () => {
		if (spellingBlocked) return;
		await onSave(
			buildDeckSettingsSavePayload(draft, globalSettings),
			wordLearningDraft,
		);
		onClose();
	};

	const handleMigrateIdentity = async () => {
		setIsMigratingIdentity(true);
		try {
			await onMigrateIdentity();
		} finally {
			setIsMigratingIdentity(false);
		}
	};

	const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (e.target === e.currentTarget) onClose();
	};

	const handleBackdropKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.target !== e.currentTarget) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClose();
		}
	};

	const modal = (
		<div
			className="flashcard-modal-backdrop"
			onClick={handleBackdropClick}
			onKeyDown={handleBackdropKeyDown}
			role="presentation"
		>
			<div className="flashcard-modal">
				<div className="flashcard-modal-header">
					<div className="flashcard-modal-heading">
						<div className="flashcard-modal-kicker fc-kicker">
							<Sparkles size={14} /> {t("deckSettings.kicker")}
						</div>
						<span className="flashcard-modal-title">
							{t("deckSettings.title", { deckName: deck.name })}
						</span>
						<span className="flashcard-modal-subtitle">
							{t("deckSettings.subtitle", {
								totalCards,
								mode: draft.useCustom
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
					<div className="flashcard-deck-settings-purpose flashcard-deck-settings-card">
						<div className="flashcard-deck-settings-purpose-heading">
							<div>
								<strong>
									{t("deckSettings.wordLearningTitle")}
								</strong>
								<p>
									{t("deckSettings.wordLearningDescription")}
								</p>
							</div>
							<label className="flashcard-deck-settings-toggle-label">
								<input
									type="checkbox"
									checked={wordLearningDraft}
									onChange={(event) =>
										setWordLearningDraft(
											event.target.checked,
										)
									}
								/>
								<span>
									{t("deckSettings.wordLearningToggle")}
								</span>
							</label>
						</div>

						{wordLearningDraft && !hasStableIdentities && (
							<div className="flashcard-deck-settings-warning">
								<TriangleAlert size={16} />
								<span>
									{t("deckSettings.identityRequired")}
								</span>
								<FlashcardButton
									variant="purple"
									onClick={() => void handleMigrateIdentity()}
									disabled={isMigratingIdentity}
								>
									{isMigratingIdentity
										? t("identity.migrating")
										: t("identity.migrateNow")}
								</FlashcardButton>
							</div>
						)}

						{wordLearningDraft &&
							(!spellingValidation.canStart ||
								spellingValidation.invalidCards.length > 0) && (
								<div className="flashcard-deck-settings-warning">
									<TriangleAlert size={16} />
									<div>
										<strong>
											{spellingValidation.canStart
												? t(
														"deckSettings.invalidSpellingCards",
														{
															count: spellingValidation
																.invalidCards
																.length,
														},
													)
												: t(
														"deckSettings.noEligibleSpellingCards",
														{
															count: spellingValidation
																.invalidCards
																.length,
														},
													)}
										</strong>
										<ul>
											{spellingValidation.invalidCards
												.slice(0, 5)
												.map((invalidCard) => (
													<li
														key={invalidCard.cardId}
													>
														{t(
															"deckSettings.invalidSpellingCard",
															{
																index:
																	invalidCard.indexInFile +
																	1,
																front:
																	invalidCard.front
																		.replace(
																			/\s+/g,
																			" ",
																		)
																		.slice(
																			0,
																			40,
																		) ||
																	"—",
															},
														)}
													</li>
												))}
										</ul>
										{spellingValidation.invalidCards
											.length > 5 && (
											<span>
												{t(
													"deckSettings.invalidSpellingCardsMore",
													{
														count:
															spellingValidation
																.invalidCards
																.length - 5,
													},
												)}
											</span>
										)}
									</div>
									<FlashcardButton
										variant="blue"
										onClick={onOpenSourceFile}
									>
										{t("home.openSourceTitle")}
									</FlashcardButton>
								</div>
							)}
					</div>

					<div className="flashcard-deck-settings-toggle flashcard-deck-settings-card">
						<label className="flashcard-deck-settings-toggle-label">
							<input
								type="checkbox"
								checked={draft.useCustom}
								onChange={(e) =>
									setDraft((current) => ({
										...current,
										useCustom: e.target.checked,
									}))
								}
							/>
							<span>{t("deckSettings.useCustom")}</span>
						</label>
						<p className="flashcard-deck-settings-toggle-copy">
							{t("deckSettings.useCustomCopy")}
						</p>
					</div>

					{!draft.useCustom ? (
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
										days: calculateDaysToComplete(
											totalCards,
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
											count: draft.daysToComplete,
										})}
									</strong>
								</div>
								<span className="flashcard-deck-settings-summary-label">
									{t("deckSettings.dailySummary", {
										dailyNewCards: draft.dailyNewCards,
										dailyReviewCards:
											draft.dailyReviewCards,
									})}
								</span>
							</div>
							<div className="flashcard-deck-settings-field">
								<label>
									<span>
										{t("deckSettings.dailyNewCards")}
									</span>
									<strong>{draft.dailyNewCards}</strong>
								</label>
								<input
									type="range"
									min={1}
									max={200}
									value={draft.dailyNewCards}
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
											value={draft.daysToComplete}
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
									<strong>{draft.dailyReviewCards}</strong>
								</label>
								<input
									type="range"
									min={1}
									max={500}
									step={10}
									value={draft.dailyReviewCards}
									onChange={(e) =>
										setDraft((current) => ({
											...current,
											dailyReviewCards: parseInt(
												e.target.value,
											),
										}))
									}
								/>
							</div>
							<div className="flashcard-deck-settings-field flashcard-deck-settings-field-row">
								<label>{t("deckSettings.studyOrder")}</label>
								<select
									value={draft.studyOrder}
									onChange={(e) =>
										setDraft((current) => ({
											...current,
											studyOrder: e.target
												.value as StudySettings["studyOrder"],
										}))
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
										{draft.requestRetention.toFixed(2)}
									</strong>
								</label>
								<input
									type="range"
									min={0.7}
									max={0.99}
									step={0.01}
									value={draft.requestRetention}
									onChange={(e) =>
										setDraft((current) => ({
											...current,
											requestRetention: parseFloat(
												e.target.value,
											),
										}))
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
									value={draft.maximumInterval}
									onChange={(e) =>
										setDraft((current) => ({
											...current,
											maximumInterval: e.target.value,
										}))
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
						disabled={spellingBlocked}
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

interface DeckCardProps {
	deck: Deck;
	deckStats: DeckStats | undefined;
	onSelectDeck: (deckId: string) => void;
	onOpenWordList: (deckId: string) => void;
	onStartPractice: (deckId: string) => void;
	onExportDeck: (deckId: string) => Promise<void>;
	onOpenSourceFile: (filePath: string) => void;
	onOpenSettings: (deckId: string) => void;
	onStartSpelling: (deckId: string) => void;
	wordLearningEnabled: boolean;
	isExporting: boolean;
}

const DeckCard = memo(function DeckCard({
	deck,
	deckStats,
	onSelectDeck,
	onOpenWordList,
	onStartPractice,
	onExportDeck,
	onOpenSourceFile,
	onOpenSettings,
	onStartSpelling,
	wordLearningEnabled,
	isExporting,
}: DeckCardProps) {
	const { t } = useI18n();
	const totalCards = deckStats?.totalCards ?? 0;
	const newCards = deckStats?.newCards ?? 0;
	const [showMoreActions, setShowMoreActions] = useState(false);
	const actionsMenuId = useId();
	const actionsRef = useRef<HTMLDivElement>(null);
	const spellingValidation = useMemo(
		() => validateSpellingDeck(deck),
		[deck],
	);
	const unstableCardIds = useMemo(
		() =>
			deck.cards
				.filter((card) => !isStableCardIdentity(card.id))
				.map((card) => card.id),
		[deck.cards],
	);
	const spellingIssueCount = useMemo(
		() =>
			new Set([
				...(spellingValidation.canStart
					? []
					: spellingValidation.invalidCards.map(
							(card) => card.cardId,
						)),
				...unstableCardIds,
			]).size,
		[
			spellingValidation.canStart,
			spellingValidation.invalidCards,
			unstableCardIds,
		],
	);
	const spellingReady =
		spellingValidation.canStart && unstableCardIds.length === 0;

	useEffect(() => {
		if (!showMoreActions) return;

		const handlePointerDown = (event: PointerEvent) => {
			if (!actionsRef.current?.contains(event.target as Node | null)) {
				setShowMoreActions(false);
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setShowMoreActions(false);
			}
		};

		activeDocument.addEventListener("pointerdown", handlePointerDown);
		activeDocument.addEventListener("keydown", handleKeyDown);
		return () => {
			activeDocument.removeEventListener(
				"pointerdown",
				handlePointerDown,
			);
			activeDocument.removeEventListener("keydown", handleKeyDown);
		};
	}, [showMoreActions]);

	return (
		<article
			className={`flashcard-deck-item fc-lift${showMoreActions ? " is-actions-open" : ""}`}
		>
			<div className="flashcard-deck-main">
				<div className="flashcard-deck-headline">
					<div className="flashcard-deck-name">{deck.name}</div>
					<div className="flashcard-deck-name-wrapper">
						<span className="flashcard-deck-tag">{deck.tag}</span>
						{wordLearningEnabled && (
							<span
								className={`flashcard-word-learning-badge${
									spellingReady ? "" : " is-invalid"
								}`}
							>
								{spellingReady ? (
									<Keyboard size={13} />
								) : (
									<TriangleAlert size={13} />
								)}
								{spellingReady
									? t("home.wordLearningDeck")
									: t("home.wordLearningNeedsRepair")}
							</span>
						)}
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
							<span className="flashcard-deck-stat-value purple">
								{deck.studyCount}
							</span>
							<span className="flashcard-deck-stat-label">
								{t("home.studyCount")}
							</span>
						</div>
					</div>
				</div>
			</div>

			<div ref={actionsRef} className="flashcard-deck-side">
				<div className="flashcard-deck-actions2">
					<FlashcardButton
						variant="green"
						className="flashcard-deck-action-study"
						icon={Brain}
						onClick={(event) => {
							event.stopPropagation();
							onSelectDeck(deck.id);
						}}
						title={t("home.studyModeTitle")}
					>
						<span>{t("home.study")}</span>
					</FlashcardButton>
					<FlashcardButton
						variant="blue"
						className="flashcard-deck-action-practice"
						icon={Target}
						onClick={(event) => {
							event.stopPropagation();
							onStartPractice(deck.id);
						}}
						title={t("home.practiceModeTitle")}
					>
						<span>{t("home.practice")}</span>
					</FlashcardButton>
					<FlashcardButton
						variant="gray"
						className="flashcard-deck-action-more"
						icon={Ellipsis}
						onClick={(event) => {
							event.stopPropagation();
							setShowMoreActions((current) => !current);
						}}
						active={showMoreActions}
						title={
							showMoreActions
								? t("home.hideMoreActions")
								: t("home.showMoreActions")
						}
						aria-label={
							showMoreActions
								? t("home.hideMoreActions")
								: t("home.showMoreActions")
						}
						aria-expanded={showMoreActions}
						aria-controls={actionsMenuId}
					/>
				</div>

				{showMoreActions && (
					<div
						id={actionsMenuId}
						className="flashcard-deck-more-actions"
						role="toolbar"
						aria-label={t("home.moreActions")}
					>
						{wordLearningEnabled && (
							<FlashcardButton
								variant="green"
								className="flashcard-deck-more-action"
								icon={Keyboard}
								onClick={(event) => {
									event.stopPropagation();
									setShowMoreActions(false);
									onStartSpelling(deck.id);
								}}
								disabled={!spellingReady}
								title={
									spellingReady
										? spellingValidation.invalidCards
												.length > 0
											? t(
													"home.spellingModeIgnoredTitle",
													{
														count: spellingValidation
															.invalidCards
															.length,
													},
												)
											: t("home.spellingModeTitle")
										: t("home.spellingUnavailableTitle", {
												count: spellingIssueCount,
											})
								}
							>
								<span>{t("home.spelling")}</span>
							</FlashcardButton>
						)}
						<FlashcardButton
							className="flashcard-deck-more-action"
							icon={isExporting ? LoaderCircle : FileDown}
							iconClassName={isExporting ? "spinning" : undefined}
							onClick={(event) => {
								event.stopPropagation();
								setShowMoreActions(false);
								void onExportDeck(deck.id);
							}}
							disabled={isExporting}
							title={t("home.exportPdfTitle")}
						>
							<span>{t("home.exportPdfTitle")}</span>
						</FlashcardButton>
						<FlashcardButton
							className="flashcard-deck-more-action"
							icon={List}
							onClick={(event) => {
								event.stopPropagation();
								setShowMoreActions(false);
								onOpenWordList(deck.id);
							}}
						>
							<span>{t("home.list")}</span>
						</FlashcardButton>
						<FlashcardButton
							className="flashcard-deck-more-action"
							icon={FileText}
							onClick={(event) => {
								event.stopPropagation();
								setShowMoreActions(false);
								onOpenSourceFile(deck.filePath);
							}}
						>
							<span>{t("home.source")}</span>
						</FlashcardButton>
						<FlashcardButton
							className="flashcard-deck-more-action"
							icon={Settings}
							onClick={(event) => {
								event.stopPropagation();
								setShowMoreActions(false);
								onOpenSettings(deck.id);
							}}
						>
							<span>{t("home.setting")}</span>
						</FlashcardButton>
					</div>
				)}
			</div>
		</article>
	);
});

// ── DeckList ─────────────────────────────────────────────────────────────────

interface DeckListProps {
	snapshot: DeckHomeSnapshot;
	settings: FlashcardSettings;
	legacyMigration: { sourceCount: number; cardCount: number } | null;
	onSelectDeck: (deckId: string) => void;
	onOpenWordList: (deckId: string) => void;
	onStartPractice: (deckId: string) => void;
	onStartSpelling: (deckId: string) => void;
	onExportDeck: (deckId: string) => Promise<void>;
	onRefresh: () => Promise<void>;
	onUpdateDeckSettings: (
		deckId: string,
		overrides: Partial<StudySettings> | null,
		wordLearningEnabled: boolean,
	) => Promise<void>;
	onMigrateDeckIdentity: (deckId: string) => Promise<boolean>;
	onOpenSourceFile: (filePath: string) => void;
	onOpenStats: () => void;
	onOpenSettings: () => void;
	onOpenAddCard: () => void;
	onMigrateLegacyDecks: () => Promise<void>;
}

export const DeckList: React.FC<DeckListProps> = ({
	snapshot,
	settings,
	legacyMigration,
	onSelectDeck,
	onOpenWordList,
	onStartPractice,
	onStartSpelling,
	onExportDeck,
	onRefresh,
	onUpdateDeckSettings,
	onMigrateDeckIdentity,
	onOpenSourceFile,
	onOpenStats,
	onOpenSettings,
	onOpenAddCard,
	onMigrateLegacyDecks,
}) => {
	const { t } = useI18n();
	const [isLoading, setIsLoading] = useState(false);
	const [isMigrating, setIsMigrating] = useState(false);
	const [exportingDeckId, setExportingDeckId] = useState<string | null>(null);
	const [modalDeckId, setModalDeckId] = useState<string | null>(null);

	const handleRefresh = useCallback(async () => {
		setIsLoading(true);
		try {
			await onRefresh();
		} finally {
			setIsLoading(false);
		}
	}, [onRefresh]);

	const handleCloseModal = useCallback(() => {
		setModalDeckId(null);
	}, []);

	const handleMigrateLegacyDecks = useCallback(async () => {
		setIsMigrating(true);
		try {
			await onMigrateLegacyDecks();
		} finally {
			setIsMigrating(false);
		}
	}, [onMigrateLegacyDecks]);

	const handleExportDeck = useCallback(
		async (deckId: string) => {
			if (exportingDeckId !== null) return;
			setExportingDeckId(deckId);
			try {
				await onExportDeck(deckId);
			} finally {
				setExportingDeckId(null);
			}
		},
		[exportingDeckId, onExportDeck],
	);

	const handleSaveDeckSettings = useCallback(
		async (
			overrides: Partial<StudySettings> | null,
			wordLearningEnabled: boolean,
		) => {
			if (modalDeckId === null) return;
			await onUpdateDeckSettings(
				modalDeckId,
				overrides,
				wordLearningEnabled,
			);
		},
		[modalDeckId, onUpdateDeckSettings],
	);

	const modalDeck = useMemo(
		() => snapshot.decks.find((deck) => deck.id === modalDeckId),
		[modalDeckId, snapshot.decks],
	);

	return (
		<>
			<div className="flashcard-home">
				<FlashcardHeader
					className="flashcard-home-header"
					icon={BookOpen}
					title={t("home.title")}
					badge="NEURAL DECK"
					stats={[
						{
							key: "decks",
							icon: Layers3,
							value: snapshot.decks.length,
							label: t("home.decks"),
							tone: "blue",
						},
						{
							key: "new",
							icon: Brain,
							value: snapshot.totals.newCards,
							label: t("home.newCards"),
							tone: "green",
						},
						{
							key: "total",
							icon: Calculator,
							value: snapshot.totals.totalCards,
							label: t("home.totalCards"),
							tone: "purple",
						},
						{
							key: "studies",
							icon: NotebookPen,
							value: snapshot.totals.studyCount,
							label: t("home.studyCount"),
							tone: "orange",
						},
					]}
					right={
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
							<FlashcardButton
								preset="icon"
								icon={Settings}
								onClick={onOpenSettings}
								title={t("home.pluginSettingsTitle")}
							/>
						</div>
					}
				/>

				{legacyMigration && (
					<section className="flashcard-identity-migration-card">
						<div className="flashcard-identity-migration-copy">
							<div className="flashcard-identity-migration-icon">
								<Sparkles size={20} />
							</div>
							<div>
								<strong>
									{t("identity.oneClickMigrationTitle")}
								</strong>
								<p>
									{t(
										"identity.oneClickMigrationDescription",
										{
											sources:
												legacyMigration.sourceCount,
											cards: legacyMigration.cardCount,
										},
									)}
								</p>
							</div>
						</div>
						<FlashcardButton
							variant="green"
							icon={Sparkles}
							onClick={() => void handleMigrateLegacyDecks()}
							disabled={isMigrating}
						>
							{isMigrating
								? t("identity.migrating")
								: t("identity.migrateAllNow")}
						</FlashcardButton>
					</section>
				)}

				{snapshot.decks.length === 0 ? (
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
						{snapshot.decks.map((deck) => (
							<DeckCard
								key={deck.id}
								deck={deck}
								deckStats={snapshot.statsByDeckId.get(deck.id)}
								onSelectDeck={onSelectDeck}
								onOpenWordList={onOpenWordList}
								onStartPractice={onStartPractice}
								onStartSpelling={onStartSpelling}
								onExportDeck={handleExportDeck}
								onOpenSourceFile={onOpenSourceFile}
								onOpenSettings={setModalDeckId}
								wordLearningEnabled={
									settings.wordLearningDecks[deck.id] === true
								}
								isExporting={exportingDeckId === deck.id}
							/>
						))}
					</div>
				)}
			</div>

			{modalDeckId !== null && modalDeck && (
				<DeckSettingsModal
					deck={modalDeck}
					globalSettings={settings}
					deckOverrides={settings.deckStudySettings?.[modalDeckId]}
					wordLearningEnabled={
						settings.wordLearningDecks[modalDeckId] === true
					}
					onSave={handleSaveDeckSettings}
					onOpenSourceFile={() =>
						onOpenSourceFile(modalDeck.filePath)
					}
					onMigrateIdentity={() =>
						onMigrateDeckIdentity(modalDeck.id)
					}
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
		</>
	);
};
