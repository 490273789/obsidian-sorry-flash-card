import type { Plugin } from "obsidian";
import type { AiService } from "../../ai";
import type { DataStore } from "../../storage/dataStore";
import type { WorkbenchFeature } from "../workbench";
import { createDictionaryFeature } from "./dictionary";
import { createFlashcardFeature } from "./flashcards";
import { createTranslationFeature } from "./translation";

export interface WorkbenchFeatureDeps {
	ai: AiService;
	dataStore: DataStore;
	plugin: Plugin;
}

/**
 * The single composition module for the workbench: it lists every feature and
 * explicitly hands each one the shared services it needs. The composition root
 * imports only this module, so it never has to know a feature's name.
 */
export function createWorkbenchFeatures(deps: WorkbenchFeatureDeps): WorkbenchFeature[] {
	return [
		createFlashcardFeature({ dataStore: deps.dataStore }),
		createTranslationFeature({ ai: deps.ai }),
		createDictionaryFeature({ ai: deps.ai, plugin: deps.plugin }),
	];
}
