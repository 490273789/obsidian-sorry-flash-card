import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { dictionaryStrings } from "../../i18n/dictionary";
import { createDictionaryFeature } from "../features/dictionary";
import { createFakeWorkbenchHost } from "./fakeWorkbenchHost";

vi.mock("obsidian", () => ({
	ItemView: class {},
	Notice: class {},
	Platform: { isDesktopApp: false },
	requestUrl: vi.fn(),
}));

const runtimeSpies = vi.hoisted(() => ({ instances: [] as unknown[] }));

vi.mock("../../dictionary/dictionaryRuntime", () => ({
	DictionaryRuntime: class {
		readonly controller = {
			prefill: vi.fn(),
			lookup: vi.fn(),
			resetSession: vi.fn(),
		};
		readonly favoriteController = { prefill: vi.fn(), resetSession: vi.fn() };
		readonly dispose = vi.fn();
		readonly applySettings = vi.fn();
		constructor() {
			runtimeSpies.instances.push(this);
		}
	},
}));

vi.mock("../dictionaryModals", () => ({
	DictionaryLookupModal: class {
		open() {}
		close() {}
	},
}));

const enabledSettings = {
	...DEFAULT_SETTINGS,
	dictionary: { ...DEFAULT_SETTINGS.dictionary, enabled: true },
};

describe("dictionary feature", () => {
	beforeEach(() => {
		runtimeSpies.instances.length = 0;
	});

	it("registers its two views, its chrome, and its settings section", () => {
		const feature = createDictionaryFeature({ ai: {} as never, plugin: {} as never });
		const fake = createFakeWorkbenchHost(enabledSettings);

		feature.render(fake.host);

		expect([...fake.views.keys()]).toEqual([
			"flashcard-dictionary-view",
			"flashcard-dictionary-favorite-view",
		]);
		expect(fake.ribbons).toEqual([
			{
				icon: "book-open",
				title: dictionaryStrings("zh").openCommand,
				onClick: expect.any(Function),
			},
		]);
		expect(fake.commands.map((command) => command.id)).toEqual([
			"open-dictionary",
			"dictionary-lookup-selection",
		]);
		expect([...fake.sections.keys()]).toEqual(["dictionary"]);
		// The section keeps the historical position after the AI 翻译 section.
		expect(fake.sections.get("dictionary")!.order).toBe(3);
		expect(fake.sections.get("dictionary")!.label("zh")).toBe(
			dictionaryStrings("zh").settingsHeading,
		);

		feature.stop();
	});

	it("keeps its views and settings section but adds no chrome while disabled", () => {
		const feature = createDictionaryFeature({ ai: {} as never, plugin: {} as never });
		const fake = createFakeWorkbenchHost({
			...DEFAULT_SETTINGS,
			dictionary: { ...DEFAULT_SETTINGS.dictionary, enabled: false },
		});

		feature.render(fake.host);

		expect(fake.ribbons).toEqual([]);
		expect(fake.commands).toEqual([]);
		expect([...fake.views.keys()]).toHaveLength(2);
		expect([...fake.sections.keys()]).toEqual(["dictionary"]);

		feature.stop();
	});

	it("builds one runtime, applies settings on every render, and disposes it on stop", () => {
		const feature = createDictionaryFeature({ ai: {} as never, plugin: {} as never });
		const fake = createFakeWorkbenchHost(enabledSettings);

		feature.render(fake.host);
		feature.render(fake.host);

		expect(runtimeSpies.instances).toHaveLength(1);
		const runtime = runtimeSpies.instances[0] as {
			applySettings: { mock: { calls: unknown[] } };
			dispose: { mock: { calls: unknown[] } };
		};
		// Committed settings must reach the runtime on every render, the way the
		// composition root used to call applySettings() after publishing settings.
		expect(runtime.applySettings.mock.calls).toHaveLength(2);

		feature.stop();
		expect(runtime.dispose.mock.calls).toHaveLength(1);
	});
});
