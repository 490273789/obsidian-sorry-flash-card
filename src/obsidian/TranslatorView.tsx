import React from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import type { Language } from "../shared/types";
import type { TranslationRuntime } from "../translation/translationRuntime";
import { I18nProvider } from "../ui/context/I18nContext";
import { TranslatorView } from "../ui/views/Translator";
import { translationStrings } from "../i18n/translation";

export const VIEW_TYPE_TRANSLATOR = "flashcard-translator-view";

export class TranslatorItemView extends ItemView {
	private root: Root | null = null;
	private detachRuntime: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly runtime: TranslationRuntime,
		private readonly language: () => Language,
		private readonly onOpenSettings: () => void,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TRANSLATOR;
	}

	getDisplayText(): string {
		return translationStrings(this.language()).title;
	}

	getIcon(): string {
		return "languages";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;

		container.empty();
		container.addClass("flashcard-translator-container");
		const rootEl = container.createDiv({ cls: "flashcard-root flashcard-translator-root" });
		this.root = createRoot(rootEl);
		this.detachRuntime = this.runtime.attachView();
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
		this.detachRuntime?.();
		this.detachRuntime = null;
	}

	private renderApp(): void {
		if (!this.root) return;
		const language = this.language();
		this.root.render(
			<React.StrictMode>
				<I18nProvider language={language}>
					<TranslatorView
						runtime={this.runtime}
						language={language}
						onOpenSettings={this.onOpenSettings}
					/>
				</I18nProvider>
			</React.StrictMode>,
		);
	}
}
