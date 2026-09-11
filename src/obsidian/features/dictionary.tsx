import React from "react";
import { Notice, requestUrl, type Plugin } from "obsidian";
import type { AiService } from "../../ai";
import { normalizeDictionarySettings } from "../../dictionary/configuration";
import { DictionaryRuntime } from "../../dictionary/dictionaryRuntime";
import { dictionaryStrings } from "../../i18n/dictionary";
import type { Language } from "../../shared/types";
import { FlashcardButton } from "../../ui/primitives/Button";
import { DictionaryFavoriteView, DictionaryView } from "../../ui/views/Dictionary";
import { DictionaryLookupModal } from "../dictionaryModals";
import { DictionarySettingsEditor } from "../dictionarySettingsEditor";
import { createDictionarySettingsStore } from "../dictionarySettingsStore";
import { createReactItemView } from "../reactItemView";
import type { WorkbenchFeature, WorkbenchHost, WorkbenchSettingsSection } from "../workbench";

const OPEN_COMMAND_ID = "open-dictionary";
const LOOKUP_SELECTION_COMMAND_ID = "dictionary-lookup-selection";

/** Settings section id this feature contributes. */
export const DICTIONARY_SECTION_ID = "dictionary";

/** Obsidian view types of the dictionary lookup view and the favorites sidebar. */
export const VIEW_TYPE_DICTIONARY = "flashcard-dictionary-view";
export const VIEW_TYPE_DICTIONARY_FAVORITE = "flashcard-dictionary-favorite-view";

export interface DictionaryFeatureDeps {
	ai: AiService;
	plugin: Plugin;
}

/**
 * The 词典 workbench feature: dictionary lookup, the favorites sidebar, and the
 * dictionary settings section. Owns its runtime, its views, its chrome, and its
 * persisted settings slice.
 */
export function createDictionaryFeature(deps: DictionaryFeatureDeps): WorkbenchFeature {
	let runtime: DictionaryRuntime | null = null;
	let editor: DictionarySettingsEditor | null = null;
	let modal: DictionaryLookupModal | null = null;

	const openSettings = (host: WorkbenchHost): void => {
		host.settingsTab.open(DICTIONARY_SECTION_ID);
	};

	/** A view only resets its session once the last leaf of that type is gone. */
	const resetWhenClosed = (host: WorkbenchHost, viewType: string, reset: () => void): void => {
		queueMicrotask(() => {
			if (host.app.workspace.getLeavesOfType(viewType).length === 0) reset();
		});
	};

	const ensureRuntime = (host: WorkbenchHost): DictionaryRuntime => {
		if (runtime) return runtime;
		runtime = new DictionaryRuntime({
			app: host.app,
			plugin: deps.plugin,
			settings: createDictionarySettingsStore({
				readDictionarySettings: () => host.settings().dictionary,
				commitDictionarySettings: async (dictionary) => {
					await host.updateSettings({
						dictionary: normalizeDictionarySettings(dictionary),
					});
				},
			}),
			ai: deps.ai,
			language: () => host.settings().language,
			request: async (request) => requestUrl({ ...request, throw: false }),
			openSettings: () => openSettings(host),
			openFavoriteView: async (word) => {
				await runtime?.favoriteController.prefill(word);
				await host.activateView(VIEW_TYPE_DICTIONARY_FAVORITE, { rightSidebar: true });
			},
			notify: (message) => new Notice(message),
		});
		return runtime;
	};

	/** The open command and ribbon prompt for a word first, matching the source tool. */
	const openPrompt = (host: WorkbenchHost): void => {
		modal?.close();
		modal = new DictionaryLookupModal(
			host.app,
			(query) => {
				modal = null;
				void openQuery(host, query);
			},
			dictionaryStrings(host.settings().language),
		);
		modal.open();
	};

	const openQuery = async (host: WorkbenchHost, query: string): Promise<void> => {
		const strings = dictionaryStrings(host.settings().language);
		try {
			const dictionary = ensureRuntime(host);
			dictionary.controller.prefill(query);
			await host.activateView(VIEW_TYPE_DICTIONARY);
			await dictionary.controller.lookup();
		} catch (error) {
			console.error("Failed to open the dictionary view:", error);
			new Notice(strings.openFailed);
		}
	};

	/**
	 * The 词典 feature keeps both views registered while disabled: the previous
	 * adapters rendered this placeholder instead of the lookup UI.
	 */
	const renderDictionaryBody = (
		host: WorkbenchHost,
		language: Language,
		body: () => React.ReactNode,
	): React.ReactNode => {
		if (host.settings().dictionary.enabled) return body();
		const strings = dictionaryStrings(language);
		return (
			<div className="flashcard-dictionary-disabled">
				<p className="fc-kicker">{strings.disabled}</p>
				<FlashcardButton variant="primary" onClick={() => openSettings(host)}>
					{strings.openSettings}
				</FlashcardButton>
			</div>
		);
	};

	const section = (
		host: WorkbenchHost,
		dictionary: DictionaryRuntime,
	): WorkbenchSettingsSection => {
		editor ??= new DictionarySettingsEditor(
			dictionary,
			deps.ai,
			() => host.settings().language,
			() => host.settingsTab.refresh(),
		);
		const settingsEditor = editor;
		return {
			id: DICTIONARY_SECTION_ID,
			order: 3,
			label: (language) => dictionaryStrings(language).settingsHeading,
			definitions: () => [settingsEditor.definitions()],
			activate: () => settingsEditor.activate(),
			hide: () => settingsEditor.hide(),
		};
	};

	return {
		id: "dictionary",

		render: (host) => {
			const dictionary = ensureRuntime(host);

			host.registerView(
				VIEW_TYPE_DICTIONARY,
				createReactItemView({
					type: VIEW_TYPE_DICTIONARY,
					icon: "book-open",
					title: (language) => dictionaryStrings(language).displayName,
					containerClass: "flashcard-dictionary-container",
					rootClass: "flashcard-dictionary-root",
					// The sandbox document follows Obsidian's theme independently of CSS.
					trackTheme: true,
					readSettings: () => host.settings(),
					renderErrorMessage: (language) => dictionaryStrings(language).openFailed,
					onClose: () =>
						resetWhenClosed(host, VIEW_TYPE_DICTIONARY, () =>
							dictionary.controller.resetSession(),
						),
					render: ({ language, theme }) =>
						renderDictionaryBody(host, language, () => (
							<DictionaryView
								controller={dictionary.controller}
								language={language}
								theme={theme}
							/>
						)),
				}),
			);
			host.registerView(
				VIEW_TYPE_DICTIONARY_FAVORITE,
				createReactItemView({
					type: VIEW_TYPE_DICTIONARY_FAVORITE,
					icon: "bookmark",
					title: (language) => dictionaryStrings(language).favoriteSidebarTitle,
					containerClass: "flashcard-dictionary-container",
					rootClass: "flashcard-dictionary-root",
					readSettings: () => host.settings(),
					renderErrorMessage: (language) =>
						dictionaryStrings(language).favoriteRenderFailed,
					onClose: () =>
						resetWhenClosed(host, VIEW_TYPE_DICTIONARY_FAVORITE, () =>
							dictionary.favoriteController.resetSession(),
						),
					render: ({ language }) =>
						renderDictionaryBody(host, language, () => (
							<DictionaryFavoriteView
								controller={dictionary.favoriteController}
								language={language}
							/>
						)),
				}),
			);

			dictionary.applySettings();

			const strings = dictionaryStrings(host.settings().language);
			host.chrome((chrome) => {
				if (!host.settings().dictionary.enabled) return;
				chrome.ribbon("book-open", strings.openCommand, () => openPrompt(host));
				chrome.command({
					id: OPEN_COMMAND_ID,
					name: strings.openCommand,
					hotkeys: [{ modifiers: ["Alt"], key: "W" }],
					run: () => openPrompt(host),
				});
				chrome.command({
					id: LOOKUP_SELECTION_COMMAND_ID,
					name: strings.selectionCommand,
					selection: { run: (selection) => void openQuery(host, selection) },
				});
			});

			host.settingsSection(section(host, dictionary));
		},

		stop: () => {
			modal?.close();
			modal = null;
			runtime?.dispose();
			runtime = null;
		},
	};
}
