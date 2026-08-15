import { createEmptyCard, State } from "ts-fsrs";
import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import { createObsidianContinuitySourceStore } from "../cardIdentityContinuityAdapters";
import {
	createCardIdentityContinuity,
	type CardIdentityContinuityState,
	type ContinuityStateStore,
} from "../../identity/cardIdentityContinuity";
import type { Deck } from "../../shared/types";

vi.mock("obsidian", () => ({
	TFile: class MockTFile {
		constructor(
			public readonly path: string,
			public readonly basename: string,
		) {}
	},
}));

const CARD_ID = "550e8400-e29b-41d4-a716-446655440000";

class MemoryStateStore implements ContinuityStateStore {
	constructor(public state: CardIdentityContinuityState) {}

	async load(): Promise<CardIdentityContinuityState> {
		return this.state;
	}

	async commit(state: CardIdentityContinuityState): Promise<void> {
		this.state = state;
	}
}

describe("Obsidian continuity source store", () => {
	it("discovers unconfigured flashcard tags without treating cached files as live sources", async () => {
		const configuredPath = "notes/words.md";
		const discoveredPath = "notes/phrases.md";
		const configuredFile = Object.assign(new TFile(), {
			path: configuredPath,
			basename: "words",
		});
		const discoveredFile = Object.assign(new TFile(), {
			path: discoveredPath,
			basename: "phrases",
		});
		const contents = new Map([
			[
				configuredPath,
				`#单词
<!-- wsr-card-id: ${CARD_ID} -->
apple
??
苹果
;;`,
			],
			[
				discoveredPath,
				`#短语
good morning
??
早上好
;;`,
			],
		]);
		const read = vi.fn(async (file: TFile) => contents.get(file.path) ?? "");
		const cachedRead = vi.fn(async (file: TFile) => contents.get(file.path) ?? "");
		const app = {
			vault: {
				getMarkdownFiles: () => [configuredFile, discoveredFile],
				read,
				cachedRead,
				getAbstractFileByPath: () => null,
				process: vi.fn(),
			},
			metadataCache: {
				getFileCache: (file: TFile) => ({
					tags: [{ tag: file === configuredFile ? "#单词" : "#短语" }],
				}),
			},
		} as unknown as App;
		const state = new MemoryStateStore({
			configuredTags: ["#单词"],
			availableTags: [],
			decks: new Map(),
			continuity: { sources: {}, issues: [], journal: null },
		});
		const continuity = createCardIdentityContinuity({
			sources: createObsidianContinuitySourceStore(app),
			state,
			createIdentity: () => CARD_ID,
		});

		expect(await continuity.synchronize()).toMatchObject({
			kind: "current",
		});
		expect(state.state.availableTags).toEqual(["#单词", "#短语"]);
		expect(state.state.decks.has(configuredPath)).toBe(true);
		expect(state.state.decks.has(discoveredPath)).toBe(false);
		expect(read).toHaveBeenCalledWith(configuredFile);
		expect(read).not.toHaveBeenCalledWith(discoveredFile);
		expect(cachedRead).toHaveBeenCalledWith(discoveredFile);
	});

	it("uses an uncached read so migration previews match atomic writes", async () => {
		const path = "notes/legacy.md";
		const currentContent = `#单词
苹果
??
apple
;;`;
		const staleCachedContent = `${currentContent}\n\n<!-- stale cache -->`;
		const file = Object.assign(new TFile(), { path, basename: "legacy" });
		let diskContent = currentContent;
		const read = vi.fn(async () => diskContent);
		const cachedRead = vi.fn(async () => staleCachedContent);
		const vault = {
			getMarkdownFiles: () => [file],
			read,
			cachedRead,
			getAbstractFileByPath: () => file,
			process: async (_file: TFile, transform: (content: string) => string) => {
				diskContent = transform(diskContent);
				return diskContent;
			},
		};
		const app = {
			vault,
			metadataCache: undefined,
		} as unknown as App;
		const legacyDeck: Deck = {
			id: path,
			name: "legacy",
			filePath: path,
			tag: "#单词",
			cards: [
				{
					id: `${path}::0`,
					front: "苹果",
					back: "apple",
					fsrsCard: {
						...createEmptyCard(),
						state: State.Review,
						reps: 7,
					},
					sourceFile: path,
					indexInFile: 0,
				},
			],
			studyCount: 0,
			lastStudied: null,
		};
		const state = new MemoryStateStore({
			configuredTags: ["#单词"],
			decks: new Map([[path, legacyDeck]]),
			continuity: { sources: {}, issues: [], journal: null },
		});
		const continuity = createCardIdentityContinuity({
			sources: createObsidianContinuitySourceStore(app),
			state,
			createIdentity: () => CARD_ID,
		});

		await continuity.synchronize();
		const preview = continuity.inspect().migration;
		if (!preview) throw new Error("Expected migration preview");
		const outcome = await continuity.resolve({
			kind: "migrate",
			ticket: preview.ticket,
			deckIds: [path],
		});

		expect(outcome).toEqual({ kind: "applied" });
		expect(read).toHaveBeenCalled();
		expect(cachedRead).not.toHaveBeenCalled();
		expect(diskContent).toContain(`<!-- wsr-card-id: ${CARD_ID} -->`);
		expect(state.state.decks.get(path)?.cards[0]).toMatchObject({
			id: CARD_ID,
			fsrsCard: { reps: 7 },
		});
	});
});
