import { vi } from "vitest";
import type { FlashcardSettings } from "../../shared/types";
import type {
	WorkbenchChromeScope,
	WorkbenchCommand,
	WorkbenchHost,
	WorkbenchSettingsSection,
} from "../workbench";

export interface FakeWorkbenchHost {
	host: WorkbenchHost;
	views: Map<string, unknown>;
	sections: Map<string, WorkbenchSettingsSection>;
	ribbons: { icon: string; title: string; onClick: () => void }[];
	commands: WorkbenchCommand[];
	activateView: ReturnType<typeof vi.fn>;
	updateSettings: ReturnType<typeof vi.fn>;
	settingsTab: { refresh: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> };
}

/**
 * Records everything a feature contributes through the workbench seam, so a
 * feature's interface can be asserted without Obsidian or a real workbench.
 */
export function createFakeWorkbenchHost(
	settings: FlashcardSettings,
	app: unknown = { workspace: { getLeavesOfType: () => [] } },
): FakeWorkbenchHost {
	const views = new Map<string, unknown>();
	const sections = new Map<string, WorkbenchSettingsSection>();
	const ribbons: FakeWorkbenchHost["ribbons"] = [];
	const commands: WorkbenchCommand[] = [];
	const activateView = vi.fn().mockResolvedValue(undefined);
	const updateSettings = vi.fn().mockResolvedValue(undefined);
	const settingsTab = { refresh: vi.fn(), select: vi.fn(), open: vi.fn() };

	const host = {
		app,
		settings: () => settings,
		settingsTab,
		registerView: (type: string, factory: unknown) => views.set(type, factory),
		chrome: (build: (scope: WorkbenchChromeScope) => void) => {
			const scoped: WorkbenchChromeScope = {
				ribbon: (icon, title, onClick) => ribbons.push({ icon, title, onClick }),
				command: (spec) => commands.push(spec),
			};
			// Chrome is rebuilt on every render; model that by clearing first.
			ribbons.length = 0;
			commands.length = 0;
			build(scoped);
		},
		activateView,
		updateSettings,
		settingsSection: (section: WorkbenchSettingsSection) => sections.set(section.id, section),
	} as unknown as WorkbenchHost;

	return {
		host,
		views,
		sections,
		ribbons,
		commands,
		activateView,
		updateSettings,
		settingsTab,
	};
}
