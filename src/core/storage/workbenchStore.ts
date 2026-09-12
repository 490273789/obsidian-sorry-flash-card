import type { Plugin } from "obsidian";
import type { FlashcardSettings } from "../shared/types";
import {
	DEFAULT_SETTINGS,
	cloneSettingsDocument,
	normalizeSettingsDocument,
} from "../host/settingsSlices";

/** Minimal storage backend interface satisfied by Obsidian's Plugin. */
export interface StorageBackend {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

export interface StoredWorkbenchDocument {
	schemaVersion: number;
	settings: FlashcardSettings;
	[partitionKey: string]: unknown;
}

export interface WorkbenchStoreOptions {
	backend: StorageBackend;
	initialSettings?: FlashcardSettings;
}

/**
 * WorkbenchStore - the single atomic persistence authority for the entire plugin.
 *
 * Coordinates atomic serialization to data.json, external sync reload transitions,
 * monotonic revision publishing, and partition-level updates with zero knowledge
 * of feature-internal domain models.
 */
export class WorkbenchStore {
	private readonly backend: StorageBackend;
	private settings: FlashcardSettings;
	private document: StoredWorkbenchDocument;
	/** One writer for data.json. Every write is sequenced after prior writes settle. */
	private writeTail: Promise<void> = Promise.resolve();
	private revision = 0;
	private readonly revisionListeners = new Set<() => void>();
	private loaded = false;

	constructor(backendOrPlugin: StorageBackend | Plugin, initialSettings?: FlashcardSettings) {
		this.backend = backendOrPlugin;
		this.settings = cloneSettingsDocument(initialSettings ?? DEFAULT_SETTINGS);
		this.document = {
			schemaVersion: 2,
			settings: this.settings,
		};
	}

	/**
	 * Loads settings and all persisted document partitions from disk in a single read.
	 */
	async loadSettings(): Promise<FlashcardSettings> {
		return this.enqueueWrite(async () => {
			const data = (await this.backend.loadData()) as StoredWorkbenchDocument | null;
			this.restoreDocument(data);
			this.loaded = true;
			return cloneSettingsDocument(this.settings);
		});
	}

	/**
	 * No-op if loadSettings() was already called (all data is loaded in one read).
	 */
	async load(): Promise<void> {
		if (this.loaded) return;
		await this.loadSettings();
	}

	/**
	 * Saves settings to disk and publishes a revision update.
	 */
	async saveSettings(newSettings?: FlashcardSettings): Promise<void> {
		await this.enqueueWrite(async () => {
			const next = cloneSettingsDocument(newSettings ?? this.settings);
			this.settings = next;
			this.document.settings = next;
			await this.backend.saveData(this.document);
			this.publishRevision();
		});
	}

	/** Returns a copy of the current committed settings document. */
	getSettings(): FlashcardSettings {
		return cloneSettingsDocument(this.settings);
	}

	/**
	 * Reads a named data partition from the persisted document snapshot.
	 */
	getPartition<T = unknown>(partitionKey: string): T | undefined {
		return this.document[partitionKey] as T | undefined;
	}

	/**
	 * Atomically persists a data partition to disk and publishes a revision update.
	 */
	async savePartition<T>(partitionKey: string, partitionData: T): Promise<void> {
		await this.enqueueWrite(async () => {
			this.document[partitionKey] = partitionData;
			await this.backend.saveData(this.document);
			this.publishRevision();
		});
	}

	/**
	 * Atomically executes a document mutation against the authoritative in-memory document.
	 */
	async mutateDocument(mutator: (doc: StoredWorkbenchDocument) => void): Promise<void> {
		await this.enqueueWrite(async () => {
			mutator(this.document);
			if (this.document.settings) {
				this.settings = cloneSettingsDocument(this.document.settings);
			}
			await this.backend.saveData(this.document);
			this.publishRevision();
		});
	}

	/**
	 * Reloads the Sync-tracked data.json document after Obsidian reports an external change.
	 */
	async reloadExternalSettings(): Promise<void> {
		await this.enqueueWrite(async () => {
			const data = (await this.backend.loadData()) as StoredWorkbenchDocument | null;
			this.restoreDocument(data);
			this.publishRevision();
		});
	}

	/**
	 * Returns the raw document snapshot for feature stores requiring migration inspection.
	 */
	getRawDocument(): Readonly<Record<string, unknown>> {
		return { ...this.document };
	}

	getRevision(): number {
		return this.revision;
	}

	subscribe(listener: () => void): () => void {
		this.revisionListeners.add(listener);
		return () => this.revisionListeners.delete(listener);
	}

	private restoreDocument(data: StoredWorkbenchDocument | null): void {
		let rawSettings: unknown = {};
		if (data?.settings) {
			rawSettings = data.settings;
		} else if (data && ("flashcardTags" in data || "flashcardTag" in data)) {
			rawSettings = data;
		}
		this.settings = normalizeSettingsDocument(rawSettings);

		if (data && typeof data === "object") {
			this.document = {
				...data,
				schemaVersion: 2,
				settings: this.settings,
			};
		} else {
			this.document = {
				schemaVersion: 2,
				settings: this.settings,
			};
		}
	}

	private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
		const pending = this.writeTail.then(operation, operation);
		this.writeTail = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	}

	private publishRevision(): void {
		this.revision++;
		for (const listener of this.revisionListeners) {
			try {
				listener();
			} catch (error) {
				console.error("Error in WorkbenchStore revision listener:", error);
			}
		}
	}
}
