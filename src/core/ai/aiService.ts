import { cleanAiConfig, normalizeAiSettings, validateAiConnection } from "./configuration";
import {
	callAiJson,
	encodeMessages,
	fetchAiModels,
	knownImageInput,
	readUsage,
	readTextResponse,
} from "./providers";
import {
	AiError,
	type AiDependencies,
	type AiEngineConfig,
	type AiGenerateRequest,
	type AiModel,
	type AiRequestOptions,
	type AiSettings,
	type AiSnapshot,
	type AiTextResult,
} from "./types";

export class AiService {
	private settings: AiSettings;
	private models = new Map<string, AiModel[]>();
	private loadingModels = new Set<string>();
	private testing = new Set<string>();
	private listeners = new Set<() => void>();
	private cancellations = new Set<() => void>();
	private writes: Promise<unknown> = Promise.resolve();
	private disposed = false;
	private snapshot!: AiSnapshot;

	constructor(
		settings: unknown,
		private readonly deps: AiDependencies,
	) {
		this.settings = normalizeAiSettings(settings);
		this.publish();
	}

	getSnapshot = (): AiSnapshot => this.snapshot;
	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	async saveConfig(input: Omit<AiEngineConfig, "id"> & { id?: string }): Promise<string> {
		const updating = input.id !== undefined;
		const id = input.id ?? this.deps.createId();
		const config = cleanAiConfig({ ...input, id });
		await this.write((next) => {
			const index = next.configs.findIndex((item) => item.id === id);
			if (updating && index < 0) throw new AiError("config-not-found");
			if (index < 0) next.configs.push(config);
			else next.configs[index] = config;
		});
		return id;
	}

	async deleteConfig(id: string): Promise<void> {
		await this.write((next) => {
			if (!next.configs.some((config) => config.id === id))
				throw new AiError("config-not-found");
			next.configs = next.configs.filter((config) => config.id !== id);
			if (next.defaultConfigId === id) next.defaultConfigId = null;
		});
	}

	async setDefault(id: string | null): Promise<void> {
		await this.write((next) => {
			if (id !== null && !next.configs.some((config) => config.id === id))
				throw new AiError("config-not-found");
			next.defaultConfigId = id;
		});
	}

	async generate(request: AiGenerateRequest): Promise<AiTextResult> {
		this.assertActive();
		const config = this.resolve(request.configId);
		const messages = encodeMessages(request.messages);
		const imageInput =
			this.models.get(connectionKey(config))?.find((item) => item.id === config.model)
				?.imageInput ?? knownImageInput(config);
		if (
			request.messages.some((message) => message.images?.length) &&
			imageInput === "unsupported"
		)
			throw new AiError("unsupported-image");
		return this.run(request, async (check) => {
			const body: Record<string, unknown> = {
				model: config.model,
				messages,
				stream: false,
			};
			if (request.thinkingEnabled !== undefined) {
				if (config.provider === "deepseek")
					body.thinking = { type: request.thinkingEnabled ? "enabled" : "disabled" };
				if (config.provider === "bailian") body.enable_thinking = request.thinkingEnabled;
			}
			if (request.jsonMode) body.response_format = { type: "json_object" };
			const data = await callAiJson(
				this.deps,
				config,
				`${config.baseUrl}/chat/completions`,
				body,
				check,
			);
			const usage = readUsage(data);
			return {
				text: readTextResponse(data),
				configId: config.id,
				model: config.model,
				...(usage === undefined ? {} : { usage }),
			};
		});
	}

	async testConnection(
		target: string | AiEngineConfig,
		options: AiRequestOptions = {},
	): Promise<void> {
		this.assertActive();
		const config =
			typeof target === "string"
				? this.resolve(target)
				: cleanAiConfig({ ...target, name: target.name.trim() || "Test" });
		const testingKey = typeof target === "string" ? config.id : target.id;
		if (this.testing.has(testingKey)) throw new AiError("busy");
		this.testing.add(testingKey);
		this.publish();
		try {
			await this.run(options, async (check) => {
				const messages = encodeMessages([{ role: "user", text: "Reply with OK." }]);
				const data = await callAiJson(
					this.deps,
					config,
					`${config.baseUrl}/chat/completions`,
					{ model: config.model, messages, stream: false },
					check,
				);
				readTextResponse(data);
			});
		} finally {
			this.testing.delete(testingKey);
			this.publish();
		}
	}

	/** Can query a draft connection before choosing a model or saving it. */
	async listModels(config: AiEngineConfig, options: AiRequestOptions = {}): Promise<AiModel[]> {
		this.assertActive();
		const captured = { ...config, baseUrl: config.baseUrl.trim().replace(/\/+$/, "") };
		validateAiConnection(captured);
		if (this.loadingModels.has(captured.id)) throw new AiError("busy");
		this.loadingModels.add(captured.id);
		this.publish();
		try {
			const models = await this.run(options, (check) =>
				fetchAiModels(this.deps, captured, check),
			);
			// Cache by connection so draft discovery survives saving under a new ID.
			// Snapshots only expose catalogues matching currently committed connections.
			this.models.set(
				connectionKey(captured),
				models.map((model) => ({ ...model })),
			);
			return models;
		} finally {
			this.loadingModels.delete(captured.id);
			this.publish();
		}
	}

	dispose(): void {
		this.disposed = true;
		for (const cancel of this.cancellations) cancel();
		this.listeners.clear();
	}

	/** Replace settings after Obsidian Sync updates the shared data.json document. */
	replaceSettings(settings: unknown): void {
		this.assertActive();
		const next = normalizeAiSettings(settings);
		for (const previous of this.settings.configs) {
			if (!next.configs.some((current) => connectionKey(current) === connectionKey(previous)))
				this.models.delete(connectionKey(previous));
		}
		this.settings = next;
		this.publish();
	}

	private resolve(id: string | undefined): AiEngineConfig {
		const selected = id === undefined ? this.settings.defaultConfigId : id;
		if (selected === null) throw new AiError("no-default");
		const config = this.settings.configs.find((item) => item.id === selected);
		if (!config) throw new AiError("config-not-found");
		return cleanAiConfig(config);
	}

	private async write(change: (settings: AiSettings) => void): Promise<void> {
		const write = this.writes.then(() => this.commit(change));
		this.writes = write.catch(() => {});
		return write;
	}

	private async commit(change: (settings: AiSettings) => void): Promise<void> {
		this.assertActive();
		const next = normalizeAiSettings(this.settings);
		change(next);
		try {
			await this.deps.persist(normalizeAiSettings(next));
		} catch {
			throw new AiError("save-failed");
		}
		for (const previous of this.settings.configs) {
			if (!next.configs.some((current) => connectionKey(current) === connectionKey(previous)))
				this.models.delete(connectionKey(previous));
		}
		this.settings = next;
		this.publish();
	}

	private run<T>(options: AiRequestOptions, work: (check: () => void) => Promise<T>): Promise<T> {
		this.assertActive();
		const timeout = options.timeoutMs ?? 120_000;
		const signal = options.signal;
		if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647)
			return Promise.reject(new AiError("invalid-input"));
		if (signal?.aborted) return Promise.reject(new AiError("cancelled"));
		return new Promise<T>((resolve, reject) => {
			let done = false;
			const finish = (error?: unknown, result?: T) => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				signal?.removeEventListener("abort", cancel);
				this.cancellations.delete(cancel);
				if (error) reject(error instanceof AiError ? error : new AiError("network"));
				else resolve(result!);
			};
			const cancel = () => finish(new AiError("cancelled"));
			const timer = setTimeout(() => finish(new AiError("timeout")), timeout);
			this.cancellations.add(cancel);
			signal?.addEventListener("abort", cancel, { once: true });
			const check = () => {
				if (done) throw new AiError("cancelled");
			};
			void Promise.resolve()
				.then(() => {
					check();
					return work(check);
				})
				.then(
					(result) => finish(undefined, result),
					(error: unknown) => finish(error),
				);
		});
	}

	private assertActive(): void {
		if (this.disposed) throw new AiError("disposed");
	}

	private publish(): void {
		this.snapshot = Object.freeze({
			settings: Object.freeze({
				configs: Object.freeze(
					this.settings.configs.map((config) => Object.freeze({ ...config })),
				),
				defaultConfigId: this.settings.defaultConfigId,
			}),
			models: Object.freeze(
				Object.fromEntries(
					this.settings.configs.flatMap((config) => {
						const models = this.models.get(connectionKey(config));
						return models
							? [
									[
										config.id,
										Object.freeze(
											models.map((model) => Object.freeze({ ...model })),
										),
									],
								]
							: [];
					}),
				),
			),
			loadingModels: Object.freeze([...this.loadingModels]),
			testing: Object.freeze([...this.testing]),
		});
		for (const listener of this.listeners) {
			try {
				listener();
			} catch {
				/* Subscribers cannot invalidate committed state. */
			}
		}
	}
}

function connectionKey(config: AiEngineConfig): string {
	return JSON.stringify([config.provider, config.baseUrl, config.secretId]);
}
