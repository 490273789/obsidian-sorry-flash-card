import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SelectionListener } from "../selectionListener";

describe("SelectionListener", () => {
	let addEventListenerSpy: ReturnType<typeof vi.fn>;
	let removeEventListenerSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		addEventListenerSpy = vi.fn();
		removeEventListenerSpy = vi.fn();

		vi.stubGlobal("document", {
			addEventListener: addEventListenerSpy,
			removeEventListener: removeEventListenerSpy,
			createElement: vi.fn(() => ({
				className: "",
				appendChild: vi.fn(),
				remove: vi.fn(),
			})),
			body: { appendChild: vi.fn() },
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("registers mouseup, mousedown, and scroll listeners on start", () => {
		const listener = new SelectionListener({
			plugin: {} as never,
			getSettings: () => ({ enabled: true, modifier: "none" }),
			getLanguage: () => "zh",
			getDictionaryController: () => null,
			isDictionaryAvailable: () => true,
			isTranslationAvailable: () => true,
			onLookupStart: vi.fn(),
			onTranslate: vi.fn(),
			onOpenDictionaryInMainTab: vi.fn(),
		});

		listener.start();
		expect(addEventListenerSpy).toHaveBeenCalledWith("mouseup", expect.any(Function));
		expect(addEventListenerSpy).toHaveBeenCalledWith("mousedown", expect.any(Function), true);
		expect(addEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true);

		listener.stop();
		expect(removeEventListenerSpy).toHaveBeenCalledWith("mouseup", expect.any(Function));
		expect(removeEventListenerSpy).toHaveBeenCalledWith(
			"mousedown",
			expect.any(Function),
			true,
		);
		expect(removeEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true);
	});
});
