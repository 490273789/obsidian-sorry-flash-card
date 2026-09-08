import React, { memo, useCallback, useState } from "react";
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
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
	DeckHomeSnapshot,
} from "../../../decks/deckHome";
import { FlashcardButton } from "../../primitives/Button";
import { FlashcardMenu, type FlashcardMenuItem } from "../../primitives/Menu";
import { FlashcardHeader } from "../../primitives/Header";
import { DeckSettingsModal } from "../DeckSettings";
import { useI18n } from "../../context/I18nContext";

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
	const setDragNodeRef = useCallback(
		(node: HTMLElement | null) => {
			setNodeRef(node);
			setActivatorNodeRef(node);
		},
		[setNodeRef, setActivatorNodeRef],
	);
	const totalCards = deck.stats.totalCards;
	const newCards = deck.stats.newCards;
	const [showMoreActions, setShowMoreActions] = useState(false);
	const spellingReady = deck.spelling.ready;
	const moreActions: FlashcardMenuItem[] = [
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
			ref={setDragNodeRef}
			className={`flashcard-deck-item fc-lift${showMoreActions ? " is-actions-open" : ""}${isDragging ? " is-dragging" : ""}`}
			data-deck-id={deck.id}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			aria-label={t("home.reorderDeck", { deckName: deck.name })}
			{...attributes}
			{...listeners}
		>
			<div className="flashcard-deck-main">
				<div className="flashcard-deck-headline">
					<div className="flashcard-deck-name-wrapper">
						<span className="flashcard-deck-name">{deck.name}</span>
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

			<div
				className="flashcard-deck-side"
				role="presentation"
				onMouseDown={(event) => event.stopPropagation()}
				onTouchStart={(event) => event.stopPropagation()}
			>
				<div
					className={`flashcard-deck-actions2${
						deck.spelling.enabled ? " has-spelling" : ""
					}`}
				>
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
					{deck.spelling.enabled && (
						<FlashcardButton
							variant="purple"
							className="flashcard-deck-action-spelling"
							icon={Keyboard}
							onClick={(event) => {
								event.stopPropagation();
								onStartSpelling(deck.id);
							}}
							disabled={!spellingReady}
							title={
								spellingReady
									? deck.spelling.ignoredCardCount > 0
										? t("home.spellingModeIgnoredTitle", {
												count: deck.spelling.ignoredCardCount,
											})
										: t("home.spellingModeTitle")
									: t("home.spellingUnavailableTitle", {
											count: deck.spelling.issueCount,
										})
							}
						>
							<span>{t("home.spelling")}</span>
						</FlashcardButton>
					)}
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
		useSensor(MouseSensor, {
			activationConstraint: { distance: 6 },
		}),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 1000, tolerance: 5 },
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
