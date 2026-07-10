import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import { FlashcardApp } from "../ui/components/FlashcardApp";
import { DataStore } from "../storage/dataStore";
import { FlashcardSettings } from "../shared/types";
import { translate } from "../i18n";
import type { CardIdentityContinuity } from "../identity/cardIdentityContinuity";
import type { ActiveSessionStore } from "../sessions/activeSessionStore";

export const VIEW_TYPE_FLASHCARD = "flashcard-view";

export class FlashcardView extends ItemView {
	private root: Root | null = null;
	private dataStore: DataStore;
	private cardIdentityContinuity: CardIdentityContinuity;
	private activeSessionStore: ActiveSessionStore;
	private settings: FlashcardSettings;
	private onSaveSettings: (settings: FlashcardSettings) => Promise<void>;

	constructor(
		leaf: WorkspaceLeaf,
		dataStore: DataStore,
		cardIdentityContinuity: CardIdentityContinuity,
		activeSessionStore: ActiveSessionStore,
		settings: FlashcardSettings,
		onSaveSettings: (settings: FlashcardSettings) => Promise<void>,
	) {
		super(leaf);
		this.dataStore = dataStore;
		this.cardIdentityContinuity = cardIdentityContinuity;
		this.activeSessionStore = activeSessionStore;
		this.settings = settings;
		this.onSaveSettings = onSaveSettings;
	}

	getViewType(): string {
		return VIEW_TYPE_FLASHCARD;
	}

	getDisplayText(): string {
		return translate(this.settings.language, "main.viewTitle");
	}

	getIcon(): string {
		return "layers";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;

		container.empty();
		container.addClass("flashcard-container");

		// Single vault scan: syncs decks and caches available tags
		await this.cardIdentityContinuity.synchronize();

		// Create React root
		const rootEl = container.createDiv({ cls: "flashcard-root" });
		this.root = createRoot(rootEl);

		this.renderApp();
	}

	private renderApp(): void {
		if (!this.root) return;

		this.root.render(
			<React.StrictMode>
				<FlashcardApp
					app={this.app}
					dataStore={this.dataStore}
					cardIdentityContinuity={this.cardIdentityContinuity}
					activeSessionStore={this.activeSessionStore}
					settings={this.settings}
					onSaveSettings={this.handleSaveSettings}
					onRefresh={this.handleRefresh}
				/>
			</React.StrictMode>,
		);
	}

	private handleSaveSettings = async (newSettings: FlashcardSettings): Promise<void> => {
		this.settings = newSettings;
		await this.onSaveSettings(newSettings);
		this.dataStore.updateSettings(newSettings);
		this.renderApp();
	};

	private handleRefresh = async (): Promise<void> => {
		await this.cardIdentityContinuity.synchronize();
		this.renderApp();
	};

	async onClose(): Promise<void> {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}

	updateSettings(settings: FlashcardSettings): void {
		this.settings = settings;
		this.renderApp();
	}

	async refresh(): Promise<void> {
		await this.handleRefresh();
	}
}
