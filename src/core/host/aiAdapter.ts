import type { App } from "obsidian";
import { AiService, type AiSettings } from "../ai";
import { createOutboundPort, type OutboundPort } from "../net";

export function createObsidianAiService(
	app: App,
	settings: AiSettings,
	persist: (settings: AiSettings) => Promise<void>,
	net: OutboundPort = createOutboundPort({ app }),
): AiService {
	return new AiService(settings, {
		persist,
		createId: () => crypto.randomUUID(),
		net,
	});
}
