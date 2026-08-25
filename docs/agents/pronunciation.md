# Pronunciation Guide

Read this guide before changing pronunciation settings, playback, spelling autoplay, provider requests, secrets, or audio caching.

## Runtime authority

`src/pronunciation/pronunciationRuntime.ts` is a shared plugin-lifetime service injected from the plugin/view boundary.

- Its immutable snapshot is the in-process authority for committed pronunciation settings, management activity, cache usage, voice capability, and playback state.
- Settings adapters call semantic methods such as `configure()`, `testOnlineProvider()`, and `clearCache()`; they must not mirror or directly mutate pronunciation settings/activity.
- Configuration is persisted before the committed snapshot is published. Whole-settings writes in `src/obsidian/main.ts` are serialized so stale settings cannot overwrite a newer pronunciation configuration.
- UI components consume the runtime interface. They must not create a second runtime or read provider credentials directly.

## Fallback and security rules

Pronunciation is offline-first in this order:

1. A matching local English `SpeechSynthesisVoice`.
2. Device-local cached audio for the configured provider/voice/accent/rate/text descriptor.
3. The configured Azure Speech or OpenAI provider when online and available.

- Online requests use Obsidian `requestUrl`, not browser `fetch` assumptions.
- Provider secret values live only in Obsidian `SecretStorage`; persist secret IDs only. Never include secret values in `DataStore`, logs, notices, fixtures, or source.
- Preserve offline handling, request timeouts, provider cooldowns, cancellation, and graceful fallback on platforms missing speech, audio, Web Crypto, or IndexedDB.
- The IndexedDB audio cache has an in-memory fallback and a 100 MiB LRU limit. Cache keys must remain provider/variant/accent/rate/text-specific.
- A configuration change cancels playback and provider testing. Preserve the runtime's single-flight/busy semantics for configuration, provider tests, cache clearing, and usage refresh.

## Playback lifecycle and tests

- Stop playback when the current card/session changes, the view closes, or the consumer unmounts.
- Dispose voice/connectivity listeners and timers on plugin unload.
- Spelling autoplay reads the same runtime snapshot as manual playback and lets `AnswerPresentationTransition` own the presentation wait.

Add focused tests under `src/pronunciation/__tests__/` and, for spelling integration, `src/sessions/__tests__/` or `src/ui/__tests__/`. Report which fallback path—local voice, cache, Azure, or OpenAI—was actually exercised manually.
