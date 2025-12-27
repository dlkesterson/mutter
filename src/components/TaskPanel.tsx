import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AgentTrackerTask } from '@/types';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle2, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskPanelProps {
	onTaskClick?: (task: AgentTrackerTask) => void;
	onFileSelect?: (path: string) => void;
}

export function TaskPanel({ onTaskClick, onFileSelect }: TaskPanelProps) {
	const [tasks, setTasks] = useState<AgentTrackerTask[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isExpanded, setIsExpanded] = useState(true);
	const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);

	useEffect(() => {
		loadTasks();
	}, []);

	const loadTasks = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await invoke<AgentTrackerTask[]>('list_agent_tracker_tasks');
			setTasks(result);
		} catch (err) {
			console.error('Failed to load tasks:', err);
			setError(err as string);
		} finally {
			setIsLoading(false);
		}
	};

	const handleTaskClick = async (task: AgentTrackerTask) => {
		// Call the custom onClick handler if provided
		onTaskClick?.(task);

		// If task has a source file and is done, sync the checkbox
		if (task.source_file && task.status === 'done') {
			setSyncingTaskId(task.id);
			try {
				await invoke('sync_task_checkbox', {
					sourceFile: task.source_file,
					taskDescription: task.title,
					isCompleted: true,
				});
				console.log(`Synced checkbox for task: ${task.title}`);
			} catch (err) {
				console.error('Failed to sync checkbox:', err);
			} finally {
				setSyncingTaskId(null);
			}
		}

		// Open the source file if available
		if (task.source_file && onFileSelect) {
			onFileSelect(task.source_file);
		}
	};

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'done':
				return <CheckCircle2 className='w-4 h-4 text-green-500' />;
			case 'in_progress':
				return <Clock className='w-4 h-4 text-blue-500' />;
			default:
				return <Circle className='w-4 h-4 text-muted-foreground' />;
		}
	};

	const getPriorityColor = (priority: string) => {
		switch (priority) {
			case 'high':
				return 'text-red-500';
			case 'medium':
				return 'text-yellow-500';
			case 'low':
				return 'text-gray-500';
			default:
				return 'text-muted-foreground';
		}
	};

	const tasksByStatus = {
		in_progress: tasks.filter((t) => t.status === 'in_progress'),
		todo: tasks.filter((t) => t.status === 'todo'),
		done: tasks.filter((t) => t.status === 'done'),
	};

	return (
		<div className='border-t border-border'>
			{/* Header */}
			<div className='flex items-center justify-between p-3 cursor-pointer' onClick={() => setIsExpanded(!isExpanded)}>
				<div className='flex items-center gap-2'>
					<span className='text-sm font-medium'>Tasks</span>
					<span className='text-xs text-muted-foreground'>
						({tasks.length})
					</span>
				</div>
				<div className='flex items-center gap-1'>
					<Button
						variant='ghost'
						size='icon'
						className='h-6 w-6'
						onClick={(e) => {
							e.stopPropagation();
							loadTasks();
						}}
						title='Refresh Tasks'
						disabled={isLoading}
					>
						<RefreshCw
							className={cn('w-3 h-3', isLoading && 'animate-spin')}
						/>
					</Button>
					<span className='text-xs text-muted-foreground'>
						{isExpanded ? '▼' : '▶'}
					</span>
				</div>
			</div>

			{/* Content */}
			{isExpanded && (
				<div className='max-h-64 overflow-y-auto'>
					{error ? (
						<div className='p-3 text-xs text-red-500'>
							Error: {error}
						</div>
					) : tasks.length === 0 ? (
						<div className='p-3 text-xs text-muted-foreground text-center'>
							No tasks found
						</div>
					) : (
						<div className='space-y-2 p-2'>
							{/* In Progress Tasks */}
							{tasksByStatus.in_progress.length > 0 && (
								<div>
									<div className='text-xs font-medium text-muted-foreground px-2 mb-1'>
										In Progress
									</div>
									{tasksByStatus.in_progress.map((task) => (
										<TaskItem
											key={task.id}
											task={task}
											onClick={handleTaskClick}
											getStatusIcon={getStatusIcon}
											getPriorityColor={getPriorityColor}
											isSyncing={syncingTaskId === task.id}
										/>
									))}
								</div>
							)}

							{/* Todo Tasks */}
							{tasksByStatus.todo.length > 0 && (
								<div>
									<div className='text-xs font-medium text-muted-foreground px-2 mb-1'>
										To Do
									</div>
									{tasksByStatus.todo.map((task) => (
										<TaskItem
											key={task.id}
											task={task}
											onClick={handleTaskClick}
											getStatusIcon={getStatusIcon}
											getPriorityColor={getPriorityColor}
											isSyncing={syncingTaskId === task.id}
										/>
									))}
								</div>
							)}

							{/* Done Tasks (collapsed by default, show count) */}
							{tasksByStatus.done.length > 0 && (
								<div className='text-xs text-muted-foreground px-2'>
									✓ {tasksByStatus.done.length} completed
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

interface TaskItemProps {
	task: AgentTrackerTask;
	onClick?: (task: AgentTrackerTask) => void;
	getStatusIcon: (status: string) => JSX.Element;
	getPriorityColor: (priority: string) => string;
	isSyncing?: boolean;
}

function TaskItem({ task, onClick, getStatusIcon, getPriorityColor, isSyncing }: TaskItemProps) {
	return (
		<button
			className='w-full text-left p-2 rounded hover:bg-accent transition-colors group'
			onClick={() => onClick?.(task)}
			disabled={isSyncing}
		>
			<div className='flex items-start gap-2'>
				{isSyncing ? (
					<RefreshCw className='w-4 h-4 animate-spin text-blue-500' />
				) : (
					getStatusIcon(task.status)
				)}
				<div className='flex-1 min-w-0'>
					<div className='text-xs font-medium truncate'>
						{task.title}
						{isSyncing && <span className='ml-1 text-blue-500'>(syncing...)</span>}
					</div>
					<div className='flex items-center gap-2 mt-0.5'>
						<span
							className={cn(
								'text-[10px]',
								getPriorityColor(task.priority)
							)}
						>
							{task.priority}
						</span>
						{task.tags.length > 0 && (
							<span className='text-[10px] text-muted-foreground'>
								{task.tags.slice(0, 2).join(', ')}
							</span>
						)}
					</div>
				</div>
			</div>
		</button>
	);
}
