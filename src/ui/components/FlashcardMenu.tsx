import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Ellipsis } from "lucide-react";
import { FlashcardButton } from "./FlashcardButton";

export interface FlashcardMenuItem {
	key: string;
	label: React.ReactNode;
	icon?: LucideIcon;
	onSelect: () => void;
	disabled?: boolean;
	danger?: boolean;
	title?: string;
	iconClassName?: string;
}

export interface FlashcardMenuProps {
	items: FlashcardMenuItem[];
	triggerTitle: string;
	ariaLabel: string;
	triggerIcon?: LucideIcon;
	triggerClassName?: string;
	menuClassName?: string;
	align?: "start" | "end";
	onOpenChange?: (open: boolean) => void;
	stopPropagation?: boolean;
}

/** Accessible action menu with outside-click, Escape, and arrow-key behavior. */
export const FlashcardMenu: React.FC<FlashcardMenuProps> = ({
	items,
	triggerTitle,
	ariaLabel,
	triggerIcon = Ellipsis,
	triggerClassName = "",
	menuClassName = "",
	align = "end",
	onOpenChange,
	stopPropagation = true,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const menuId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const setOpen = useCallback(
		(open: boolean) => {
			setIsOpen(open);
			onOpenChange?.(open);
		},
		[onOpenChange],
	);

	const focusItem = useCallback((index: number) => {
		const controls = Array.from(
			menuRef.current?.querySelectorAll<HTMLButtonElement>(
				".flashcard-menu-item:not(:disabled)",
			) ?? [],
		);
		if (controls.length === 0) return;
		controls[(index + controls.length) % controls.length]?.focus();
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		const ownerDocument = rootRef.current?.ownerDocument;
		if (!ownerDocument) return;

		const handlePointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node | null)) setOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			setOpen(false);
			triggerRef.current?.focus();
		};

		ownerDocument.addEventListener("pointerdown", handlePointerDown);
		ownerDocument.addEventListener("keydown", handleKeyDown);
		return () => {
			ownerDocument.removeEventListener("pointerdown", handlePointerDown);
			ownerDocument.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, setOpen]);

	const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const controls = Array.from(
			menuRef.current?.querySelectorAll<HTMLButtonElement>(
				".flashcard-menu-item:not(:disabled)",
			) ?? [],
		);
		const currentIndex = controls.indexOf(event.target as HTMLButtonElement);
		if (event.key === "ArrowDown") {
			event.preventDefault();
			focusItem(currentIndex + 1);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			focusItem(currentIndex - 1);
		} else if (event.key === "Home") {
			event.preventDefault();
			focusItem(0);
		} else if (event.key === "End") {
			event.preventDefault();
			focusItem(controls.length - 1);
		}
	};

	return (
		<div ref={rootRef} className={`flashcard-menu-root is-${align}`}>
			<FlashcardButton
				ref={triggerRef}
				variant="quiet"
				icon={triggerIcon}
				className={`flashcard-menu-trigger${triggerClassName ? ` ${triggerClassName}` : ""}`}
				onClick={(event) => {
					if (stopPropagation) event.stopPropagation();
					setOpen(!isOpen);
				}}
				onKeyDown={(event) => {
					if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
					event.preventDefault();
					setOpen(true);
					requestAnimationFrame(() => focusItem(event.key === "ArrowUp" ? -1 : 0));
				}}
				active={isOpen}
				title={triggerTitle}
				aria-label={triggerTitle}
				aria-haspopup="menu"
				aria-expanded={isOpen}
				aria-controls={menuId}
			/>

			{isOpen && (
				<div
					ref={menuRef}
					id={menuId}
					className={`flashcard-menu${menuClassName ? ` ${menuClassName}` : ""}`}
					role="menu"
					tabIndex={-1}
					aria-label={ariaLabel}
					onKeyDown={handleMenuKeyDown}
				>
					{items.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.key}
								type="button"
								className={`flashcard-menu-item${item.danger ? " is-danger" : ""}`}
								role="menuitem"
								disabled={item.disabled}
								title={item.title}
								onClick={(event) => {
									if (stopPropagation) event.stopPropagation();
									setOpen(false);
									item.onSelect();
								}}
							>
								{Icon && (
									<Icon
										size={16}
										className={item.iconClassName}
										aria-hidden="true"
									/>
								)}
								<span>{item.label}</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
};
