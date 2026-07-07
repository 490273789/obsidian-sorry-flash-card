import { useEffect, useRef } from "react";

export function useLatestRef<T>(value: T) {
	const ref = useRef(value);
	ref.current = value;
	return ref;
}

export function useWindowKeyDown(handler: (event: KeyboardEvent) => void): void {
	const handlerRef = useLatestRef(handler);

	useEffect(() => {
		const listener = (event: KeyboardEvent) => {
			handlerRef.current(event);
		};

		window.addEventListener("keydown", listener);
		return () => window.removeEventListener("keydown", listener);
	}, [handlerRef]);
}
