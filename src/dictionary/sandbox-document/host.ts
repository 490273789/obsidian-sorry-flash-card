import type { SandboxDocument } from "./document";
import {
	sandboxDocumentIdentity,
	sandboxDocumentSource,
	sandboxDocumentStorageUpdater,
} from "./document";
import {
	createSandboxEnvelope,
	parseSandboxEnvelope,
	parseSandboxStorageMutation,
	type DictionaryTheme,
} from "./protocol";

const MAX_AUDIO_URL_LENGTH = 28_100_000;

interface RegisteredFrame {
	readonly documentId: string;
	readonly frame: HTMLIFrameElement;
	readonly handleLoad: () => void;
	readonly source: Window;
	readonly updateStorage?: ReturnType<typeof sandboxDocumentStorageUpdater>;
}

export interface DictionarySandboxHost {
	dispose(): void;
	register(frame: HTMLIFrameElement, document: SandboxDocument): void;
	setTheme(theme: DictionaryTheme): void;
	unregister(frame: HTMLIFrameElement): void;
}

export interface DictionarySandboxHostOptions {
	readonly initialTheme?: DictionaryTheme;
	openEntry(term: string): void;
}

export function createDictionarySandboxHost(
	options: DictionarySandboxHostOptions,
): DictionarySandboxHost {
	const frames = new Map<HTMLIFrameElement, RegisteredFrame>();
	let activeAudio: { audio: HTMLAudioElement; frame: HTMLIFrameElement } | null = null;
	let disposed = false;
	let theme = options.initialTheme ?? "light";

	function sendTheme(registered: RegisteredFrame): void {
		registered.frame.style.colorScheme = theme;
		registered.frame.dataset.obsidianToolsDictionaryTheme = theme;
		registered.source.postMessage(
			createSandboxEnvelope(registered.documentId, "set-theme", { theme }),
			"*",
		);
	}

	function stopAudio(): void {
		if (!activeAudio) return;
		activeAudio.audio.pause();
		activeAudio.audio.currentTime = 0;
		activeAudio = null;
	}

	function stopMediaFor(frame: HTMLIFrameElement): void {
		if (activeAudio?.frame === frame) stopAudio();
	}

	function registeredFrame(event: MessageEvent, documentId: string): RegisteredFrame | null {
		for (const registered of frames.values()) {
			if (registered.source === event.source && registered.documentId === documentId) {
				return registered;
			}
		}
		return null;
	}

	function playAudio(frame: HTMLIFrameElement, payload: unknown): void {
		if (!payload || typeof payload !== "object") return;
		const src = (payload as { src?: unknown }).src;
		if (
			typeof src !== "string" ||
			src.length > MAX_AUDIO_URL_LENGTH ||
			!/^(?:blob:[^\s"'<>]+|data:audio\/(?:aac|flac|mp4|mpeg|ogg|opus|wav|webm);base64,[a-z\d+/=]+)$/i.test(
				src,
			)
		) {
			return;
		}
		stopAudio();
		const audio = new Audio(src);
		activeAudio = { audio, frame };
		const clear = (): void => {
			if (activeAudio?.audio === audio) activeAudio = null;
		};
		audio.addEventListener("ended", clear, { once: true });
		audio.addEventListener("error", clear, { once: true });
		void audio.play().catch(clear);
	}

	function openEntry(payload: unknown): void {
		if (!payload || typeof payload !== "object") return;
		const value = (payload as { term?: unknown }).term;
		if (typeof value !== "string") return;
		const term = value.replace(/\s+/g, " ").trim();
		if (!term || term.length > 128 || term.includes("\0")) return;
		options.openEntry(term);
	}

	function handleMessage(event: MessageEvent): void {
		const envelope = parseSandboxEnvelope(event.data);
		if (!envelope) return;
		const registered = registeredFrame(event, envelope.documentId);
		if (!registered) return;
		switch (envelope.action) {
			case "open-entry":
				openEntry(envelope.payload);
				break;
			case "play-audio":
				playAudio(registered.frame, envelope.payload);
				break;
			case "storage-update": {
				const mutation = parseSandboxStorageMutation(envelope.payload);
				if (!mutation || !registered.updateStorage) break;
				void Promise.resolve(registered.updateStorage(mutation)).catch(() => undefined);
				break;
			}
		}
	}

	window.addEventListener("message", handleMessage);

	return {
		dispose(): void {
			if (disposed) return;
			disposed = true;
			window.removeEventListener("message", handleMessage);
			for (const registered of frames.values()) {
				registered.frame.removeEventListener("load", registered.handleLoad);
			}
			frames.clear();
			stopAudio();
		},
		register(frame, document): void {
			if (disposed) return;
			const source = frame.contentWindow;
			if (!source) return;
			const documentId = sandboxDocumentIdentity(document);
			const current = frames.get(frame);
			if (current) {
				if (current.documentId === documentId && current.source === source) {
					sendTheme(current);
					return;
				}
				current.frame.removeEventListener("load", current.handleLoad);
				stopMediaFor(frame);
			}
			// Set the embedding scheme before navigation, and seed the document before its first paint.
			frame.style.colorScheme = theme;
			frame.srcdoc = sandboxDocumentSource(document, theme);
			const registered: RegisteredFrame = {
				documentId,
				frame,
				handleLoad: () => sendTheme(registered),
				source: frame.contentWindow ?? source,
				updateStorage: sandboxDocumentStorageUpdater(document),
			};
			frame.addEventListener("load", registered.handleLoad);
			frames.set(frame, registered);
			sendTheme(registered);
		},
		setTheme(nextTheme): void {
			if (disposed || theme === nextTheme) return;
			theme = nextTheme;
			for (const registered of frames.values()) sendTheme(registered);
		},
		unregister(frame): void {
			const registered = frames.get(frame);
			if (!registered) return;
			registered.frame.removeEventListener("load", registered.handleLoad);
			frames.delete(frame);
			stopMediaFor(frame);
		},
	};
}
