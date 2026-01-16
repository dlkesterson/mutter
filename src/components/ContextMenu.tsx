import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
	Edit,
	Trash2,
	Copy,
	FolderOpen,
	Files,
	ExternalLink,
	FileSearch,
} from 'lucide-react';

export interface ContextMenuItem {
	label: string;
	icon?: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
	separator?: boolean;
}

interface ContextMenuProps {
	items: ContextMenuItem[];
	position: { x: number; y: number };
	onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleEscape);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleEscape);
		};
	}, [onClose]);

	// Adjust position if menu would go off screen
	useEffect(() => {
		if (menuRef.current) {
			const rect = menuRef.current.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			let adjustedX = position.x;
			let adjustedY = position.y;

			if (rect.right > viewportWidth) {
				adjustedX = viewportWidth - rect.width - 10;
			}

			if (rect.bottom > viewportHeight) {
				adjustedY = viewportHeight - rect.height - 10;
			}

			menuRef.current.style.left = `${adjustedX}px`;
			menuRef.current.style.top = `${adjustedY}px`;
		}
	}, [position]);

	return (
		<div
			ref={menuRef}
			className={cn(
				'fixed z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-lg',
				'animate-in fade-in-0 zoom-in-95'
			)}
			style={{ left: position.x, top: position.y }}
		>
			{items.map((item, index) => (
				<React.Fragment key={index}>
					{item.separator ? (
						<div className='my-1 h-px bg-border' />
					) : (
						<button
							className={cn(
								'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors',
								'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
								'disabled:pointer-events-none disabled:opacity-50'
							)}
							onClick={() => {
								if (!item.disabled) {
									item.onClick();
									onClose();
								}
							}}
							disabled={item.disabled}
						>
							{item.icon && <span className='w-4 h-4'>{item.icon}</span>}
							<span>{item.label}</span>
						</button>
					)}
				</React.Fragment>
			))}
		</div>
	);
}

export function useContextMenu() {
	const [contextMenu, setContextMenu] = React.useState<{
		items: ContextMenuItem[];
		position: { x: number; y: number };
	} | null>(null);

	const showContextMenu = (
		items: ContextMenuItem[],
		event: React.MouseEvent
	) => {
		event.preventDefault();
		event.stopPropagation();
		setContextMenu({
			items,
			position: { x: event.clientX, y: event.clientY },
		});
	};

	const hideContextMenu = () => {
		setContextMenu(null);
	};

	return {
		contextMenu,
		showContextMenu,
		hideContextMenu,
	};
}

export const contextMenuIcons = {
	rename: <Edit size={16} />,
	delete: <Trash2 size={16} />,
	duplicate: <Files size={16} />,
	copyPath: <Copy size={16} />,
	openInSystem: <FolderOpen size={16} />,
	openInNewTab: <ExternalLink size={16} />,
	revealInExplorer: <FileSearch size={16} />,
};
