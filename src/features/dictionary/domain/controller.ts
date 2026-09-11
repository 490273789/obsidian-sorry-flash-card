import {
	DICTIONARY_HISTORY_LIMIT,
	DICTIONARY_QUERY_MAX_LENGTH,
	normalizeDictionaryQuery,
} from "./configuration";
import { dictionaryText } from "./messages";
import {
	DictionaryError,
	type DictionaryResult,
	type DictionarySettingsStore,
	type DictionarySource,
	type DictionarySourceSettings,
	type DictionarySourceState,
	type DictionaryViewState,
} from "./types";

export type DictionarySourceResolver = (
	settings: Readonly<DictionarySourceSettings>,
) => DictionarySource;

const DICTIONARY_AUDIO_HOSTS = new Set(["dict.youdao.com", "dictionary.cambridge.org"]);

/**
 * Whether a pronunciation URL may be played by the dictionary view. Only HTTPS
 * audio hosted by a supported dictionary source is accepted.
 */
export function canPlayDictionaryAudio(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	return parsed.protocol === "https:" && DICTIONARY_AUDIO_HOSTS.has(parsed.hostname);
}

/** Prepends `query` to the recent-search history, deduplicating case-insensitively. */
export function recordDictionarySearchHistory(history: readonly string[], query: string): string[] {
	const normalized = normalizeDictionaryQuery(query);
	if (!normalized) return [...history];
	const key = normalized.toLocaleLowerCase();
	return [
		normalized,
		...history.filter((candidate) => candidate.toLocaleLowerCase() !== key),
	].slice(0, DICTIONARY_HISTORY_LIMIT);
}

function createSourceState(settings: Readonly<DictionarySourceSettings>): DictionarySourceState {
	return {
		activeSectionIndex: null,
		error: "",
		id: settings.id,
		kind: settings.kind,
		label: settings.label,
		result: null,
		status: "idle",
	};
}

function freezeDictionaryResult(result: DictionaryResult): DictionaryResult {
	for (const pronunciation of result.pronunciations) Object.freeze(pronunciation);
	Object.freeze(result.pronunciations);
	for (const section of result.sections) {
		if (section.content.kind === "ai-definitions") {
			for (const definition of section.content.definitions) {
				Object.freeze(definition.synonyms);
				Object.freeze(definition.antonyms);
				for (const example of definition.examples) Object.freeze(example);
				Object.freeze(definition.examples);
				Object.freeze(definition);
			}
			Object.freeze(section.content.definitions);
		} else if (section.content.kind === "list") {
			Object.freeze(section.content.items);
		}
		Object.freeze(section.content);
		Object.freeze(section);
	}
	Object.freeze(result.sections);
	Object.freeze(result.suggestions);
	return Object.freeze(result);
}

/**
 * Shared dictionary query session consumed by every dictionary view. Owns no
 * Obsidian I/O: sources, view opening, notices, and AI engine facts are injected.
 */
export class DictionaryController {
	private requestGeneration = 0;
	private audio: HTMLAudioElement | null = null;
	private state: DictionaryViewState;
	private snapshot: DictionaryViewState;
	private readonly listeners = new Set<() => void>();
	private disposed = false;

	constructor(
		private readonly settings: DictionarySettingsStore,
		private readonly resolveSource: DictionarySourceResolver,
		private readonly openFavoriteView: (word: string) => Promise<void>,
		private readonly openSettingsCallback: () => void,
		private readonly notify: (message: string) => void,
		private readonly aiEngineInfo: () => {
			readonly configId: string | null;
			readonly name: string | null;
		},
	) {
		const dictionary = settings.getDictionarySettings();
		this.state = {
			activeSourceId: null,
			aiEngineName: "",
			aiReady: false,
			history: [...dictionary.history],
			input: "",
			query: "",
			sources: [],
			status: "idle",
		};
		this.applyAiEngineInfo();
		this.snapshot = this.buildSnapshot();
	}

	getSnapshot(): DictionaryViewState {
		return this.snapshot;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	setInput(value: string): void {
		if (this.disposed) return;
		this.state.input = value.slice(0, DICTIONARY_QUERY_MAX_LENGTH);
		this.publish();
	}

	prefill(value: string): void {
		this.setInput(value);
	}

	async lookup(): Promise<void> {
		if (this.disposed) return;
		const query = normalizeDictionaryQuery(this.state.input);
		if (!query) return;
		const generation = ++this.requestGeneration;
		this.stopAudio();
		this.state.input = query;
		this.state.query = query;
		this.state.status = "loading";
		this.publish();

		let saved = false;
		try {
			saved = await this.settings.updateDictionarySettings((draft) => {
				draft.history = recordDictionarySearchHistory(draft.history, query);
			});
		} catch {
			saved = false;
		}
		if (generation !== this.requestGeneration || this.disposed) return;
		if (saved) this.refreshSettings();
		else this.notify(dictionaryText().saveFailed);

		const configuredSources = this.settings
			.getDictionarySettings()
			.sources.filter((source) => source.enabled);
		this.state.sources = configuredSources.map(createSourceState);
		this.state.activeSourceId = configuredSources.some(
			(source) => source.id === this.state.activeSourceId,
		)
			? this.state.activeSourceId
			: (configuredSources[0]?.id ?? null);

		const automatic = configuredSources.filter((source) => source.kind !== "ai");
		if (automatic.length === 0) {
			this.state.status = "ready";
			this.publish();
			return;
		}
		await Promise.all(automatic.map(async (source) => this.runSource(source.id, generation)));
		if (generation !== this.requestGeneration || this.disposed) return;
		const successful = this.state.sources.some((source) => source.status === "success");
		this.state.status = successful ? "ready" : "error";
		this.publish();
	}

	async lookupWord(word: string): Promise<void> {
		if (this.disposed) return;
		this.state.input = word;
		await this.lookup();
	}

	async retry(sourceId: string): Promise<void> {
		if (this.disposed || !this.state.query) return;
		await this.runSource(sourceId, this.requestGeneration);
		if (this.disposed) return;
		const successful = this.state.sources.some((source) => source.status === "success");
		this.state.status = successful ? "ready" : "error";
		this.publish();
	}

	async loadAi(): Promise<void> {
		if (this.disposed || !this.state.query) return;
		await this.runSource("ai", this.requestGeneration);
	}

	selectSource(sourceId: string): void {
		if (this.disposed) return;
		if (!this.state.sources.some((source) => source.id === sourceId)) return;
		this.state.activeSourceId = sourceId;
		this.publish();
	}

	selectSection(sourceId: string, sectionIndex: number): void {
		if (this.disposed) return;
		const source = this.state.sources.find((candidate) => candidate.id === sourceId);
		if (source?.result?.sections[sectionIndex]?.presentation !== "tab") return;
		source.activeSectionIndex = sectionIndex;
		this.publish();
	}

	clear(): void {
		this.resetSession();
	}

	async copyQuery(): Promise<void> {
		if (this.disposed || !this.state.query) return;
		await this.writeClipboard(this.state.query);
	}

	async openFavorite(): Promise<void> {
		if (this.disposed || !this.state.query) return;
		await this.openFavoriteView(this.state.query);
	}

	openSettings(): void {
		if (this.disposed) return;
		this.openSettingsCallback();
	}

	async playAudio(value: string): Promise<void> {
		if (this.disposed || !canPlayDictionaryAudio(value)) return;
		this.stopAudio();
		let audio: HTMLAudioElement;
		try {
			audio = new Audio(value);
		} catch {
			return;
		}
		this.audio = audio;
		try {
			await audio.play();
		} catch {
			if (this.audio === audio) this.audio = null;
			this.notify(dictionaryText().errors.network);
		}
	}

	refreshSettings(): void {
		if (this.disposed) return;
		const dictionary = this.settings.getDictionarySettings();
		this.state.history = [...dictionary.history];
		this.applyAiEngineInfo();
		if (this.state.sources.length > 0) {
			const existing = new Map(this.state.sources.map((source) => [source.id, source]));
			this.state.sources = dictionary.sources
				.filter((source) => source.enabled)
				.map((source) => existing.get(source.id) ?? createSourceState(source));
			if (!this.state.sources.some((source) => source.id === this.state.activeSourceId)) {
				this.state.activeSourceId = this.state.sources[0]?.id ?? null;
			}
		}
		this.publish();
	}

	resetSession(): void {
		this.requestGeneration += 1;
		this.stopAudio();
		this.state.activeSourceId = null;
		this.state.input = "";
		this.state.query = "";
		this.state.sources = [];
		this.state.status = "idle";
		this.publish();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.requestGeneration += 1;
		this.stopAudio();
		this.listeners.clear();
	}

	private async runSource(sourceId: string, generation: number): Promise<void> {
		const sourceSettings = this.settings
			.getDictionarySettings()
			.sources.find((candidate) => candidate.id === sourceId && candidate.enabled);
		const sourceState = this.state.sources.find((candidate) => candidate.id === sourceId);
		if (!sourceSettings || !sourceState || sourceState.status === "loading") return;
		sourceState.activeSectionIndex = null;
		sourceState.error = "";
		sourceState.result = null;
		sourceState.status = "loading";
		this.publish();
		try {
			const result = await this.resolveSource(sourceSettings).lookup({
				text: this.state.query,
			});
			if (generation !== this.requestGeneration || this.disposed) return;
			sourceState.result = result;
			const activeSection = result.sections.findIndex(
				(section) => section.presentation === "tab",
			);
			sourceState.activeSectionIndex = activeSection < 0 ? null : activeSection;
			sourceState.status = "success";
		} catch (error) {
			if (generation !== this.requestGeneration || this.disposed) return;
			sourceState.error =
				error instanceof DictionaryError ? error.message : dictionaryText().errors.request;
			sourceState.status =
				error instanceof DictionaryError && error.code === "not-found" ? "empty" : "error";
		}
		this.publish();
	}

	private async writeClipboard(value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			this.notify(dictionaryText().copied);
		} catch {
			this.notify(dictionaryText().errors.request);
		}
	}

	private stopAudio(): void {
		this.audio?.pause();
		this.audio = null;
	}

	private applyAiEngineInfo(): void {
		const info = this.aiEngineInfo();
		this.state.aiEngineName = info.name ?? "";
		this.state.aiReady = info.configId !== null && info.name !== null;
	}

	private buildSnapshot(): DictionaryViewState {
		const history = [...this.state.history];
		const sources = this.state.sources.map((source): DictionarySourceState => {
			const result = source.result;
			return {
				activeSectionIndex: source.activeSectionIndex,
				error: source.error,
				id: source.id,
				kind: source.kind,
				label: source.label,
				result: result ? freezeDictionaryResult(result) : null,
				status: source.status,
			};
		});
		const snapshot: DictionaryViewState = {
			activeSourceId: this.state.activeSourceId,
			aiEngineName: this.state.aiEngineName,
			aiReady: this.state.aiReady,
			history,
			input: this.state.input,
			query: this.state.query,
			sources,
			status: this.state.status,
		};
		Object.freeze(history);
		Object.freeze(sources);
		for (const source of sources) Object.freeze(source);
		return Object.freeze(snapshot);
	}

	private publish(): void {
		this.snapshot = this.buildSnapshot();
		for (const listener of this.listeners) {
			try {
				listener();
			} catch {
				// Presentation listeners must never invalidate controller state.
			}
		}
	}
}
