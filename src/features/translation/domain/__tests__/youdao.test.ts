import { describe, expect, it, vi } from "vitest";
import { translateYoudao, youdaoV3SignInput } from "../youdao";

const connection = {
	baseUrl: "https://openapi.youdao.com/api",
	appKeySecretId: "app-key",
	appSecretSecretId: "app-secret",
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("translateYoudao", () => {
	it("signs and sends the documented v3 form request", async () => {
		const request = vi.fn().mockResolvedValue({
			status: 200,
			text: JSON.stringify({ errorCode: "0", translation: ["hello"] }),
		});
		await expect(
			translateYoudao(connection, "你好", "zh-en", {
				request,
				readSecret: (id) => (id === "app-key" ? "key" : "secret"),
			}),
		).resolves.toEqual({ text: "hello", usage: null });
		const form = new URLSearchParams(request.mock.calls[0]![0].body);
		expect(request).toHaveBeenCalledWith(
			expect.objectContaining({
				url: connection.baseUrl,
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			}),
		);
		expect(form.get("from")).toBe("zh-CHS");
		expect(form.get("to")).toBe("en");
		expect(form.get("signType")).toBe("v3");
	});

	it("uses code points in the v3 signing input and safely maps failures", async () => {
		expect(youdaoV3SignInput("😀".repeat(21))).toBe(`${"😀".repeat(10)}21${"😀".repeat(10)}`);
		await expect(
			translateYoudao(connection, "hello", "en-zh", {
				request: async () => ({ status: 200, text: JSON.stringify({ errorCode: "411" }) }),
				readSecret: () => "secret",
			}),
		).rejects.toMatchObject({ code: "rate-limited" });
	});

	it("times out after two minutes and ignores a late transport result", async () => {
		vi.useFakeTimers();
		const gate = deferred<{ status: number; text: string }>();
		const pending = translateYoudao(connection, "hello", "en-zh", {
			request: () => gate.promise,
			readSecret: () => "secret",
		});
		const rejection = expect(pending).rejects.toMatchObject({ code: "timeout" });
		await vi.advanceTimersByTimeAsync(120_000);
		await rejection;
		gate.resolve({
			status: 200,
			text: JSON.stringify({ errorCode: "0", translation: ["迟到"] }),
		});
		await Promise.resolve();
		vi.useRealTimers();
	});
});
