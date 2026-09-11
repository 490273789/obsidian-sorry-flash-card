import { normalizePath, type DataAdapter } from "obsidian";
import type { DictionarySandboxStorageMutation } from "./sandbox-document/protocol";

const STORAGE_FILE_NAME = "sandbox-storage.json";
const MAX_STORAGE_FILE_BYTES = 262_144;
const MAX_STORAGE_KEYS = 128;
const MAX_STORAGE_KEY_LENGTH = 128;
const MAX_STORAGE_VALUE_LENGTH = 16_384;

export class LocalDictionarySandboxStorage {
	private closed = false;
	private loading: Promise<void> | null = null;
	private values: Record<string, string> | null = null;
	private writeQueue: Promise<void> = Promise.resolve();
	private readonly path: string;

	constructor(
		private readonly adapter: DataAdapter,
		dictionaryRoot: string,
	) {
		this.path = normalizePath(`${dictionaryRoot}/${STORAGE_FILE_NAME}`);
	}

	close(): void {
		this.closed = true;
	}

	async snapshot(): Promise<Readonly<Record<string, string>>> {
		this.loading ??= this.load();
		await this.loading;
		return Object.freeze({ ...this.values });
	}

	update(mutation: DictionarySandboxStorageMutation): Promise<void> {
		if (this.closed || !this.values) return Promise.resolve();
		const next = applyMutation(this.values, mutation);
		if (!next) return Promise.resolve();
		this.values = next;
		const serialized = JSON.stringify(next);
		const operation = this.writeQueue.then(() => this.adapter.write(this.path, serialized));
		this.writeQueue = operation.catch(() => undefined);
		return operation;
	}

	private async load(): Promise<void> {
		this.values = {};
		try {
			const stat = await this.adapter.stat(this.path);
			if (!stat || stat.type !== "file" || stat.size > MAX_STORAGE_FILE_BYTES) return;
			const parsed: unknown = JSON.parse(await this.adapter.read(this.path));
			const values = validStorageValues(parsed);
			if (values) this.values = values;
		} catch {
			this.values = {};
		}
	}
}

function applyMutation(
	current: Readonly<Record<string, string>>,
	mutation: DictionarySandboxStorageMutation,
): Record<string, string> | null {
	const next = { ...current };
	if (mutation.operation === "clear") {
		for (const key of Object.keys(next)) delete next[key];
	} else if (mutation.operation === "remove") {
		if (!validStorageKey(mutation.key)) return null;
		delete next[mutation.key];
	} else {
		if (!validStorageKey(mutation.key) || !validStorageValue(mutation.value)) return null;
		next[mutation.key] = mutation.value;
	}
	return validStorageValues(next);
}

function validStorageValues(value: unknown): Record<string, string> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const entries = Object.entries(value);
	if (
		entries.length > MAX_STORAGE_KEYS ||
		entries.some(([key, item]) => !validStorageKey(key) || !validStorageValue(item))
	) {
		return null;
	}
	const values = Object.fromEntries(entries) as Record<string, string>;
	return new TextEncoder().encode(JSON.stringify(values)).byteLength <= MAX_STORAGE_FILE_BYTES
		? values
		: null;
}

function validStorageKey(value: string): boolean {
	return Boolean(value) && value.length <= MAX_STORAGE_KEY_LENGTH && !value.includes("\0");
}

function validStorageValue(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= MAX_STORAGE_VALUE_LENGTH &&
		!value.includes("\0")
	);
}
