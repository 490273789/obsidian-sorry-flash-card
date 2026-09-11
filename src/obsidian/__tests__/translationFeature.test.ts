import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { translationStrings } from "../../i18n/translation";
import { translationSettingsStrings } from "../../i18n/translationSettings";
import { Notice } from "obsidian";
import { createTranslationFeature } from "../features/translation";
import { createFakeWorkbenchHost } from "./fakeWorkbenchHost";

vi.mock("obsidian", () => ({
	Notice: vi.fn(),
	requestUrl: vi.fn(),
}));

const runtimeSpies = vi.hoisted(() => ({ instances: [] as unknown[] }));

vi.mock("../../translation/translationRuntime", () => ({
	TranslationRuntime: class {
		readonly prefill = vi.fn();
		readonly dispose = vi.fn();
		readonly subscribe = vi.fn(() => () => {});
		readonly configure = vi.fn();
		readonly testYoudao = vi.fn();
		readonly getSnapshot = () => ({
			settings: {
				enabled: true,
				direction: "zh-en",
				promptTemplate: "",
				profiles: [],
			},
			input: "",
			results: [],
			status: "idle",
			saving: false,
			testing: false,
		});
		constructor() {
			runtimeSpies.instances.push(this);
		}
	},
}));

vi.mock("../TranslatorView", () => ({
	TranslatorItemView: class {},
	VIEW_TYPE_TRANSLATOR: "flashcard-translator-view",
}));

const enabledSettings = {
	...DEFAULT_SETTINGS,
	translation: { ...DEFAULT_SETTINGS.translation, enabled: true },
};

function lastRuntime(): { prefill: { mock: { calls: unknown[] } } } {
	return runtimeSpies.instances[runtimeSpies.instances.length - 1] as never;
}

describe("translation feature", () => {
	beforeEach(() => {
		runtimeSpies.instances.length = 0;
		vi.mocked(Notice).mockClear();
	});

	it("registers its view, its chrome, and its settings section", () => {
		const feature = createTranslationFeature({ ai: {} as never });
		const fake = createFakeWorkbenchHost(enabledSettings);

		feature.render(fake.host);

		expect([...fake.views.keys()]).toEqual(["flashcard-translator-view"]);
		expect(fake.ribbons.map((ribbon) => ribbon.icon)).toEqual(["languages"]);
		expect(fake.commands.map((command) => command.id)).toEqual([
			"open-ai-translator",
			"translate-selection",
		]);
		expect(fake.sections.get("translation")!.order).toBe(2);
		expect(fake.sections.get("translation")!.label("zh")).toBe(
			translationSettingsStrings("zh").heading,
		);

		feature.stop();
	});

	it("adds no chrome while translation is disabled", () => {
		const feature = createTranslationFeature({ ai: {} as never });
		const fake = createFakeWorkbenchHost({
			...DEFAULT_SETTINGS,
			translation: { ...DEFAULT_SETTINGS.translation, enabled: false },
		});

		feature.render(fake.host);

		expect(fake.ribbons).toEqual([]);
		expect(fake.commands).toEqual([]);
		expect([...fake.views.keys()]).toEqual(["flashcard-translator-view"]);

		feature.stop();
	});

	it("only prefills the selection, without translating or touching the note", () => {
		const feature = createTranslationFeature({ ai: {} as never });
		const fake = createFakeWorkbenchHost(enabledSettings);
		feature.render(fake.host);

		const command = fake.commands.find((entry) => entry.id === "translate-selection")!;
		expect(command.selection).toBeDefined();
		command.selection!.run("selected text");

		expect(lastRuntime().prefill.mock.calls).toEqual([["selected text"]]);
		expect(fake.activateView).toHaveBeenCalledWith("flashcard-translator-view");

		feature.stop();
	});

	it("reports a view open failure without rejecting", async () => {
		const feature = createTranslationFeature({ ai: {} as never });
		const fake = createFakeWorkbenchHost(enabledSettings);
		fake.activateView.mockRejectedValue(new Error("private diagnostic"));
		feature.render(fake.host);

		const command = fake.commands.find((entry) => entry.id === "open-ai-translator")!;
		expect(() => command.run!()).not.toThrow();
		await vi.waitFor(() => {
			expect(Notice).toHaveBeenLastCalledWith(translationStrings("zh").openFailed);
		});

		feature.stop();
	});

	it("builds one runtime and disposes it on stop", () => {
		const feature = createTranslationFeature({ ai: {} as never });
		const fake = createFakeWorkbenchHost(enabledSettings);

		feature.render(fake.host);
		feature.render(fake.host);
		expect(runtimeSpies.instances).toHaveLength(1);

		feature.stop();
		expect(
			(runtimeSpies.instances[0] as { dispose: { mock: { calls: unknown[] } } }).dispose.mock
				.calls,
		).toHaveLength(1);
	});
});
