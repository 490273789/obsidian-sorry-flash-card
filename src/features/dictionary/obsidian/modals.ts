import { App, Modal, Setting } from "obsidian";
import { normalizeDictionaryQuery } from "../domain/configuration";
import type { DictionaryStrings } from "../strings/dictionary";

/**
 * Prompt modal used by the dictionary commands (open with a word, look up the
 * current selection). The input mirrors the view's 128-character query limit and
 * rejects an empty query after normalization.
 */
export class DictionaryLookupModal extends Modal {
	private input: HTMLInputElement | null = null;
	private settled = false;

	constructor(
		app: App,
		private readonly onSubmit: (query: string) => void,
		private readonly strings: DictionaryStrings,
		private readonly initialValue = "",
	) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle(this.strings.openPromptTitle);
		let value = this.initialValue;

		new Setting(this.contentEl).setName(this.strings.inputLabel).addText((text) => {
			this.input = text.inputEl;
			text.setPlaceholder(this.strings.inputPlaceholder).setValue(this.initialValue);
			text.inputEl.type = "text";
			text.inputEl.autocomplete = "off";
			text.inputEl.spellcheck = false;
			text.inputEl.maxLength = 128;
			text.inputEl.setAttribute("aria-label", this.strings.inputLabel);
			text.onChange((next) => {
				value = next;
			});
			// Enter submits explicitly. No `<form>` is involved, and an Enter that
			// only confirms an IME candidate must not submit.
			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key !== "Enter" || event.isComposing) return;
				event.preventDefault();
				this.submit(value);
			});
		});

		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(this.strings.cancel).onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText(this.strings.query)
					.setCta()
					.onClick(() => this.submit(value)),
			);

		requestAnimationFrame(() => {
			this.input?.focus();
			this.input?.select();
		});
	}

	override onClose(): void {
		this.contentEl.empty();
		this.input = null;
	}

	private submit(value: string): void {
		if (this.settled) return;
		const query = normalizeDictionaryQuery(value);
		if (!query) return;
		this.settled = true;
		// Open the view before closing so Obsidian's focus restoration on close
		// cannot race the leaf activation; the modal always closes afterwards.
		try {
			this.onSubmit(query);
		} finally {
			this.close();
		}
	}
}

/** Confirmation modal for deleting the in-plugin copy of a local dictionary. */
export class LocalDictionaryDeleteModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly dictionaryName: string,
		private readonly strings: DictionaryStrings,
		private readonly resolve: (confirmed: boolean) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.classList.add("mod-warning");
		this.setTitle(this.strings.localDelete);
		this.contentEl.createEl("p", {
			text: this.strings.localDeleteConfirm(this.dictionaryName),
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText(this.strings.localDeleteCancel)
					.onClick(() => this.finish(false)),
			)
			.addButton((button) =>
				button
					.setWarning()
					.setButtonText(this.strings.localDeleteAction)
					.onClick(() => this.finish(true)),
			);
	}

	override onClose(): void {
		this.contentEl.empty();
		if (!this.settled) this.resolve(false);
	}

	private finish(confirmed: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve(confirmed);
		this.close();
	}
}

/** Resolves `true` when the user confirms deleting the named local dictionary. */
export function confirmLocalDictionaryDeletion(
	app: App,
	strings: DictionaryStrings,
	dictionaryName: string,
): Promise<boolean> {
	return new Promise((resolve) => {
		new LocalDictionaryDeleteModal(app, dictionaryName, strings, resolve).open();
	});
}
