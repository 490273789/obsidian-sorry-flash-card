import type { Plugin } from "obsidian";
import type { AiService } from "../core/ai";
import type { DataStore } from "../core/storage/dataStore";
import type { WorkbenchFeature, WorkbenchHost } from "../core/host/workbench";
import type { OutboundPort } from "../core/net";
import { createDictionaryFeature, VIEW_TYPE_DICTIONARY } from "./dictionary/feature";
import { createFlashcardFeature } from "./flashcards/feature";
import { createTranslationFeature, VIEW_TYPE_TRANSLATOR } from "./translation/feature";
import { createSelectionPopupFeature } from "./selectionPopup/feature";
import { detectTranslationDirection } from "./selectionPopup/domain/languageDetector";

export interface WorkbenchFeatureDeps {
	ai: AiService;
	dataStore: DataStore;
	plugin: Plugin;
	net: OutboundPort;
}

/**
 * The single composition module for the workbench: it lists every feature and
 * explicitly hands each one the shared services it needs. The composition root
 * imports only this module, so it never has to know a feature's name.
 */
export function createWorkbenchFeatures(deps: WorkbenchFeatureDeps): WorkbenchFeature[] {
	const flashcards = createFlashcardFeature({ dataStore: deps.dataStore, net: deps.net });
	const translation = createTranslationFeature({ ai: deps.ai, net: deps.net });
	const dictionary = createDictionaryFeature({ ai: deps.ai, net: deps.net, plugin: deps.plugin });

	let activeHost: WorkbenchHost | null = null;

	const selectionPopup = createSelectionPopupFeature({
		plugin: deps.plugin,
		getDictionaryController: () => dictionary.runtime()?.controller ?? null,
		openDictionaryInMainTab: async (word: string) => {
			if (!activeHost) return;
			const dictRuntime = dictionary.runtime();
			if (!dictRuntime) return;
			dictRuntime.controller.prefill(word);
			await activeHost.activateView(VIEW_TYPE_DICTIONARY, { mainTab: true });
			void dictRuntime.controller.lookup();
		},
		translateInMainTab: async (text: string) => {
			if (!activeHost) return;
			const transRuntime = translation.runtime();
			if (!transRuntime) return;
			const direction = detectTranslationDirection(text);
			const currentDir = transRuntime.getSnapshot().settings.direction;
			if (currentDir !== direction) {
				await transRuntime.configure({
					...transRuntime.getSnapshot().settings,
					direction,
				});
			}
			transRuntime.prefill(text);
			await activeHost.activateView(VIEW_TYPE_TRANSLATOR, { mainTab: true });
			void transRuntime.translate();
		},
	});

	return [
		flashcards,
		translation,
		dictionary,
		{
			id: selectionPopup.id,
			render: (host) => {
				activeHost = host;
				selectionPopup.render(host);
			},
			stop: () => {
				activeHost = null;
				selectionPopup.stop();
			},
		},
	];
}
