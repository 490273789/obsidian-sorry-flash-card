import type {
	SelectionDictionaryAdapter,
	SelectionLookupSection,
	SelectionLookupSession,
	SelectionLookupSnapshot,
} from "../../core/selectionHelper/domain/types";
import type { DictionarySettings, DictionaryViewState } from "./domain/types";

export interface DictionarySelectionController {
	getSnapshot(): DictionaryViewState;
	subscribe(listener: () => void): () => void;
	selectSource(sourceId: string): void;
	retry(sourceId: string): Promise<void>;
	loadAi(): Promise<void>;
	dispose(): void;
}

export interface DictionarySelectionRuntime {
	readonly settings: { getDictionarySettings(): Readonly<DictionarySettings> };
	createSelectionLookupSession(
		query: string,
		sourceIds: readonly string[],
	): DictionarySelectionController | null;
}

export interface DictionarySelectionAdapterOptions {
	runtime(): DictionarySelectionRuntime | null;
	openInMainTab(query: string): Promise<void>;
}

/** Adapts the 词典 feature to the narrow 选区助手 seam. */
export function createDictionarySelectionAdapter(
	options: DictionarySelectionAdapterOptions,
): SelectionDictionaryAdapter {
	return {
		sources: () => {
			const settings = options.runtime()?.settings.getDictionarySettings();
			return (settings?.sources ?? [])
				.filter((source) => source.enabled)
				.map((source) => ({
					id: source.id,
					label: source.label,
					kind: source.kind === "ai" ? ("ai" as const) : ("dictionary" as const),
				}));
		},

		startLookup: (query, sourceIds) => {
			const controller = options.runtime()?.createSelectionLookupSession(query, sourceIds);
			return controller ? new DictionarySelectionLookupSession(controller) : null;
		},

		openInMainTab: (query) => options.openInMainTab(query),
	};
}

class DictionarySelectionLookupSession implements SelectionLookupSession {
	constructor(private readonly controller: DictionarySelectionController) {}

	getSnapshot(): SelectionLookupSnapshot {
		return toSelectionSnapshot(this.controller.getSnapshot());
	}

	subscribe(listener: () => void): () => void {
		return this.controller.subscribe(listener);
	}

	selectSource(sourceId: string): void {
		this.controller.selectSource(sourceId);
	}

	retry(sourceId: string): Promise<void> {
		return this.controller.retry(sourceId);
	}

	generateAi(): Promise<void> {
		return this.controller.loadAi();
	}

	dispose(): void {
		this.controller.dispose();
	}
}

function toSelectionSnapshot(state: DictionaryViewState): SelectionLookupSnapshot {
	return {
		query: state.query,
		activeSourceId: state.activeSourceId,
		aiEngineName: state.aiEngineName,
		status: state.status,
		sources: state.sources.map((source) => {
			const sections: SelectionLookupSection[] = [];
			let hasComplexContent = false;
			for (const section of source.result?.sections ?? []) {
				if (section.content.kind === "list") {
					sections.push({ kind: "list", items: [...section.content.items] });
				} else if (section.content.kind === "ai-definitions") {
					sections.push({
						kind: "ai-definitions",
						definitions: section.content.definitions.map((definition) => ({
							partOfSpeech: definition.partOfSpeech,
							meaning: definition.meaning,
						})),
					});
				} else {
					hasComplexContent = true;
				}
			}
			return {
				id: source.id,
				label: source.label,
				kind: source.kind === "ai" ? ("ai" as const) : ("dictionary" as const),
				status: source.status,
				error: source.error,
				pronunciations: (source.result?.pronunciations ?? []).map(
					({ label, phonetic }) => ({
						label,
						phonetic,
					}),
				),
				sections,
				hasComplexContent,
			};
		}),
	};
}
