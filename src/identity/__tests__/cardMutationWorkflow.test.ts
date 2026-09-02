import { describe, expect, it, vi } from "vitest";
import type { CardChangeOutcome, CardIdentityContinuity } from "../cardIdentityContinuity";
import { executeCardMutationWorkflow } from "../cardMutationWorkflow";

describe("cardMutationWorkflow", () => {
	function makeMockContinuity(outcome: CardChangeOutcome) {
		const change = vi.fn().mockResolvedValue(outcome);
		return { change };
	}

	function makeOptions(
		overrides: Partial<Parameters<typeof executeCardMutationWorkflow>[2]> = {},
	) {
		const notices: string[] = [];
		const onRequestMigration = vi.fn().mockResolvedValue(true);
		const notify = vi.fn((msg: string) => notices.push(msg));
		const t = vi.fn((key: any, vars?: any) => {
			if (vars?.message) return `${key}:${vars.message}`;
			return key;
		}) as any;

		return {
			options: {
				language: "zh" as const,
				onRequestMigration,
				notify,
				t,
				...overrides,
			},
			notices,
			onRequestMigration,
			notify,
			t,
		};
	}

	it("executes create mutation, delegates to continuity add, and notifies notice.cardAdded", async () => {
		const continuity = makeMockContinuity({ kind: "applied", cardIdentity: "id-123" });
		const { options, notify } = makeOptions();

		const result = await executeCardMutationWorkflow(
			continuity as unknown as CardIdentityContinuity,
			{
				kind: "create",
				deckId: "deck.md",
				content: { front: "front", back: "back", explanation: "exp" },
			},
			options,
		);

		expect(continuity.change).toHaveBeenCalledWith({
			kind: "add",
			deckId: "deck.md",
			content: { front: "front", back: "back", explanation: "exp" },
		});
		expect(result).toEqual({ kind: "applied", cardIdentity: "id-123" });
		expect(notify).toHaveBeenCalledWith("notice.cardAdded");
	});

	it("executes edit mutation, delegates to continuity edit, and notifies notice.cardSaved", async () => {
		const continuity = makeMockContinuity({ kind: "applied" });
		const { options, notify } = makeOptions();

		const result = await executeCardMutationWorkflow(
			continuity as unknown as CardIdentityContinuity,
			{
				kind: "edit",
				deckId: "deck.md",
				cardId: "card-1",
				content: { front: "front2", back: "back2" },
			},
			options,
		);

		expect(continuity.change).toHaveBeenCalledWith({
			kind: "edit",
			deckId: "deck.md",
			cardIdentity: "card-1",
			content: { front: "front2", back: "back2" },
		});
		expect(result).toEqual({ kind: "applied", cardIdentity: undefined });
		expect(notify).toHaveBeenCalledWith("notice.cardSaved");
	});

	it("executes delete mutation, delegates to continuity delete, and notifies notice.cardDeleted", async () => {
		const continuity = makeMockContinuity({ kind: "applied" });
		const { options, notify } = makeOptions();

		const result = await executeCardMutationWorkflow(
			continuity as unknown as CardIdentityContinuity,
			{
				kind: "delete",
				deckId: "deck.md",
				cardId: "card-1",
			},
			options,
		);

		expect(continuity.change).toHaveBeenCalledWith({
			kind: "delete",
			deckId: "deck.md",
			cardIdentity: "card-1",
		});
		expect(result).toEqual({ kind: "applied", cardIdentity: undefined });
		expect(notify).toHaveBeenCalledWith("notice.cardDeleted");
	});

	it("intercepts migration-required blocked outcome and calls onRequestMigration", async () => {
		const continuity = makeMockContinuity({ kind: "blocked", reason: "migration-required" });
		const { options, onRequestMigration, notify } = makeOptions();

		const result = await executeCardMutationWorkflow(
			continuity as unknown as CardIdentityContinuity,
			{
				kind: "edit",
				deckId: "deck.md",
				cardId: "card-1",
				content: { front: "f", back: "b" },
			},
			options,
		);

		expect(onRequestMigration).toHaveBeenCalledWith("deck.md");
		expect(result).toEqual({ kind: "migrating" });
		expect(notify).not.toHaveBeenCalled();
	});

	it("formats error description and notifies failure when mutation fails", async () => {
		const continuity = makeMockContinuity({
			kind: "validation-failed",
			error: { type: "missing-front" },
		});
		const { options, notify } = makeOptions();

		const result = await executeCardMutationWorkflow(
			continuity as unknown as CardIdentityContinuity,
			{
				kind: "create",
				deckId: "deck.md",
				content: { front: "", back: "b" },
			},
			options,
		);

		expect(result.kind).toBe("failed");
		expect(notify).toHaveBeenCalled();
	});
});
