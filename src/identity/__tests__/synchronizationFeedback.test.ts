import { describe, expect, it } from "vitest";
import type { CardIdentityContinuitySnapshot, SynchronizeOutcome } from "../cardIdentityContinuity";
import { describeSynchronizationOutcome } from "../synchronizationFeedback";

const CONFLICT_ID = "73688849-a7f8-4b7c-9f46-4a3d75d7b5c5";

describe("synchronization feedback", () => {
	it("explains the first identity conflict with its source, card, and repair action", () => {
		const outcome: SynchronizeOutcome = {
			kind: "attention-required",
			changedDeckIds: [],
			issueIds: [`identity-conflict:${CONFLICT_ID}`, "identity-conflict:another"],
		};
		const snapshot: CardIdentityContinuitySnapshot = {
			sources: {
				"Word/SeniorHeighSchool.md": {
					type: "last-known-good",
					reason: "identity-conflict",
				},
			},
			issues: [
				{
					id: `identity-conflict:${CONFLICT_ID}`,
					ticket: "identity-conflict:ticket",
					type: "identity-conflict",
					identity: CONFLICT_ID,
					affectedSources: ["Word/SeniorHeighSchool.md"],
					candidates: [
						{
							token: "candidate-1",
							sourcePath: "Word/SeniorHeighSchool.md",
							front: "## gap",
							back: "n. 间隔",
						},
						{
							token: "candidate-2",
							sourcePath: "Word/SeniorHeighSchool.md",
							front: "## gap",
							back: "n. 间隔",
						},
					],
				},
			],
			journal: null,
		};

		const message = describeSynchronizationOutcome(outcome, snapshot, "zh");

		expect(message).toContain("题库导入未完成");
		expect(message).toContain("Word/SeniorHeighSchool.md");
		expect(message).toContain(CONFLICT_ID);
		expect(message).toContain("gap");
		expect(message).toContain("修复卡片身份冲突");
		expect(message).toContain("另有 1 个身份问题");
	});

	it("explains identity ambiguity in English", () => {
		const outcome: SynchronizeOutcome = {
			kind: "attention-required",
			changedDeckIds: [],
			issueIds: ["identity-ambiguity:Word/test.md"],
		};
		const snapshot: CardIdentityContinuitySnapshot = {
			sources: {},
			issues: [
				{
					id: "identity-ambiguity:Word/test.md",
					ticket: "identity-ambiguity:ticket",
					type: "identity-ambiguity",
					missingIdentities: ["old-1", "old-2"],
					affectedSources: ["Word/test.md"],
					candidates: [],
				},
			],
			journal: null,
		};

		expect(describeSynchronizationOutcome(outcome, snapshot, "en")).toBe(
			"Deck import incomplete: 2 card identities in Word/test.md could not be matched. Run “Repair card identity conflicts” and refresh again.",
		);
	});

	it("returns the underlying failure and stays silent for a current sync", () => {
		const snapshot: CardIdentityContinuitySnapshot = {
			sources: {},
			issues: [],
			journal: null,
		};

		expect(
			describeSynchronizationOutcome(
				{ kind: "failed", retryable: true, message: "Source changed" },
				snapshot,
				"zh",
			),
		).toBe("题库同步失败：Source changed");
		expect(
			describeSynchronizationOutcome({ kind: "current", changedDeckIds: [] }, snapshot, "zh"),
		).toBeNull();
	});
});
