import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { Notice } from "obsidian";
import type {
	PronunciationFailureReason,
	PronunciationRuntime,
	PronunciationSnapshot,
} from "../../pronunciation";
import { normalizePronunciationText } from "../../pronunciation";
import { useI18n } from "./I18nContext";
import { FlashcardButton } from "./FlashcardButton";

interface PronunciationButtonProps {
	text: string;
}

interface PronunciationButtonRuntimeProps extends PronunciationButtonProps {
	runtime: PronunciationRuntime;
}

/**
 * Snapshot fields that can change whether a text is speakable.
 *
 * Playback state (`speakingText`) is deliberately excluded so `canSpeak()` is
 * not re-run on every play/stop tick — only when voices load, the local-voice
 * availability, provider settings, or the audio cache readiness change.
 */
function getAvailabilityKey(text: string, snapshot: PronunciationSnapshot): string {
	return JSON.stringify([
		text,
		snapshot.voicesLoaded,
		snapshot.hasLocalEnglishVoice,
		snapshot.settings,
		snapshot.cacheUsage.status,
	]);
}

export const PronunciationButton: React.FC<PronunciationButtonRuntimeProps> = ({
	text,
	runtime,
}) => {
	const { t } = useI18n();
	// Stable subscriptions are required by useSyncExternalStore: new function
	// identities on every render would make React re-subscribe each render.
	const subscribe = useCallback((listener: () => void) => runtime.subscribe(listener), [runtime]);
	const getSnapshot = useCallback(() => runtime.getSnapshot(), [runtime]);
	const snapshot = useSyncExternalStore(subscribe, getSnapshot);
	const normalizedText = normalizePronunciationText(text);
	const [availability, setAvailability] = useState({
		text: "",
		available: false,
	});

	const availabilityKey = getAvailabilityKey(normalizedText, snapshot);

	useEffect(() => {
		let active = true;
		void runtime
			.canSpeak(normalizedText)
			.then((canSpeak) => {
				if (active) {
					setAvailability({
						text: normalizedText,
						available: canSpeak,
					});
				}
			})
			.catch(() => {
				if (active) {
					setAvailability({
						text: normalizedText,
						available: false,
					});
				}
			});
		return () => {
			active = false;
		};
	}, [normalizedText, availabilityKey, runtime]);

	if (availability.text !== normalizedText || !availability.available) return null;

	const isSpeaking = snapshot.speakingText === normalizedText;
	const label = t("pronunciation.play", { word: normalizedText });

	return (
		<FlashcardButton
			preset="icon"
			icon={Volume2}
			className={`flashcard-pronunciation-button ${isSpeaking ? "is-speaking" : ""}`}
			aria-label={label}
			title={label}
			aria-pressed={isSpeaking}
			onClick={() => {
				void runtime
					.speak(normalizedText, "manual")
					.then((outcome) => {
						if (outcome.status === "failed" || outcome.status === "unavailable") {
							new Notice(getFailureMessage(outcome.reason, t));
						}
					})
					.catch(() => new Notice(t("pronunciation.failed")));
			}}
		/>
	);
};

function getFailureMessage(
	reason: PronunciationFailureReason,
	t: ReturnType<typeof useI18n>["t"],
): string {
	switch (reason) {
		case "offline":
			return t("pronunciation.offline");
		case "not-configured":
			return t("pronunciation.notConfigured");
		case "unauthorized":
			return t("pronunciation.unauthorized");
		case "quota":
			return t("pronunciation.quota");
		default:
			return t("pronunciation.failed");
	}
}
