import React, { memo, useCallback, useId, useState } from "react";
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	arrayMove,
	rectSortingStrategy,
	sortableKeyboardCoordinates,
	SortableContext,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	BookOpen,
	Brain,
	Calculator,
	ChartNoAxesColumn,
	FileDown,
	FileText,
	GripVertical,
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
import type {
	DeckHome,
	DeckHomeDeckSnapshot,
	DeckHomeDestination,
	DeckHomeSettingsChange,
	DeckHomeSettingsDraft,
	DeckHomeSnapshot,
} from "../../decks/deckHome";
import { FlashcardButton } from "./FlashcardButton";
import { FlashcardInput } from "./FlashcardInput";
import { FlashcardMenu, type FlashcardMenuItem } from "./FlashcardMenu";
import { FlashcardSelect } from "./FlashcardSelect";
import { FlashcardHeader } from "./FlashcardHeader";
import { useI18n } from "./I18nContext";
import { formatStudyOrder } from "../../i18n";
import { ModalSurface } from "../modal";

// ── Per-deck settings modal ───────────────────────────────────────────────────

interface DeckSettingsModalProps {
	draft: DeckHomeSettingsDraft;
	isSaving: boolean;
	isMigratingIdentity: boolean;
	onChange: (change: DeckHomeSettingsChange) => void;
	onSave: () => Promise<void>;
	onOpenSourceFile: () => void;
	onMigrateIdentity: () => Promise<boolean>;
	onClose: () => void;
}

const DeckSettingsModal = memo(function DeckSettingsModal({
	draft,
	isSaving,
	isMigratingIdentity,
	onChange,
	onSave,
	onOpenSourceFile,
	onMigrateIdentity,
	onClose,
}: DeckSettingsModalProps) {
	const { t, language } = useI18n();
	const totalCards = draft.totalCards;
	const titleId = useId();
	const subtitleId = useId();
	const spellingValidation = draft.spelling;
	const hasStableIdentities = draft.spelling.hasStableIdentities;
	const spellingBlocked =
		draft.wordLearningEnabled && (!spellingValidation.canStart || !hasStableIdentities);
	const isBusy = isMigratingIdentity || isSaving;

	const handleDailyNewCardsChange = (val: number) => {
		onChange({ field: "dailyNewCards", value: val });
	};

	const handleDaysToCompleteChange = (raw: string) => {
		onChange({ field: "daysToComplete", value: raw });
	};

	const handleSave = async () => {
		if (spellingBlocked || isBusy) return;
		await onSave();
	};

	const handleMigrateIdentity = async () => {
		if (isBusy) return;
		await onMigrateIdentity();
	};

	return (
		<ModalSurface
			className="flashcard-deck-settings-modal"
			labelledBy={titleId}
			describedBy={subtitleId}
			onRequestClose={onClose}
			isDismissible={!isBusy}
		>
			{({ requestClose, initialFocusProps }) => (
				<>
					<div className="flashcard-modal-header">
						<div className="flashcard-modal-heading">
							<div className="flashcard-modal-kicker fc-kicker">
								<Sparkles size={14} /> {t("deckSettings.kicker")}
							</div>
							<span id={titleId} className="flashcard-modal-title">
								{t("deckSettings.title", {
									deckName: draft.deckName,
								})}
							</span>
							<span id={subtitleId} className="flashcard-modal-subtitle">
								{t("deckSettings.subtitle", {
									totalCards,
									mode: draft.useCustom
										? t("deckSettings.usingCustom")
										: t("deckSettings.usingGlobal"),
								})}
							</span>
						</div>
						<button
							type="button"
							className="flashcard-modal-close"
							onClick={requestClose}
							disabled={isBusy}
							aria-label={t("common.close")}
						>
							✕
						</button>
					</div>

					<div className="flashcard-modal-body">
						<div className="flashcard-deck-settings-purpose flashcard-deck-settings-card">
							<div className="flashcard-deck-settings-purpose-heading">
								<div>
									<strong>{t("deckSettings.wordLearningTitle")}</strong>
									<p>{t("deckSettings.wordLearningDescription")}</p>
								</div>
								<label className="flashcard-deck-settings-toggle-label">
									<input
										type="checkbox"
										checked={draft.wordLearningEnabled}
										{...initialFocusProps}
										onChange={(event) =>
											onChange({
												field: "wordLearningEnabled",
												value: event.target.checked,
											})
										}
									/>
									<span>{t("deckSettings.wordLearningToggle")}</span>
								</label>
							</div>

							{draft.wordLearningEnabled && !hasStableIdentities && (
								<div className="flashcard-deck-settings-warning">
									<TriangleAlert size={16} />
									<span>{t("deckSettings.identityRequired")}</span>
									<FlashcardButton
										variant="purple"
										onClick={() => void handleMigrateIdentity()}
										disabled={isBusy}
									>
										{isMigratingIdentity
											? t("identity.migrating")
											: t("identity.migrateNow")}
									</FlashcardButton>
								</div>
							)}

							{draft.wordLearningEnabled &&
								(!spellingValidation.canStart ||
									spellingValidation.invalidCards.length > 0) && (
									<div className="flashcard-deck-settings-warning">
										<TriangleAlert size={16} />
										<div>
											<strong>
												{spellingValidation.canStart
													? t("deckSettings.invalidSpellingCards", {
															count: spellingValidation.invalidCards
																.length,
														})
													: t("deckSettings.noEligibleSpellingCards", {
															count: spellingValidation.invalidCards
																.length,
														})}
											</strong>
											<ul>
												{spellingValidation.invalidCards
													.slice(0, 5)
													.map((invalidCard) => (
														<li key={invalidCard.cardId}>
															{t("deckSettings.invalidSpellingCard", {
																index: invalidCard.indexInFile + 1,
																front:
																	invalidCard.front
																		.replace(/\s+/g, " ")
																		.slice(0, 40) || "—",
															})}
														</li>
													))}
											</ul>
											{spellingValidation.invalidCards.length > 5 && (
												<span>
													{t("deckSettings.invalidSpellingCardsMore", {
														count:
															spellingValidation.invalidCards.length -
															5,
													})}
												</span>
											)}
										</div>
										<FlashcardButton variant="blue" onClick={onOpenSourceFile}>
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
										onChange({
											field: "useCustom",
											value: e.target.checked,
										})
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
									dailyNewCards: draft.global.dailyNewCards,
									dailyReviewCards: draft.global.dailyReviewCards,
									studyOrder: formatStudyOrder(language, draft.global.studyOrder),
								})}
								{totalCards > 0 && (
									<span>
										&nbsp;
										{t("deckSettings.estimatedDays", {
											days:
												totalCards <= 0
													? 0
													: Math.ceil(
															totalCards / draft.global.dailyNewCards,
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
											dailyReviewCards: draft.dailyReviewCards,
										})}
									</span>
								</div>
								<div className="flashcard-deck-settings-field">
									<label>
										<span>{t("deckSettings.dailyNewCards")}</span>
										<strong>{draft.dailyNewCards}</strong>
									</label>
									<input
										type="range"
										min={1}
										max={200}
										value={draft.dailyNewCards}
										onChange={(e) =>
											handleDailyNewCardsChange(parseInt(e.target.value))
										}
									/>
								</div>
								{totalCards > 0 && (
									<div className="flashcard-deck-settings-field flashcard-deck-settings-field-row flashcard-deck-settings-days">
										<label>{t("deckSettings.estimatedDaysLabel")}</label>
										<div className="flashcard-deck-settings-days-inputs">
											<FlashcardInput
												type="number"
												min={1}
												max={totalCards}
												value={draft.daysToComplete}
												onChange={(e) =>
													handleDaysToCompleteChange(e.target.value)
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
										<span>{t("deckSettings.dailyReviewCards")}</span>
										<strong>{draft.dailyReviewCards}</strong>
									</label>
									<input
										type="range"
										min={1}
										max={500}
										step={10}
										value={draft.dailyReviewCards}
										onChange={(e) =>
											onChange({
												field: "dailyReviewCards",
												value: parseInt(e.target.value),
											})
										}
									/>
								</div>
								<div className="flashcard-deck-settings-field flashcard-deck-settings-field-row">
									<label>{t("deckSettings.studyOrder")}</label>
									<FlashcardSelect
										value={draft.studyOrder}
										onChange={(e) =>
											onChange({
												field: "studyOrder",
												value: e.target.value as "sequential" | "random",
											})
										}
									>
										<option value="sequential">{t("order.sequential")}</option>
										<option value="random">{t("order.random")}</option>
									</FlashcardSelect>
								</div>
								<div className="flashcard-deck-settings-field">
									<label>
										<span>{t("deckSettings.targetRetention")}</span>
										<strong>{draft.requestRetention.toFixed(2)}</strong>
									</label>
									<input
										type="range"
										min={0.7}
										max={0.99}
										step={0.01}
										value={draft.requestRetention}
										onChange={(e) =>
											onChange({
												field: "requestRetention",
												value: parseFloat(e.target.value),
											})
										}
									/>
								</div>
								<div className="flashcard-deck-settings-field flashcard-deck-settings-field-row">
									<label>{t("deckSettings.maxReviewInterval")}</label>
									<FlashcardInput
										type="number"
										min={30}
										max={3650}
										value={draft.maximumInterval}
										onChange={(e) =>
											onChange({
												field: "maximumInterval",
												value: e.target.value,
											})
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
							disabled={spellingBlocked || isBusy}
						>
							{t("common.save")}
						</FlashcardButton>
						<FlashcardButton onClick={requestClose} disabled={isBusy}>
							{t("common.cancel")}
						</FlashcardButton>
					</div>
				</>
			)}
		</ModalSurface>
	);
});

interface DeckCardProps {
	deck: DeckHomeDeckSnapshot;
	isReorderDisabled: boolean;
	onSelectDeck: (deckId: string) => void;
	onOpenWordList: (deckId: string) => void;
	onStartPractice: (deckId: string) => void;
	onExportDeck: (deckId: string) => Promise<void>;
	onOpenSourceFile: (filePath: string) => void;
	onOpenSettings: (deckId: string) => void;
	onStartSpelling: (deckId: string) => void;
	isExporting: boolean;
	isExportBusy: boolean;
	isSettingsLocked: boolean;
}

const DeckCard = memo(function DeckCard({
	deck,
	isReorderDisabled,
	onSelectDeck,
	onOpenWordList,
	onStartPractice,
	onExportDeck,
	onOpenSourceFile,
	onOpenSettings,
	onStartSpelling,
	isExporting,
	isExportBusy,
	isSettingsLocked,
}: DeckCardProps) {
	const { t } = useI18n();
	const {
		attributes,
		isDragging,
		listeners,
		setActivatorNodeRef,
		setNodeRef,
		transform,
		transition,
	} = useSortable({ id: deck.id, disabled: isReorderDisabled });
	const totalCards = deck.stats.totalCards;
	const newCards = deck.stats.newCards;
	const [showMoreActions, setShowMoreActions] = useState(false);
	const spellingReady = deck.spelling.ready;
	const moreActions: FlashcardMenuItem[] = [
		...(deck.spelling.enabled
			? [
					{
						key: "spelling",
						label: t("home.spelling"),
						icon: Keyboard,
						onSelect: () => onStartSpelling(deck.id),
						disabled: !spellingReady,
						title: spellingReady
							? deck.spelling.ignoredCardCount > 0
								? t("home.spellingModeIgnoredTitle", {
										count: deck.spelling.ignoredCardCount,
									})
								: t("home.spellingModeTitle")
							: t("home.spellingUnavailableTitle", {
									count: deck.spelling.issueCount,
								}),
					},
				]
			: []),
		{
			key: "export",
			label: t("home.exportPdfTitle"),
			icon: isExporting ? LoaderCircle : FileDown,
			iconClassName: isExporting ? "spinning" : undefined,
			onSelect: () => void onExportDeck(deck.id),
			disabled: isExportBusy,
			title: t("home.exportPdfTitle"),
		},
		{
			key: "list",
			label: t("home.list"),
			icon: List,
			onSelect: () => onOpenWordList(deck.id),
		},
		{
			key: "source",
			label: t("home.source"),
			icon: FileText,
			onSelect: () => onOpenSourceFile(deck.filePath),
		},
		{
			key: "settings",
			label: t("home.setting"),
			icon: Settings,
			onSelect: () => onOpenSettings(deck.id),
			disabled: isSettingsLocked,
		},
	];

	return (
		<article
			ref={setNodeRef}
			className={`flashcard-deck-item fc-lift${showMoreActions ? " is-actions-open" : ""}${isDragging ? " is-dragging" : ""}`}
			data-deck-id={deck.id}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
			}}
		>
			<button
				ref={setActivatorNodeRef}
				type="button"
				className="flashcard-deck-drag-handle"
				disabled={isReorderDisabled}
				onClick={(event) => event.stopPropagation()}
				aria-label={t("home.reorderDeck", { deckName: deck.name })}
				title={t("home.reorderDeck", { deckName: deck.name })}
				{...attributes}
				{...listeners}
			>
				<GripVertical size={18} />
			</button>
			<div className="flashcard-deck-main">
				<div className="flashcard-deck-headline">
					<div className="flashcard-deck-name">{deck.name}</div>
					<div className="flashcard-deck-name-wrapper">
						<span className="flashcard-deck-tag">{deck.tag}</span>
						{deck.spelling.enabled && (
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
							<span className="flashcard-deck-stat-value blue">{newCards}</span>/
							<span className="flashcard-deck-stat-value orange">{totalCards}</span>
						</div>
						<div className="flashcard-deck-stat">
							<span className="flashcard-deck-stat-label">
								{t("home.studyCountValue", {
									count: deck.studyCount,
								})}
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className="flashcard-deck-side">
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
					<FlashcardMenu
						items={moreActions}
						triggerTitle={
							showMoreActions ? t("home.hideMoreActions") : t("home.showMoreActions")
						}
						ariaLabel={t("home.moreActions")}
						triggerClassName="flashcard-deck-action-more"
						menuClassName="flashcard-deck-more-actions"
						onOpenChange={setShowMoreActions}
					/>
				</div>
			</div>
		</article>
	);
});

// ── DeckList ─────────────────────────────────────────────────────────────────

interface DeckListProps {
	snapshot: DeckHomeSnapshot;
	home: DeckHome;
	ownerId: string;
	onNavigate: (destination: DeckHomeDestination, deckId: string) => void;
	onRequestMigration: (deckId?: string) => Promise<boolean>;
	onOpenSourceFile: (filePath: string) => void;
	onOpenStats: () => void;
	onOpenSettings: () => void;
	onOpenAddCard: () => void;
}

export const DeckList = React.memo(function DeckList({
	snapshot,
	home,
	ownerId,
	onNavigate,
	onRequestMigration,
	onOpenSourceFile,
	onOpenStats,
	onOpenSettings,
	onOpenAddCard,
}: DeckListProps) {
	const { t } = useI18n();
	const isLoading = snapshot.mutation.kind === "refreshing";
	const isMutationBusy = snapshot.mutation.kind !== "idle";
	const isMigrating =
		snapshot.mutation.kind === "preparing-migration" ||
		snapshot.mutation.kind === "awaiting-confirmation" ||
		snapshot.mutation.kind === "migrating";
	const draft = snapshot.settingsDraft?.ownerId === ownerId ? snapshot.settingsDraft : null;
	const [previewDeckIds, setPreviewDeckIds] = useState<string[] | null>(null);
	const [isOrderSaving, setIsOrderSaving] = useState(false);
	const snapshotDeckIds = snapshot.decks.map((deck) => deck.id);
	const visibleDeckIds = previewDeckIds ?? snapshotDeckIds;
	const visibleDecks = orderDeckSnapshots(snapshot.decks, visibleDeckIds);
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 6 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const persistDeckOrder = useCallback(
		async (deckIds: string[]) => {
			setIsOrderSaving(true);
			try {
				await home.act({ kind: "reorder", deckIds });
			} finally {
				setPreviewDeckIds(null);
				setIsOrderSaving(false);
			}
		},
		[home],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;
			const activeIndex = visibleDeckIds.indexOf(String(active.id));
			const overIndex = visibleDeckIds.indexOf(String(over.id));
			if (activeIndex < 0 || overIndex < 0) return;
			const nextOrder = arrayMove(visibleDeckIds, activeIndex, overIndex);
			setPreviewDeckIds(nextOrder);
			void persistDeckOrder(nextOrder);
		},
		[persistDeckOrder, visibleDeckIds],
	);

	const handleCloseModal = useCallback(() => {
		void home.act({ kind: "cancel-settings", ownerId });
	}, [home, ownerId]);

	const handleExportDeck = useCallback(
		async (deckId: string) => {
			await home.act({ kind: "export", deckId });
		},
		[home],
	);

	const handleOpenDeckSettings = useCallback(
		(deckId: string) => {
			void home.act({ kind: "open-settings", ownerId, deckId });
		},
		[home, ownerId],
	);

	return (
		<>
			<div className="flashcard-home">
				<FlashcardHeader
					icon={BookOpen}
					title={t("home.title")}
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
								icon={ChartNoAxesColumn}
								onClick={onOpenStats}
								title={t("home.statsTitle")}
							/>
							<FlashcardButton
								preset="icon"
								icon={RefreshCcw}
								onClick={() => void home.act({ kind: "refresh" })}
								disabled={isMutationBusy}
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

				{snapshot.migration && (
					<section className="flashcard-identity-migration-card">
						<div className="flashcard-identity-migration-copy">
							<div className="flashcard-identity-migration-icon">
								<Sparkles size={20} />
							</div>
							<div>
								<strong>{t("identity.oneClickMigrationTitle")}</strong>
								<p>
									{t("identity.oneClickMigrationDescription", {
										sources: snapshot.migration.sourceCount,
										cards: snapshot.migration.cardCount,
									})}
								</p>
							</div>
						</div>
						<FlashcardButton
							variant="green"
							icon={Sparkles}
							onClick={() => void onRequestMigration()}
							disabled={isMutationBusy}
						>
							{isMigrating ? t("identity.migrating") : t("identity.migrateAllNow")}
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
						<FlashcardButton variant="green" icon={Plus} onClick={onOpenAddCard}>
							{t("cardEditor.addCardTitle")}
						</FlashcardButton>
					</div>
				) : (
					<div className="flashcard-home-workspace">
						<section className="flashcard-deck-index" aria-label={t("home.deckIndex")}>
							<div className="flashcard-deck-index-heading">
								<span className="flashcard-deck-index-desktop-title">
									{t("home.deckIndex")}
								</span>
								<span className="flashcard-deck-index-mobile-title">
									{t("home.otherDecks")}
								</span>
							</div>
							<DndContext
								sensors={sensors}
								collisionDetection={closestCenter}
								onDragEnd={handleDragEnd}
							>
								<SortableContext
									items={visibleDeckIds}
									strategy={rectSortingStrategy}
								>
									<div className="flashcard-deck-list">
										{visibleDecks.map((deck) => (
											<DeckCard
												key={deck.id}
												deck={deck}
												isReorderDisabled={isOrderSaving}
												onSelectDeck={(deckId) =>
													onNavigate("study", deckId)
												}
												onOpenWordList={(deckId) =>
													onNavigate("word-list", deckId)
												}
												onStartPractice={(deckId) =>
													onNavigate("practice", deckId)
												}
												onStartSpelling={(deckId) =>
													onNavigate("spelling", deckId)
												}
												onExportDeck={handleExportDeck}
												onOpenSourceFile={onOpenSourceFile}
												onOpenSettings={handleOpenDeckSettings}
												isExporting={
													snapshot.export.kind === "exporting" &&
													snapshot.export.deckId === deck.id
												}
												isExportBusy={snapshot.export.kind === "exporting"}
												isSettingsLocked={
													snapshot.settingsDraft !== null &&
													snapshot.settingsDraft.ownerId !== ownerId &&
													(snapshot.settingsDraft.ownerId !== "" ||
														snapshot.settingsDraft.deckId !== deck.id)
												}
											/>
										))}
									</div>
								</SortableContext>
							</DndContext>
						</section>
						<FlashcardButton
							variant="gray"
							className="flashcard-home-add-card"
							icon={Plus}
							onClick={onOpenAddCard}
						>
							{t("cardEditor.addCardTitle")}
						</FlashcardButton>
					</div>
				)}
			</div>

			{draft && (
				<DeckSettingsModal
					draft={draft}
					isSaving={
						snapshot.mutation.kind === "saving-settings" &&
						snapshot.mutation.deckId === draft.deckId
					}
					isMigratingIdentity={
						snapshot.mutation.kind === "preparing-migration" ||
						snapshot.mutation.kind === "awaiting-confirmation" ||
						snapshot.mutation.kind === "migrating"
					}
					onChange={(change) => {
						void home.act({
							kind: "change-settings",
							ownerId,
							change,
						});
					}}
					onSave={async () => {
						await home.act({ kind: "save-settings", ownerId });
					}}
					onOpenSourceFile={() => onOpenSourceFile(draft.filePath)}
					onMigrateIdentity={() => onRequestMigration(draft.deckId)}
					onClose={handleCloseModal}
				/>
			)}
		</>
	);
});

function orderDeckSnapshots(
	decks: readonly DeckHomeDeckSnapshot[],
	deckIds: readonly string[],
): DeckHomeDeckSnapshot[] {
	const decksById = new Map(decks.map((deck) => [deck.id, deck]));
	const orderedDecks = deckIds
		.map((deckId) => decksById.get(deckId))
		.filter((deck): deck is DeckHomeDeckSnapshot => deck !== undefined);
	const seen = new Set(orderedDecks.map((deck) => deck.id));
	return [...orderedDecks, ...decks.filter((deck) => !seen.has(deck.id))];
}
