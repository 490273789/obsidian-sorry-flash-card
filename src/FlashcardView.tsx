import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import { FlashcardApp } from "./components/FlashcardApp";
import { DataStore } from "./dataStore";
import { FlashcardSettings } from "./types";

export const VIEW_TYPE_FLASHCARD = "flashcard-view";

export class FlashcardView extends ItemView {
	private root: Root | null = null;
	private dataStore: DataStore;
	private settings: FlashcardSettings;
	private onSaveSettings: (settings: FlashcardSettings) => Promise<void>;
	private availableTags: string[] = [];

	constructor(
		leaf: WorkspaceLeaf,
		dataStore: DataStore,
		settings: FlashcardSettings,
		onSaveSettings: (settings: FlashcardSettings) => Promise<void>,
	) {
		super(leaf);
		this.dataStore = dataStore;
		this.settings = settings;
		this.onSaveSettings = onSaveSettings;
	}

	getViewType(): string {
		return VIEW_TYPE_FLASHCARD;
	}

	getDisplayText(): string {
		return "闪卡学习";
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
		await this.dataStore.syncFromVault();
		this.availableTags = this.dataStore.getAvailableTags();

		// Create React root
		const rootEl = container.createDiv({ cls: "flashcard-root" });
		this.root = createRoot(rootEl);

		this.renderApp();

		// Show welcome message if enabled
		if (this.settings.showWelcomeMessage && this.settings.welcomeMessage) {
			this.showWelcomePopup();
		}
	}

	private renderApp(): void {
		if (!this.root) return;

		this.root.render(
			<React.StrictMode>
				<FlashcardApp
					app={this.app}
					dataStore={this.dataStore}
					settings={this.settings}
					onSaveSettings={this.handleSaveSettings}
					onRefresh={this.handleRefresh}
					availableTags={this.availableTags}
				/>
			</React.StrictMode>,
		);
	}

	private handleSaveSettings = async (
		newSettings: FlashcardSettings,
	): Promise<void> => {
		this.settings = newSettings;
		await this.onSaveSettings(newSettings);
		this.dataStore.updateSettings(newSettings);
		this.renderApp();
	};

	private handleRefresh = async (): Promise<void> => {
		await this.dataStore.syncFromVault();
		this.availableTags = this.dataStore.getAvailableTags();
		this.renderApp();
	};

	private showWelcomePopup(): void {
		const container = this.containerEl.children[1];
		if (!container) return;

		// Create popup element
		const popup = container.createDiv({ cls: "flashcard-welcome-popup" });
		popup.setText(this.settings.welcomeMessage);

		// Auto-hide after 3 seconds
		window.setTimeout(() => {
			popup.addClass("flashcard-welcome-popup-hide");
			window.setTimeout(() => {
				popup.remove();
			}, 300); // Wait for fade-out animation
		}, 3000);
	}

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
}
