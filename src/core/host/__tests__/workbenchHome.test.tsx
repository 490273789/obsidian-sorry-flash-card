import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createSharedTranslator } from "../../i18n";
import { WorkbenchHome } from "../workbenchHome";
import type { WorkbenchCatalogEntry } from "../workbench";

vi.mock("obsidian", () => ({
	ItemView: class {},
	WorkspaceLeaf: class {},
}));

function entry(overrides: Partial<WorkbenchCatalogEntry> & { id: string }): WorkbenchCatalogEntry {
	return {
		icon: "layers",
		title: () => overrides.id,
		openCommandId: `open-${overrides.id}`,
		settingsSectionId: overrides.id,
		available: () => true,
		open: vi.fn(),
		...overrides,
	};
}

type Clickable = React.ReactElement<{ children?: React.ReactNode; onClick: () => void }>;

/** Collects every element whose props carry an onClick, in tree order. */
function clickableElements(node: React.ReactNode, found: Clickable[] = []): Clickable[] {
	const element = node as React.ReactElement<{ children?: React.ReactNode; onClick?: unknown }>;
	if (!element || typeof element !== "object") return found;
	if (typeof element.props?.onClick === "function") found.push(element as Clickable);
	const children = element.props?.children;
	for (const child of Array.isArray(children) ? children : children ? [children] : []) {
		clickableElements(child, found);
	}
	return found;
}

describe("workbench home", () => {
	it("lists every feature with the shared title and subtitle", () => {
		const html = renderToStaticMarkup(
			<WorkbenchHome
				entries={[entry({ id: "first" }), entry({ id: "second", icon: "book-open" })]}
				language="zh"
				onOpen={vi.fn()}
				onOpenSettings={vi.fn()}
			/>,
		);

		const t = createSharedTranslator("zh");
		expect(html).toContain(t("workbench.title"));
		expect(html).toContain(t("workbench.subtitle"));
		expect(html).toContain("first");
		expect(html).toContain("second");
		expect(html).not.toContain(t("workbench.unavailable"));
	});

	it("marks an unavailable feature and offers a way to its settings", () => {
		const onOpenSettings = vi.fn();
		const unavailable = entry({ id: "disabled", available: () => false });
		const tree = WorkbenchHome({
			entries: [unavailable],
			language: "en",
			onOpen: vi.fn(),
			onOpenSettings,
		}) as React.ReactElement;

		const html = renderToStaticMarkup(<>{tree}</>);
		const t = createSharedTranslator("en");
		expect(html).toContain(t("workbench.unavailable"));
		expect(html).toContain(t("workbench.openSettings"));

		const buttons = clickableElements(tree);
		// The entry button is disabled; the settings button is the live one.
		buttons[buttons.length - 1]!.props.onClick();
		expect(onOpenSettings).toHaveBeenCalledWith(unavailable);
	});

	it("opens the feature from its entry button", () => {
		const onOpen = vi.fn();
		const available = entry({ id: "available", title: () => "Available" });
		const tree = WorkbenchHome({
			entries: [available],
			language: "en",
			onOpen,
			onOpenSettings: vi.fn(),
		}) as React.ReactElement;

		clickableElements(tree)[0]!.props.onClick();

		expect(onOpen).toHaveBeenCalledWith(available);
	});

	it("renders an empty list without failing when no feature is registered", () => {
		const html = renderToStaticMarkup(
			<WorkbenchHome entries={[]} language="zh" onOpen={vi.fn()} onOpenSettings={vi.fn()} />,
		);

		expect(html).toContain(createSharedTranslator("zh")("workbench.title"));
	});
});
