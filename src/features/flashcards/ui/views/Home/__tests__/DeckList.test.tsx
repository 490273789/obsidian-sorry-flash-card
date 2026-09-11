import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
	DeckHome,
	DeckHomeDeckSnapshot,
	DeckHomeSnapshot,
} from "../../../../domain/decks/deckHome";
import { flashcardTranslator } from "../../../../strings/index";
import { I18nProvider } from "../../../../../../core/ui/context/I18nContext";
import { DeckList, getDeckCardTransition } from "../DeckList";

function makeDeckSnapshot(overrides: Partial<DeckHomeDeckSnapshot> = {}): DeckHomeDeckSnapshot {
	return {
		id: "deck-1",
		name: "Words",
		filePath: "vocab/words.md",
		tag: "#flashcards",
		studyCount: 5,
		stats: {
			totalCards: 10,
			newCards: 2,
			learningCards: 0,
			reviewCards: 0,
			relearningCards: 0,
			dueCards: 0,
		},
		spelling: {
			enabled: false,
			ready: false,
			valid: false,
			canStart: false,
			hasStableIdentities: true,
			issueCount: 0,
			ignoredCardCount: 0,
		},
		...overrides,
	};
}

function makeSnapshot(decks: DeckHomeDeckSnapshot[]): DeckHomeSnapshot {
	return {
		revision: 1,
		decks,
		totals: {
			deckCount: decks.length,
			totalCards: 10,
			newCards: 2,
			dueCards: 0,
			studyCount: 5,
		},
		migration: null,
		export: { kind: "idle" },
		mutation: { kind: "idle" },
		settingsDraft: null,
	};
}

function renderDeckList(snapshot: DeckHomeSnapshot) {
	const mockHome = {
		act: vi.fn(),
		getSnapshot: () => snapshot,
		subscribe: () => () => {},
	} as unknown as DeckHome;

	return renderToStaticMarkup(
		<I18nProvider language="zh" translator={flashcardTranslator}>
			<DeckList
				snapshot={snapshot}
				home={mockHome}
				ownerId="owner-1"
				onNavigate={vi.fn()}
				onRequestMigration={vi.fn()}
				onOpenSourceFile={vi.fn()}
				onOpenStats={vi.fn()}
				onOpenSettings={vi.fn()}
				onOpenAddCard={vi.fn()}
			/>
		</I18nProvider>,
	);
}

describe("DeckList", () => {
	it("disables the transform transition for the drag source until it reaches its new position", () => {
		expect(getDeckCardTransition(true, false, "transform 200ms ease")).toBe("none");
		expect(getDeckCardTransition(false, true, undefined)).toBe("none");
		expect(getDeckCardTransition(false, false, "transform 200ms ease")).toBe(
			"transform 200ms ease",
		);
	});

	it("renders spelling button directly when spelling is enabled", () => {
		const deck = makeDeckSnapshot({
			spelling: {
				enabled: true,
				ready: true,
				valid: true,
				canStart: true,
				hasStableIdentities: true,
				issueCount: 0,
				ignoredCardCount: 0,
			},
		});
		const html = renderDeckList(makeSnapshot([deck]));

		expect(html).toContain("flashcard-deck-action-study");
		expect(html).toContain("flashcard-deck-action-practice");
		expect(html).toContain("flashcard-deck-action-spelling");
		expect(html).toContain("has-spelling");
		expect(html).toContain("拼写");
	});

	it("disables spelling button when spelling is enabled but not ready", () => {
		const deck = makeDeckSnapshot({
			spelling: {
				enabled: true,
				ready: false,
				valid: false,
				canStart: false,
				hasStableIdentities: false,
				issueCount: 2,
				ignoredCardCount: 0,
			},
		});
		const html = renderDeckList(makeSnapshot([deck]));

		expect(html).toContain("flashcard-deck-action-spelling");
		expect(html).toContain('disabled=""');
	});

	it("does not render spelling button when spelling is not enabled", () => {
		const deck = makeDeckSnapshot({
			spelling: {
				enabled: false,
				ready: false,
				valid: false,
				canStart: false,
				hasStableIdentities: true,
				issueCount: 0,
				ignoredCardCount: 0,
			},
		});
		const html = renderDeckList(makeSnapshot([deck]));

		expect(html).toContain("flashcard-deck-action-study");
		expect(html).toContain("flashcard-deck-action-practice");
		expect(html).not.toContain("flashcard-deck-action-spelling");
		expect(html).not.toContain("has-spelling");
	});
});
