import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import { FlashcardApp } from "../ui/components/FlashcardApp";
import { FlashcardSettings } from "../shared/types";
import { translate } from "../i18n";
import type { CardIdentityContinuity } from "../identity/cardIdentityContinuity";
import type { SessionLifecycle } from "../sessions/sessionLifecycle";
import type { PronunciationRuntime } from "../pronunciation";
import type { DeckHome } from "../decks/deckHome";

export const VIEW_TYPE_FLASHCARD = "flashcard-view";

export class FlashcardView extends ItemView {
	private root: Root | null = null;
	private cardIdentityContinuity: CardIdentityContinuity;
	private sessionLifecycle: SessionLifecycle;
	private pronunciationRuntime: PronunciationRuntime;
	private deckHome: DeckHome;
	private modalHost: HTMLElement | null = null;
	private settings: FlashcardSettings;
	private onOpenSettings: () => void;

	constructor(
		leaf: WorkspaceLeaf,
		cardIdentityContinuity: CardIdentityContinuity,
		sessionLifecycle: SessionLifecycle,
		pronunciationRuntime: PronunciationRuntime,
		deckHome: DeckHome,
		settings: FlashcardSettings,
		onOpenSettings: () => void,
	) {
		super(leaf);
		this.cardIdentityContinuity = cardIdentityContinuity;
		this.sessionLifecycle = sessionLifecycle;
		this.pronunciationRuntime = pronunciationRuntime;
		this.deckHome = deckHome;
		this.settings = settings;
		this.onOpenSettings = onOpenSettings;
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

		// Create React root first so the cached home snapshot paints immediately;
		// the vault scan runs in the background and the UI already renders a
		// "refreshing" state while it is in flight.
		const rootEl = container.createDiv({ cls: "flashcard-root" });
		this.modalHost = rootEl;
		this.root = createRoot(rootEl);

		this.renderApp();
		void this.deckHome.act({ kind: "refresh" });
	}

	private renderApp(): void {
		if (!this.root || !this.modalHost) return;

		this.root.render(
			<React.StrictMode>
				<FlashcardApp
					app={this.app}
					modalHost={this.modalHost}
					cardIdentityContinuity={this.cardIdentityContinuity}
					sessionLifecycle={this.sessionLifecycle}
					pronunciationRuntime={this.pronunciationRuntime}
					deckHome={this.deckHome}
					settings={this.settings}
					onOpenSettings={this.onOpenSettings}
				/>
			</React.StrictMode>,
		);
	}

	async onClose(): Promise<void> {
		this.pronunciationRuntime.stop();
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.modalHost = null;
	}

	updateSettings(settings: FlashcardSettings): void {
		this.settings = settings;
		this.renderApp();
	}

	async refresh(): Promise<void> {
		await this.deckHome.act({ kind: "refresh" });
	}
}
