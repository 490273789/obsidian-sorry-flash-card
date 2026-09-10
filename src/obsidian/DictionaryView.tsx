import React from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import type { DictionaryRuntime } from "../dictionary/dictionaryRuntime";
import { dictionaryStrings } from "../i18n/dictionary";
import type { Language } from "../shared/types";
import { I18nProvider } from "../ui/context/I18nContext";
import { FlashcardButton } from "../ui/primitives/Button";
import { DictionaryView } from "../ui/views/Dictionary";

export const VIEW_TYPE_DICTIONARY = "flashcard-dictionary-view";

interface DictionaryRenderBoundaryProps {
	children: React.ReactNode;
	/** Message shown in place of the view when rendering fails. */
	message: string;
}

interface DictionaryRenderBoundaryState {
	failed: boolean;
}

/**
 * Keeps a render failure inside the dictionary leaf visible. Without a boundary
 * React unmounts the whole root, so the leaf would silently go blank and the
 * only evidence would be a console error.
 */
export class DictionaryRenderBoundary extends React.Component<
	DictionaryRenderBoundaryProps,
	DictionaryRenderBoundaryState
> {
	override state: DictionaryRenderBoundaryState = { failed: false };

	static getDerivedStateFromError(): DictionaryRenderBoundaryState {
		return { failed: true };
	}

	override componentDidCatch(error: unknown): void {
		console.error("Dictionary view failed to render:", error);
	}

	override render(): React.ReactNode {
		if (this.state.failed) {
			return <p className="fc-kicker">{this.props.message}</p>;
		}
		return this.props.children;
	}
}

export class DictionaryItemView extends ItemView {
	private root: Root | null = null;
	private theme: "dark" | "light" = "light";

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
		return VIEW_TYPE_DICTIONARY;
	}

	getDisplayText(): string {
		return dictionaryStrings(this.language()).displayName;
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;

		container.empty();
		container.addClass("flashcard-dictionary-container");
		this.theme = this.app.isDarkMode() ? "dark" : "light";
		this.registerEvent(
			this.app.workspace.on("css-change", () => {
				this.updateTheme(this.app.isDarkMode() ? "dark" : "light");
			}),
		);
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

	private updateTheme(theme: "dark" | "light"): void {
		if (this.theme === theme) return;
		this.theme = theme;
		this.renderApp();
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
					<DictionaryRenderBoundary message={strings.openFailed}>
						<DictionaryView
							controller={this.runtime.controller}
							language={language}
							theme={this.theme}
						/>
					</DictionaryRenderBoundary>
				</I18nProvider>
			</React.StrictMode>,
		);
	}
}
