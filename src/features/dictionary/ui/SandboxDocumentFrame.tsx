import React, { useEffect, useRef } from "react";
import {
	createDictionarySandboxHost,
	type DictionarySandboxHost,
	type SandboxDocument,
} from "../domain/sandbox-document";

export interface SandboxDocumentFrameProps {
	document: SandboxDocument;
	theme: "dark" | "light";
	/** Optional: open a cross-referenced entry. May be omitted. */
	onLookup?: (word: string) => void;
	/** Optional accessible frame name; callers should pass the section title. */
	title?: string;
}

/**
 * Hosts one sandboxed dictionary document.
 *
 * The host seeds the theme into `srcdoc` before the frame navigates, so dark
 * mode never flashes white; later theme changes go through the validated
 * `set-theme` message channel. The host is created inside the registration
 * effect (not `useMemo`) so React StrictMode's mount/unmount/mount cycle gets a
 * live host on the second mount instead of a disposed one.
 */
export const SandboxDocumentFrame = React.memo(function SandboxDocumentFrame({
	document,
	theme,
	onLookup,
	title,
}: SandboxDocumentFrameProps) {
	const frameRef = useRef<HTMLIFrameElement | null>(null);
	const hostRef = useRef<DictionarySandboxHost | null>(null);
	const themeRef = useRef(theme);
	const onLookupRef = useRef(onLookup);

	useEffect(() => {
		onLookupRef.current = onLookup;
	}, [onLookup]);

	useEffect(() => {
		const frame = frameRef.current;
		if (!frame) return;
		const host = createDictionarySandboxHost({
			initialTheme: themeRef.current,
			openEntry: (term) => onLookupRef.current?.(term),
		});
		hostRef.current = host;
		host.register(frame, document);
		return () => {
			host.unregister(frame);
			host.dispose();
			if (hostRef.current === host) hostRef.current = null;
		};
	}, [document]);

	useEffect(() => {
		themeRef.current = theme;
		hostRef.current?.setTheme(theme);
	}, [theme]);

	return (
		<iframe
			ref={frameRef}
			className="flashcard-dictionary-sandbox"
			sandbox="allow-scripts"
			referrerPolicy="no-referrer"
			title={title ?? ""}
		/>
	);
});
