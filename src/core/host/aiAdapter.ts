import type { App, RequestUrlParam } from "obsidian";
import { AiService, type AiSettings } from "../ai";
import { createOutboundPort, TransportError, type OutboundPort } from "../net";

export function createObsidianAiService(
	app: App,
	settings: AiSettings,
	persist: (settings: AiSettings) => Promise<void>,
	net: OutboundPort = createOutboundPort({ app, defaultTimeoutMs: 0 }),
): AiService {
	// The AI service enforces the request deadline itself (it also covers
	// cancellation and disposal), so the shared port adds no deadline of its own.
	return new AiService(settings, {
		persist,
		createId: () => crypto.randomUUID(),
		readSecret: (id) => net.readSecret(id),
		request: async (request: RequestUrlParam) => {
			try {
				const response = await net.request({
					label: "ai-provider",
					url: request.url,
					method: request.method,
					headers: request.headers,
					// The AI service only sends JSON text bodies.
					body: typeof request.body === "string" ? request.body : undefined,
				});
				return { status: response.status, text: response.text };
			} catch (error) {
				if (error instanceof TransportError) {
					// The AI service owns the provider-specific error vocabulary; it
					// classifies from the status, so hand the status back.
					return { status: error.httpStatus ?? 0, text: error.responseText ?? "" };
				}
				throw error;
			}
		},
	});
}
