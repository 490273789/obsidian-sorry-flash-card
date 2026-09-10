import { requestUrl, type App } from "obsidian";
import { AiService, type AiSettings } from "../ai";

export function createObsidianAiService(
	app: App,
	settings: AiSettings,
	persist: (settings: AiSettings) => Promise<void>,
): AiService {
	return new AiService(settings, {
		persist,
		createId: () => crypto.randomUUID(),
		readSecret: (id) => app.secretStorage.getSecret(id),
		request: async (request) => {
			const response = await requestUrl({ ...request, throw: false });
			return { status: response.status, text: response.text };
		},
	});
}
