import { createEmptyCard, State } from "ts-fsrs";
import { describe, expect, it, vi } from "vitest";
import type { Vault } from "obsidian";
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
		} as unknown as Vault;
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
					fsrsCard: { ...createEmptyCard(), state: State.Review, reps: 7 },
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
			sources: createObsidianContinuitySourceStore(vault),
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
