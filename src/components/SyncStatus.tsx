import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cloud, CloudOff, Activity, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GattaiHeartbeat {
	device_id: string;
	timestamp: string;
	daemon_version: string;
	project_root: string;
}

interface SyncStatusProps {
	vaultPath: string | null;
}

export function SyncStatus({ vaultPath }: SyncStatusProps) {
	const [gattaiRunning, setGattaiRunning] = useState<boolean>(false);
	const [syncthingRunning, setSyncthingRunning] = useState<boolean>(false);
	const [gattaiDevice, setGattaiDevice] = useState<string | null>(null);
	const [lastChecked, setLastChecked] = useState<Date>(new Date());

	useEffect(() => {
		// Check status immediately
		checkStatus();

		// Set up interval to check every 15 seconds
		const interval = setInterval(checkStatus, 15000);

		return () => clearInterval(interval);
	}, [vaultPath]);

	const checkStatus = async () => {
		await Promise.all([checkGattai(), checkSyncthing()]);
		setLastChecked(new Date());
	};

	const checkGattai = async () => {
		try {
			const heartbeat = await invoke<GattaiHeartbeat | null>('check_gattai_heartbeat');

			if (heartbeat) {
				const timestampMs = new Date(heartbeat.timestamp).getTime();
				const nowMs = Date.now();
				const ageMs = nowMs - timestampMs;

				// Consider running if less than 30 seconds old
				const isRunning = ageMs < 30000;
				setGattaiRunning(isRunning);
				setGattaiDevice(isRunning ? heartbeat.device_id : null);
			} else {
				setGattaiRunning(false);
				setGattaiDevice(null);
			}
		} catch (error) {
			console.error('Failed to check Gattai heartbeat:', error);
			setGattaiRunning(false);
			setGattaiDevice(null);
		}
	};

	const checkSyncthing = async () => {
		try {
			const isRunning = await invoke<boolean>('check_syncthing_status', {
				vaultPath: vaultPath || undefined,
			});
			setSyncthingRunning(isRunning);
		} catch (error) {
			console.error('Failed to check Syncthing status:', error);
			setSyncthingRunning(false);
		}
	};

	// Show warning if vault exists but neither service is running
	const showWarning = vaultPath && !syncthingRunning && !gattaiRunning;

	return (
		<div className='px-3 py-2 border-t border-border bg-muted/5'>
			<div className='space-y-1.5'>
				{/* Syncthing Status */}
				<div className='flex items-center justify-between text-xs'>
					<div className='flex items-center gap-1.5'>
						{syncthingRunning ? (
							<Cloud className='w-3 h-3 text-green-500' />
						) : (
							<CloudOff className='w-3 h-3 text-muted-foreground' />
						)}
						<span className='text-muted-foreground'>Syncthing</span>
					</div>
					<span
						className={cn(
							'text-xs',
							syncthingRunning ? 'text-green-500' : 'text-muted-foreground'
						)}
					>
						{syncthingRunning ? 'Running' : 'Stopped'}
					</span>
				</div>

				{/* Gattai Status */}
				<div className='flex items-center justify-between text-xs'>
					<div className='flex items-center gap-1.5'>
						{gattaiRunning ? (
							<Activity className='w-3 h-3 text-blue-500' />
						) : (
							<Activity className='w-3 h-3 text-muted-foreground' />
						)}
						<span className='text-muted-foreground'>Gattai</span>
					</div>
					<span
						className={cn(
							'text-xs',
							gattaiRunning ? 'text-blue-500' : 'text-muted-foreground'
						)}
					>
						{gattaiRunning ? (
							gattaiDevice ? (
								<span title={gattaiDevice}>
									{gattaiDevice.split('-')[0]}
								</span>
							) : (
								'Running'
							)
						) : (
							'Stopped'
						)}
					</span>
				</div>

				{/* Warning if nothing is syncing */}
				{showWarning && (
					<div className='flex items-start gap-1.5 text-[10px] text-yellow-600 dark:text-yellow-500 mt-1 pt-1 border-t border-border'>
						<AlertCircle className='w-3 h-3 shrink-0 mt-0.5' />
						<span>Notes won't sync - start Syncthing or Gattai</span>
					</div>
				)}
			</div>
		</div>
	);
}
