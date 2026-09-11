import type { Plugin } from "obsidian";
import type { AiService } from "../core/ai";
import type { DataStore } from "../core/storage/dataStore";
import type { WorkbenchFeature } from "../core/host/workbench";
import type { OutboundPort } from "../core/net";
import { createDictionaryFeature } from "./dictionary/feature";
import { createFlashcardFeature } from "./flashcards/feature";
import { createTranslationFeature } from "./translation/feature";

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
	return [
		createFlashcardFeature({ dataStore: deps.dataStore, net: deps.net }),
		createTranslationFeature({ ai: deps.ai, net: deps.net }),
		createDictionaryFeature({ ai: deps.ai, net: deps.net, plugin: deps.plugin }),
	];
}
