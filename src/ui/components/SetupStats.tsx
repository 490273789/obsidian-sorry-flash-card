import React from "react";
import type { ReactNode } from "react";

type SetupStatTone = "blue" | "green" | "orange" | "purple" | "red";

interface SetupStatItem {
	value: ReactNode;
	label: string;
	tone: SetupStatTone;
}

interface SetupStatsProps {
	items: SetupStatItem[];
	className?: string;
}

export const SetupStats: React.FC<SetupStatsProps> = ({ items, className = "" }) => {
	return (
		<div className={`flashcard-today-stats flashcard-setup-stats ${className}`.trim()}>
			{items.map(({ value, label, tone }) => (
				<div
					key={label}
					className={`flashcard-stat-card flashcard-setup-stat tone-${tone}`}
				>
					<span className="flashcard-stat-value">{value}</span>
					<span className="flashcard-stat-label">{label}</span>
				</div>
			))}
		</div>
	);
};
