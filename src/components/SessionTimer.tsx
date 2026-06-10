import React, { memo, useEffect, useState } from "react";

function getElapsedSeconds(startTime: number): number {
	return Math.floor((Date.now() - startTime) / 1000);
}

export function formatElapsedTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

interface SessionTimerProps {
	startTime: number;
	className?: string;
}

export const SessionTimer = memo(function SessionTimer({
	startTime,
	className,
}: SessionTimerProps) {
	const [elapsedTime, setElapsedTime] = useState(() =>
		getElapsedSeconds(startTime),
	);

	useEffect(() => {
		setElapsedTime(getElapsedSeconds(startTime));
		const interval = window.setInterval(() => {
			setElapsedTime(getElapsedSeconds(startTime));
		}, 1000);

		return () => window.clearInterval(interval);
	}, [startTime]);

	return <span className={className}>{formatElapsedTime(elapsedTime)}</span>;
});
