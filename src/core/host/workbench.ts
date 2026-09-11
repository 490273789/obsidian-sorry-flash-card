import type { App, Command, Editor, Hotkey, ItemView, Plugin, WorkspaceLeaf } from "obsidian";
import type { SettingsViewModelDefinition } from "../../features/flashcards/settings/viewModel";
import type { FlashcardSettings, Language } from "../shared/types";

/**
 * One unit of learning capability hosted by the workbench.
 *
 * `render` is the single entry point and must be idempotent: the workbench calls
 * it once at startup and again after every committed settings change. Views are
 * registered once by the host; chrome is rebuilt on every call.
 */
export interface WorkbenchFeature {
	readonly id: string;
	render(host: WorkbenchHost): void;
	/** Releases feature-owned resources: runtimes, subscriptions, timers, modals. */
	stop(): void;
}

export interface WorkbenchCommand {
	id: string;
	name: string;
	hotkeys?: Hotkey[];
	/** Set for commands that only run with a non-empty editor selection. */
	selection?: { run(selection: string): void };
	/** Set for commands that take no selection. */
	run?(): void;
}

export interface WorkbenchChromeScope {
	/** At most one ribbon icon per feature; a later call replaces the earlier one. */
	ribbon(icon: string, title: string, onClick: () => void): void;
	command(spec: WorkbenchCommand): void;
}

/**
 * How one feature presents itself in the workbench: what it is called, which icon
 * represents it, and how to open it.
 *
 * Pushed on every render, exactly like a settings section, so a feature that is
 * currently disabled simply reports itself as unavailable instead of the host
 * guessing from settings.
 */
export interface WorkbenchCatalogEntry {
	/** Feature id; the same id replaces the previous entry. */
	id: string;
	title(language: Language): string;
	icon: string;
	/**
	 * Command id for the host-generated "open" command. Features keep the id they
	 * have always used so user-assigned hotkeys survive.
	 */
	openCommandId: string;
	/** Default hotkeys for the generated open command. */
	openHotkeys?: Hotkey[];
	/** Settings section that configures this feature; the home links to it. */
	settingsSectionId: string;
	/** Whether the feature currently offers an entry point. */
	available(): boolean;
	/** Opens or focuses the feature's primary view. */
	open(): void;
}

/** One section of the plugin settings tab, contributed by a feature or the host. */
export interface WorkbenchSettingsSection {
	id: string;
	/** Position in the settings tab; lower comes first. */
	order: number;
	label(language: Language): string;
	/** The live definition tree, rebuilt on every render. */
	definitions(language: Language): SettingsViewModelDefinition[];
	activate?(): void;
	hide?(): void;
}

/**
 * An Obsidian view owned by a feature. Committed settings are pushed in through
 * this method after every settings change, so features do not walk leaves.
 */
export interface WorkbenchItemView extends ItemView {
	updateSettings(settings: FlashcardSettings): void;
}

/**
 * The host's settings tab, as features see it: the tab itself owns section
 * selection, re-rendering, and opening Obsidian settings.
 */
export interface WorkbenchSettingsTab {
	/** Re-renders the settings tab in place. */
	refresh(): void;
	/** Selects a section for the next render. */
	select(sectionId: string): void;
	/** Opens the plugin settings, optionally selecting a section first. */
	open(sectionId?: string): void;
}

/**
 * The capabilities a feature may use. Deliberately narrow: the host owns
 * registration, activation, chrome lifetime, the settings document, and the
 * settings tab. Shared services reach features through their factory, not here.
 */
export interface WorkbenchHost {
	/** The Obsidian application, for vault, workspace, and secret access. */
	readonly app: App;
	/** The committed settings document. */
	settings(): FlashcardSettings;
	/** The plugin settings tab. */
	readonly settingsTab: WorkbenchSettingsTab;
	/** Registers one Obsidian view. Repeated calls for the same type are ignored. */
	registerView(type: string, factory: (leaf: WorkspaceLeaf) => WorkbenchItemView): void;
	/** Rebuilds this feature's chrome; the previous ribbon and commands are removed first. */
	chrome(build: (chrome: WorkbenchChromeScope) => void): void;
	/** Opens or focuses one of this feature's views. */
	activateView(type: string, options?: { rightSidebar?: boolean }): Promise<void>;
	/** Commits a patch of this feature's own settings slices in one durable write. */
	updateSettings(patch: Partial<FlashcardSettings>): Promise<void>;
	/** Contributes a settings section for this feature. Same id replaces the previous one. */
	settingsSection(section: WorkbenchSettingsSection): void;
	/** Contributes this feature's catalog entry. Same id replaces the previous one. */
	catalog(entry: WorkbenchCatalogEntry): void;
}

export interface Workbench {
	/** Re-renders every registered feature against committed settings. */
	refresh(): void;
	/** Contributes a host-owned shared settings section, such as AI engines. */
	addSettingsSection(section: WorkbenchSettingsSection): void;
	/** Settings sections from the host and every feature, ordered. */
	settingsSections(): WorkbenchSettingsSection[];
	/** Catalog entries of every feature, in feature order. */
	catalog(): WorkbenchCatalogEntry[];
	/**
	 * Declares the workbench's own chrome (its ribbon and commands). Rebuilt on
	 * every refresh like a feature's chrome, so it relabels on a language change.
	 */
	ring(build: (chrome: WorkbenchChromeScope) => void): void;
	/** The settings tab registers itself here so features can reach it. */
	setSettingsTab(tab: WorkbenchSettingsTab): void;
	/** The settings-tab capability, for host-owned sections created outside features. */
	readonly settingsTab: WorkbenchSettingsTab;
	/** Releases every feature. */
	dispose(): void;
}

export interface WorkbenchOptions {
	app: App;
	plugin: Plugin;
	readSettings(): FlashcardSettings;
	/** Commits a settings patch; must publish the committed settings on success. */
	commitSettings(patch: Partial<FlashcardSettings>): Promise<void>;
	createFeatures(): WorkbenchFeature[];
}

interface FeatureChrome {
	ribbonEl: HTMLElement | null;
	commandIds: string[];
}

export function createWorkbench(options: WorkbenchOptions): Workbench {
	const registeredViewTypes = new Set<string>();
	const chromeByFeature = new Map<string, FeatureChrome>();
	const hostsByFeature = new Map<string, WorkbenchHost>();
	const sectionsById = new Map<string, WorkbenchSettingsSection>();
	const catalogById = new Map<string, WorkbenchCatalogEntry>();
	/** Command ids the host generated for the previous catalog, so it can clean up. */
	let catalogCommandIds: string[] = [];
	/** Chrome id reserved for the workbench's own ribbon and commands. */
	const HOST_CHROME_ID = "\u0000workbench-host";
	let ringBuilder: ((chrome: WorkbenchChromeScope) => void) | null = null;
	const features = options.createFeatures();
	let settingsTab: WorkbenchSettingsTab | null = null;
	let disposed = false;

	const settingsTabCapability: WorkbenchSettingsTab = {
		refresh: () => settingsTab?.refresh(),
		select: (sectionId) => settingsTab?.select(sectionId),
		open: (sectionId) => settingsTab?.open(sectionId),
	};

	const removeChrome = (featureId: string): void => {
		const chrome = chromeByFeature.get(featureId);
		if (!chrome) return;
		chrome.ribbonEl?.remove();
		for (const id of chrome.commandIds) options.plugin.removeCommand(id);
		chromeByFeature.set(featureId, { ribbonEl: null, commandIds: [] });
	};

	const hostFor = (featureId: string): WorkbenchHost => {
		const existing = hostsByFeature.get(featureId);
		if (existing) return existing;

		const host: WorkbenchHost = {
			app: options.app,

			settings: () => options.readSettings(),

			settingsTab: settingsTabCapability,

			registerView: (type, factory) => {
				if (registeredViewTypes.has(type)) return;
				registeredViewTypes.add(type);
				options.plugin.registerView(type, (leaf) => factory(leaf));
			},

			chrome: (build) => {
				removeChrome(featureId);
				const chrome: FeatureChrome = { ribbonEl: null, commandIds: [] };
				chromeByFeature.set(featureId, chrome);
				build({
					ribbon: (icon, title, onClick) => {
						chrome.ribbonEl?.remove();
						chrome.ribbonEl = options.plugin.addRibbonIcon(icon, title, onClick);
					},
					command: (spec) => {
						chrome.commandIds.push(spec.id);
						options.plugin.addCommand(toObsidianCommand(spec));
					},
				});
			},

			activateView: (type, activateOptions) =>
				activateView(options.app, type, activateOptions?.rightSidebar === true),

			updateSettings: async (patch) => {
				await options.commitSettings(patch);
			},

			settingsSection: (section) => {
				sectionsById.set(section.id, section);
			},

			catalog: (entry) => {
				catalogById.set(entry.id, entry);
			},
		};

		hostsByFeature.set(featureId, host);
		return host;
	};

	/**
	 * Rebuilds the host-generated chrome from the catalog: one "open" command per
	 * feature that currently offers an entry point.
	 */
	const rebuildCatalogCommands = (): void => {
		const entries = [...catalogById.values()];
		for (const id of catalogCommandIds) options.plugin.removeCommand(id);
		catalogCommandIds = [];
		const language = options.readSettings().language;
		for (const entry of entries) {
			if (!entry.available()) continue;
			catalogCommandIds.push(entry.openCommandId);
			options.plugin.addCommand({
				id: entry.openCommandId,
				name: entry.title(language),
				hotkeys: entry.openHotkeys,
				callback: () => entry.open(),
			});
		}
	};

	const pushSettingsToOpenViews = (): void => {
		const settings = options.readSettings();
		for (const type of registeredViewTypes) {
			for (const leaf of options.app.workspace.getLeavesOfType(type)) {
				const view = leaf.view as Partial<WorkbenchItemView>;
				if (typeof view.updateSettings !== "function") continue;
				try {
					view.updateSettings(settings);
				} catch (error) {
					console.error(
						`Failed to refresh the ${type} view after settings changed:`,
						error,
					);
				}
			}
		}
	};

	return {
		refresh: () => {
			if (disposed) return;
			for (const feature of features) {
				try {
					feature.render(hostFor(feature.id));
				} catch (error) {
					console.error(`Failed to render the ${feature.id} feature:`, error);
				}
			}
			rebuildCatalogCommands();
			if (ringBuilder) hostFor(HOST_CHROME_ID).chrome(ringBuilder);
			pushSettingsToOpenViews();
		},

		addSettingsSection: (section) => {
			sectionsById.set(section.id, section);
		},

		settingsSections: () => [...sectionsById.values()].sort((a, b) => a.order - b.order),

		// Feature order is the order the composition module lists them in, which is
		// also the order features render in.
		catalog: () => [...catalogById.values()],

		ring: (build) => {
			ringBuilder = build;
		},

		setSettingsTab: (tab) => {
			settingsTab = tab;
		},

		settingsTab: settingsTabCapability,

		dispose: () => {
			if (disposed) return;
			disposed = true;
			for (const feature of features) {
				try {
					feature.stop();
				} catch (error) {
					console.error(`Failed to stop the ${feature.id} feature:`, error);
				}
			}
			for (const feature of features) removeChrome(feature.id);
			removeChrome(HOST_CHROME_ID);
			for (const id of catalogCommandIds) options.plugin.removeCommand(id);
			catalogCommandIds = [];
		},
	};
}

async function activateView(app: App, type: string, rightSidebar: boolean): Promise<void> {
	const workspace = app.workspace;
	let leaf = workspace.getLeavesOfType(type)[0];
	if (!leaf) {
		leaf = rightSidebar
			? (workspace.getRightLeaf(false) ?? workspace.getLeaf("tab"))
			: workspace.getLeaf("tab");
		await leaf.setViewState({ type, active: true });
	}
	await workspace.revealLeaf(leaf);
}

function toObsidianCommand(spec: WorkbenchCommand): Command {
	const base: Command = { id: spec.id, name: spec.name };
	if (spec.hotkeys) base.hotkeys = spec.hotkeys;
	if (spec.selection) {
		const selection = spec.selection;
		return {
			...base,
			editorCheckCallback: (checking: boolean, editor: Editor) => {
				const text = editor.getSelection();
				if (!text.trim()) return false;
				if (!checking) selection.run(text);
				return true;
			},
		};
	}
	return { ...base, callback: () => spec.run?.() };
}
