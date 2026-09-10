import React from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import type { DictionaryRuntime } from "../dictionary/dictionaryRuntime";
import { dictionaryStrings } from "../i18n/dictionary";
import type { Language } from "../shared/types";
import { I18nProvider } from "../ui/context/I18nContext";
import { FlashcardButton } from "../ui/primitives/Button";
import { DictionaryFavoriteView } from "../ui/views/Dictionary";
import { DictionaryRenderBoundary } from "./DictionaryView";

export const VIEW_TYPE_DICTIONARY_FAVORITE = "flashcard-dictionary-favorite-view";

export class DictionaryFavoriteItemView extends ItemView {
	private root: Root | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly runtime: DictionaryRuntime,
		private readonly language: () => Language,
		private readonly isEnabled: () => boolean,
		private readonly onOpenSettings: () => void,
		private readonly onClosed: () => void,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_DICTIONARY_FAVORITE;
	}

	getDisplayText(): string {
		return dictionaryStrings(this.language()).favoriteSidebarTitle;
	}

	getIcon(): string {
		return "bookmark";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;

		container.empty();
		container.addClass("flashcard-dictionary-container");
		const rootEl = container.createDiv({ cls: "flashcard-root flashcard-dictionary-root" });
		this.root = createRoot(rootEl);
		this.renderApp();
	}

	updateSettings(): void {
		this.renderApp();
	}

	async onClose(): Promise<void> {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.onClosed();
	}

	private renderApp(): void {
		const language = this.language();
		const strings = dictionaryStrings(language);
		const root = this.root;
		if (!root) return;
		if (!this.isEnabled()) {
			root.render(
				<React.StrictMode>
					<I18nProvider language={language}>
						<div className="flashcard-dictionary-disabled">
							<p className="fc-kicker">{strings.disabled}</p>
							<FlashcardButton variant="primary" onClick={this.onOpenSettings}>
								{strings.openSettings}
							</FlashcardButton>
						</div>
					</I18nProvider>
				</React.StrictMode>,
			);
			return;
		}
		root.render(
			<React.StrictMode>
				<I18nProvider language={language}>
					<DictionaryRenderBoundary message={strings.favoriteRenderFailed}>
						<DictionaryFavoriteView
							controller={this.runtime.favoriteController}
							language={language}
						/>
					</DictionaryRenderBoundary>
				</I18nProvider>
			</React.StrictMode>,
		);
	}
}
