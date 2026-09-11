import type { Plugin } from "obsidian";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DictionaryController } from "../../dictionary/domain/controller";
import { isEnglishWordOrPhrase } from "../domain/selectionClassifier";
import type { SelectionPopupSettings, SelectionTarget } from "../domain/types";
import { selectionPopupStrings } from "../strings/selectionPopup";
import { SelectionPopupHost } from "../ui/SelectionPopupHost";
import type { Language } from "../../../core/shared/types";

export interface SelectionListenerDeps {
	plugin: Plugin;
	getSettings: () => SelectionPopupSettings;
	getLanguage: () => Language;
	getDictionaryController: () => DictionaryController | null;
	isDictionaryAvailable: () => boolean;
	isTranslationAvailable: () => boolean;
	onLookupStart: (word: string) => void;
	onTranslate: (text: string) => void;
	onOpenDictionaryInMainTab: (word: string) => void;
}

export class SelectionListener {
	private containerEl: HTMLElement | null = null;
	private root: Root | null = null;
	private unbindListeners: (() => void) | null = null;

	constructor(private readonly deps: SelectionListenerDeps) {}

	start(): void {
		if (this.unbindListeners || typeof document === "undefined") return;

		const handleMouseUp = (event: MouseEvent) => {
			this.onMouseUp(event);
		};

		const handleMouseDown = (event: MouseEvent) => {
			if (this.containerEl && !this.containerEl.contains(event.target as Node)) {
				this.destroyPopup();
			}
		};

		const handleScroll = (event: Event) => {
			if (this.containerEl && !this.containerEl.contains(event.target as Node)) {
				this.destroyPopup();
			}
		};

		document.addEventListener("mouseup", handleMouseUp);
		document.addEventListener("mousedown", handleMouseDown, true);
		document.addEventListener("scroll", handleScroll, true);

		this.unbindListeners = () => {
			document.removeEventListener("mouseup", handleMouseUp);
			document.removeEventListener("mousedown", handleMouseDown, true);
			document.removeEventListener("scroll", handleScroll, true);
			this.destroyPopup();
		};
	}

	stop(): void {
		this.unbindListeners?.();
		this.unbindListeners = null;
	}

	private onMouseUp(event: MouseEvent): void {
		const settings = this.deps.getSettings();
		if (!settings.enabled) return;

		if (settings.modifier === "alt" && !event.altKey) return;
		if (settings.modifier === "shift" && !event.shiftKey) return;
		if (settings.modifier === "ctrl" && !(event.ctrlKey || event.metaKey)) return;

		if (this.containerEl && this.containerEl.contains(event.target as Node)) {
			return;
		}

		const selection = window.getSelection();
		const rawText = selection ? selection.toString() : "";
		const text = rawText.trim();
		if (!text) {
			this.destroyPopup();
			return;
		}

		const targetEl = event.target as HTMLElement | null;
		if (
			!targetEl?.closest(
				".workspace-leaf, .markdown-preview-view, .cm-editor, .markdown-source-view",
			)
		) {
			return;
		}

		const dictAvailable = this.deps.isDictionaryAvailable();
		const transAvailable = this.deps.isTranslationAvailable();
		if (!dictAvailable && !transAvailable) {
			return;
		}

		const isWord = dictAvailable && isEnglishWordOrPhrase(text);
		if (!isWord && !transAvailable) {
			return;
		}

		const target: SelectionTarget = {
			text,
			isEnglishWord: isWord,
			x: event.clientX,
			y: event.clientY,
		};

		this.renderPopup(target);
	}

	private renderPopup(target: SelectionTarget): void {
		if (!this.containerEl) {
			this.containerEl = document.createElement("div");
			this.containerEl.className = "fc-selection-popup-container";
			document.body.appendChild(this.containerEl);
			this.root = createRoot(this.containerEl);
		}

		const strings = selectionPopupStrings(this.deps.getLanguage());
		const controller = this.deps.getDictionaryController();

		this.root?.render(
			<SelectionPopupHost
				target={target}
				strings={strings}
				dictionaryController={controller}
				onLookupStart={(word) => this.deps.onLookupStart(word)}
				onTranslate={(text) => {
					this.destroyPopup();
					this.deps.onTranslate(text);
				}}
				onOpenDictionaryInMainTab={(word) => {
					this.destroyPopup();
					this.deps.onOpenDictionaryInMainTab(word);
				}}
				onClose={() => this.destroyPopup()}
			/>,
		);
	}

	private destroyPopup(): void {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		if (this.containerEl) {
			this.containerEl.remove();
			this.containerEl = null;
		}
	}
}
