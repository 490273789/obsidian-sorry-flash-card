import React from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Language } from "../../shared/types";
import type { SelectionHelper } from "../domain/selectionHelper";
import { selectionHelperStrings } from "../strings/selectionPopup";
import { SelectionPopupHost } from "../ui/SelectionPopupHost";

export interface SelectionListenerDeps {
	helper: SelectionHelper;
	getLanguage: () => Language;
}

export class SelectionListener {
	private containerEl: HTMLElement | null = null;
	private root: Root | null = null;
	private unbindListeners: (() => void) | null = null;
	private unsubscribe: (() => void) | null = null;

	constructor(private readonly deps: SelectionListenerDeps) {}

	start(): void {
		if (this.unbindListeners || typeof document === "undefined") return;
		this.unsubscribe = this.deps.helper.subscribe(() => this.renderSnapshot());

		const handleMouseUp = (event: MouseEvent) => {
			this.onMouseUp(event);
		};

		const handleMouseDown = (event: MouseEvent) => {
			if (this.containerEl && !this.containerEl.contains(event.target as Node)) {
				this.deps.helper.dismiss();
			}
		};

		const handleScroll = (event: Event) => {
			if (!this.containerEl) return;
			if (!this.containerEl.contains(event.target as Node)) {
				this.deps.helper.dismiss();
			}
		};

		document.addEventListener("mouseup", handleMouseUp);
		document.addEventListener("mousedown", handleMouseDown, true);
		document.addEventListener("scroll", handleScroll, true);

		this.unbindListeners = () => {
			document.removeEventListener("mouseup", handleMouseUp);
			document.removeEventListener("mousedown", handleMouseDown, true);
			document.removeEventListener("scroll", handleScroll, true);
			this.deps.helper.dismiss();
		};
	}

	stop(): void {
		this.unbindListeners?.();
		this.unbindListeners = null;
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.destroyPopup();
	}

	private onMouseUp(event: MouseEvent): void {
		if (this.containerEl && this.containerEl.contains(event.target as Node)) {
			return;
		}

		const selection = window.getSelection();
		const rawText = selection ? selection.toString() : "";
		const text = rawText.trim();
		const targetEl = event.target as HTMLElement | null;
		this.deps.helper.handleSelection({
			text,
			x: event.clientX,
			y: event.clientY,
			eligibleContext: Boolean(
				targetEl?.closest(
					".workspace-leaf, .markdown-preview-view, .cm-editor, .markdown-source-view",
				),
			),
			altKey: event.altKey,
			shiftKey: event.shiftKey,
			ctrlOrMetaKey: event.ctrlKey || event.metaKey,
		});
	}

	private renderSnapshot(): void {
		if (!this.deps.helper.getSnapshot().visible) {
			this.destroyPopup();
			return;
		}
		if (!this.containerEl) {
			this.containerEl = document.createElement("div");
			this.containerEl.className = "fc-selection-popup-container";
			document.body.appendChild(this.containerEl);
			this.root = createRoot(this.containerEl);
		}

		this.root?.render(
			<SelectionPopupHost
				helper={this.deps.helper}
				strings={selectionHelperStrings(this.deps.getLanguage())}
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
