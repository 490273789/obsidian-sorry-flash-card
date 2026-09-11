import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../settingsSlices";
import { createWorkbench, type WorkbenchModule, type WorkbenchHost } from "../workbench";

interface FakeRibbon {
	icon: string;
	title: string;
	onClick: () => void;
	remove: ReturnType<typeof vi.fn>;
}

interface FakeCommand {
	id: string;
	name: string;
	hotkeys?: unknown;
	editorCheckCallback?: (checking: boolean, editor: { getSelection(): string }) => boolean;
	callback?: () => void;
}

function createFakePlugin() {
	const ribbonEls: FakeRibbon[] = [];
	const commands = new Map<string, FakeCommand>();
	return {
		ribbonEls,
		commands,
		plugin: {
			registerView: vi.fn(),
			addRibbonIcon: vi.fn((icon: string, title: string, onClick: () => void) => {
				const el: FakeRibbon = { icon, title, onClick, remove: vi.fn() };
				ribbonEls.push(el);
				return el;
			}),
			addCommand: vi.fn((command: FakeCommand) => {
				commands.set(command.id, command);
				return command;
			}),
			removeCommand: vi.fn((id: string) => {
				commands.delete(id);
			}),
		},
	};
}

function createFakeApp() {
	const setViewState = vi.fn().mockResolvedValue(undefined);
	const revealLeaf = vi.fn().mockResolvedValue(undefined);
	const leaf = { setViewState };
	const app = {
		workspace: {
			leaves: {} as Record<string, unknown[]>,
			getLeavesOfType(type: string) {
				return this.leaves[type] ?? [];
			},
			getLeaf: vi.fn(() => leaf),
			getRightLeaf: vi.fn(() => leaf),
			revealLeaf,
		},
	};
	return { app, setViewState, revealLeaf };
}

function setup(modules: WorkbenchModule[]) {
	const fakePlugin = createFakePlugin();
	const fakeApp = createFakeApp();
	const commitSettings = vi.fn().mockResolvedValue(undefined);
	const hosts = new Map<string, WorkbenchHost>();
	const workbench = createWorkbench({
		app: fakeApp.app as never,
		plugin: fakePlugin.plugin as never,
		readSettings: () => DEFAULT_SETTINGS,
		commitSettings,
		// Capture the per-module host the workbench hands out.
		createModules: () =>
			modules.map((entry) => ({
				id: entry.id,
				render: (host: WorkbenchHost) => {
					hosts.set(entry.id, host);
					entry.render(host);
				},
				stop: () => entry.stop(),
			})),
	});
	return {
		...fakePlugin,
		...fakeApp,
		workbench,
		commitSettings,
		host: (id = "f"): WorkbenchHost => hosts.get(id)!,
	};
}

function feature(id: string, render: WorkbenchModule["render"]): WorkbenchModule {
	return { id, render, stop: vi.fn() };
}

describe("workbench", () => {
	it("registers a view once however often the feature re-renders", () => {
		const { plugin, workbench } = setup([
			feature("f", (host) =>
				host.registerView("view-a", () => ({ updateSettings() {} }) as never),
			),
		]);

		workbench.refresh();
		workbench.refresh();
		workbench.refresh();

		expect(plugin.registerView).toHaveBeenCalledTimes(1);
		expect(plugin.registerView).toHaveBeenCalledWith("view-a", expect.any(Function));
	});

	it("rebuilds a feature's chrome and removes the previous ribbon and commands", () => {
		const { plugin, commands, ribbonEls, workbench } = setup([
			feature("f", (host) => {
				host.chrome((chrome) => {
					chrome.ribbon("book-open", "词典", () => {});
					chrome.command({ id: "open-dictionary", name: "词典", run: () => {} });
				});
			}),
		]);

		workbench.refresh();
		expect(ribbonEls).toHaveLength(1);
		expect(ribbonEls[0]!.remove).not.toHaveBeenCalled();
		expect(commands.has("open-dictionary")).toBe(true);

		workbench.refresh();
		expect(ribbonEls).toHaveLength(2);
		expect(ribbonEls[0]!.remove).toHaveBeenCalledTimes(1);
		expect(plugin.removeCommand).toHaveBeenCalledWith("open-dictionary");
		expect(commands.has("open-dictionary")).toBe(true);
	});

	it("clears chrome when a feature stops contributing it", () => {
		let enabled = true;
		const { commands, ribbonEls, workbench } = setup([
			feature("f", (host) => {
				host.chrome((chrome) => {
					if (!enabled) return;
					chrome.ribbon("book-open", "词典", () => {});
					chrome.command({ id: "open-dictionary", name: "词典", run: () => {} });
				});
			}),
		]);

		workbench.refresh();
		enabled = false;
		workbench.refresh();

		expect(ribbonEls[0]!.remove).toHaveBeenCalledTimes(1);
		expect(commands.has("open-dictionary")).toBe(false);
	});

	it("runs a selection command only outside the checking pass and only with a selection", () => {
		const run = vi.fn();
		const { commands, workbench } = setup([
			feature("f", (host) => {
				host.chrome((chrome) => {
					chrome.command({
						id: "translate-selection",
						name: "翻译选区",
						selection: { run },
					});
				});
			}),
		]);
		workbench.refresh();

		const command = commands.get("translate-selection")!;
		expect(command.editorCheckCallback?.(true, { getSelection: () => "  " })).toBe(false);
		expect(command.editorCheckCallback?.(true, { getSelection: () => "word" })).toBe(true);
		expect(run).not.toHaveBeenCalled();
		expect(command.editorCheckCallback?.(false, { getSelection: () => "word" })).toBe(true);
		expect(run).toHaveBeenCalledWith("word");
	});

	it("orders settings sections by their declared position and replaces by id", () => {
		const section = (id: string, order: number) => ({
			id,
			order,
			label: () => id,
			definitions: () => [],
		});
		const { workbench } = setup([
			feature("f", (host) => {
				host.settingsSection(section("flashcards", 0));
				host.settingsSection(section("dictionary", 3));
			}),
		]);
		workbench.addSettingsSection(section("ai", 1));

		workbench.refresh();
		expect(workbench.settingsSections().map((entry) => entry.id)).toEqual([
			"flashcards",
			"ai",
			"dictionary",
		]);

		// Re-registering the same id must replace, not duplicate.
		workbench.refresh();
		expect(workbench.settingsSections()).toHaveLength(3);
	});

	it("pushes committed settings into open views and stops every feature on dispose", () => {
		const updateSettings = vi.fn();
		const stopOrder: string[] = [];
		const firstStop = vi.fn(() => stopOrder.push("first"));
		const secondStop = vi.fn(() => stopOrder.push("second"));
		const features: WorkbenchModule[] = [
			{
				id: "f",
				render: (host) => host.registerView("view-a", () => ({ updateSettings }) as never),
				stop: firstStop,
			},
			{
				id: "g",
				render: (host) => host.registerView("view-b", () => ({}) as never),
				stop: secondStop,
			},
		];
		const { app, workbench } = setup(features);
		app.workspace.leaves["view-a"] = [{ view: { updateSettings } }, { view: {} }];
		app.workspace.leaves["view-b"] = [{ view: {} }];

		workbench.refresh();

		expect(updateSettings).toHaveBeenCalledTimes(1);
		expect(updateSettings).toHaveBeenCalledWith(DEFAULT_SETTINGS);

		workbench.dispose();
		expect(firstStop).toHaveBeenCalledTimes(1);
		expect(secondStop).toHaveBeenCalledTimes(1);
		expect(stopOrder).toEqual(["second", "first"]);
	});

	it("reuses an existing leaf instead of opening a second one", async () => {
		const { app, workbench, setViewState, revealLeaf, host } = setup([
			feature("f", (host) => host.registerView("view-a", () => ({}) as never)),
		]);
		workbench.refresh();

		app.workspace.leaves["view-a"] = [{ view: {} }];
		await host().activateView("view-a");
		expect(revealLeaf).toHaveBeenCalled();
		expect(setViewState).not.toHaveBeenCalled();

		app.workspace.leaves["view-a"] = [];
		await host().activateView("view-a");
		expect(setViewState).toHaveBeenCalledWith({ type: "view-a", active: true });
	});

	it("opens a right-sidebar leaf when asked", async () => {
		const { app, workbench, host } = setup([
			feature("f", (host) => host.registerView("view-a", () => ({}) as never)),
		]);
		workbench.refresh();

		await host().activateView("view-a", { rightSidebar: true });
		expect(app.workspace.getRightLeaf).toHaveBeenCalledWith(false);
	});

	it("commits a settings patch through the host-owned writer", async () => {
		const { workbench, commitSettings, host } = setup([feature("f", () => {})]);
		workbench.refresh();

		const patch = { dictionary: DEFAULT_SETTINGS.dictionary };
		await host().updateSettings(patch);
		expect(commitSettings).toHaveBeenCalledWith(patch);
	});

	it("generates one open command per available catalog entry and keeps its id", () => {
		const openFirst = vi.fn();
		const openSecond = vi.fn();
		const { commands, plugin, workbench } = setup([
			feature("first", (host) =>
				host.catalog({
					id: "first",
					icon: "layers",
					title: () => "First",
					openCommandId: "open-first",
					openHotkeys: [{ modifiers: ["Alt"], key: "W" }],
					settingsSectionId: "first",
					available: () => true,
					open: openFirst,
				}),
			),
			feature("second", (host) =>
				host.catalog({
					id: "second",
					icon: "book-open",
					title: () => "Second",
					openCommandId: "open-second",
					settingsSectionId: "second",
					available: () => false,
					open: openSecond,
				}),
			),
		]);

		workbench.refresh();

		expect([...commands.keys()]).toEqual(["open-first"]);
		expect(commands.get("open-first")!.name).toBe("First");
		expect(commands.get("open-first")!.hotkeys).toEqual([{ modifiers: ["Alt"], key: "W" }]);
		commands.get("open-first")!.callback?.();
		expect(openFirst).toHaveBeenCalledTimes(1);
		expect(openSecond).not.toHaveBeenCalled();
		expect(plugin.addCommand).toHaveBeenCalledTimes(1);
	});

	it("drops the generated command once a feature reports itself unavailable", () => {
		let available = true;
		const { commands, workbench } = setup([
			feature("only", (host) =>
				host.catalog({
					id: "only",
					icon: "languages",
					title: () => "Only",
					openCommandId: "open-only",
					settingsSectionId: "only",
					available: () => available,
					open: vi.fn(),
				}),
			),
		]);

		workbench.refresh();
		expect(commands.has("open-only")).toBe(true);

		available = false;
		workbench.refresh();
		expect(commands.has("open-only")).toBe(false);
	});

	it("exposes catalog entries in feature order and replaces them by id", () => {
		const { workbench, host } = setup([
			feature("a", (h) =>
				h.catalog({
					id: "a",
					icon: "a",
					title: () => "A",
					openCommandId: "open-a",
					settingsSectionId: "a",
					available: () => true,
					open: vi.fn(),
				}),
			),
			feature("b", (h) =>
				h.catalog({
					id: "b",
					icon: "b",
					title: () => "B",
					openCommandId: "open-b",
					settingsSectionId: "b",
					available: () => true,
					open: vi.fn(),
				}),
			),
		]);

		workbench.refresh();
		expect(workbench.catalog().map((entry) => entry.id)).toEqual(["a", "b"]);

		// A second render must replace, not duplicate.
		workbench.refresh();
		expect(workbench.catalog()).toHaveLength(2);
		void host;
	});

	it("rebuilds the workbench ring chrome and clears it on dispose", () => {
		const { plugin, ribbonEls, commands, workbench } = setup([feature("f", () => {})]);
		workbench.ring((chrome) => {
			chrome.ribbon("layout-grid", "Home", () => {});
			chrome.command({ id: "open-home", name: "Home", run: () => {} });
		});

		workbench.refresh();
		expect(ribbonEls).toHaveLength(1);
		expect(commands.has("open-home")).toBe(true);

		// The ring is rebuilt with everything else, so it relabels on a language change.
		workbench.refresh();
		expect(ribbonEls).toHaveLength(2);
		expect(ribbonEls[0]!.remove).toHaveBeenCalledTimes(1);
		expect(plugin.removeCommand).toHaveBeenCalledWith("open-home");

		workbench.dispose();
		expect(ribbonEls[1]!.remove).toHaveBeenCalledTimes(1);
		expect(commands.has("open-home")).toBe(false);
	});

	it("opens available feature directly or opens settings when unavailable via host.openFeature", () => {
		const openAvailable = vi.fn();
		const openUnavailable = vi.fn();
		const mockSettingsTab = {
			refresh: vi.fn(),
			select: vi.fn(),
			open: vi.fn(),
		};

		const { workbench, host } = setup([
			feature("avail", (h) =>
				h.catalog({
					id: "avail",
					icon: "a",
					title: () => "Available",
					openCommandId: "open-avail",
					settingsSectionId: "sec-avail",
					available: () => true,
					open: openAvailable,
				}),
			),
			feature("unavail", (h) =>
				h.catalog({
					id: "unavail",
					icon: "u",
					title: () => "Unavailable",
					openCommandId: "open-unavail",
					settingsSectionId: "sec-unavail",
					available: () => false,
					open: openUnavailable,
				}),
			),
		]);

		workbench.setSettingsTab(mockSettingsTab);
		workbench.refresh();

		const h = host("avail");
		h.openFeature("avail");
		expect(openAvailable).toHaveBeenCalledTimes(1);
		expect(mockSettingsTab.open).not.toHaveBeenCalled();

		h.openFeature("unavail");
		expect(openUnavailable).not.toHaveBeenCalled();
		expect(mockSettingsTab.open).toHaveBeenCalledWith("sec-unavail");
	});
});
