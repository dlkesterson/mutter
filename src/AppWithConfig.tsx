import { useEffect, useState } from 'react';
import { ConfigProvider, migrateFromIndexedDB } from '@/lib/settings';
import App from './App';

/**
 * Wrapper component that handles:
 * 1. One-time migration from IndexedDB to file-based config
 * 2. Config provider setup
 * 3. Loading state during migration
 */
export function AppWithConfig() {
	const [migrationState, setMigrationState] = useState<
		'pending' | 'migrating' | 'complete' | 'error'
	>('pending');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const runMigration = async () => {
			// Check if migration already completed
			const migrationComplete = localStorage.getItem('config_migrated_v1');

			if (migrationComplete === 'true') {
				setMigrationState('complete');
				return;
			}

			try {
				setMigrationState('migrating');
				console.log('📦 Migrating settings from IndexedDB to file-based config...');

				// Run migration
				const result = await migrateFromIndexedDB();

				console.log('✅ Migration complete:', {
					settingsKeys: Object.keys(result.settings),
					hasCredentials: !!result.credentials.ai_providers.claude.api_key ||
						!!result.credentials.ai_providers.openai.api_key,
					stateKeys: Object.keys(result.state),
				});

				// Mark migration as complete
				localStorage.setItem('config_migrated_v1', 'true');
				setMigrationState('complete');
			} catch (err) {
				console.error('❌ Migration failed:', err);
				setError(err instanceof Error ? err.message : String(err));
				setMigrationState('error');

				// Even if migration fails, allow app to continue
				// (will use default settings)
				setTimeout(() => {
					setMigrationState('complete');
				}, 3000);
			}
		};

		runMigration();
	}, []);

	// Loading screen during migration
	if (migrationState === 'pending' || migrationState === 'migrating') {
		return (
			<div className='flex items-center justify-center h-screen bg-background text-foreground'>
				<div className='text-center space-y-4'>
					<div className='text-2xl'>📦</div>
					<div className='text-lg font-medium'>Migrating settings...</div>
					<div className='text-sm text-muted-foreground'>
						Moving to file-based configuration
					</div>
					<div className='animate-pulse text-xs text-muted-foreground'>
						~/.config/mutter/
					</div>
				</div>
			</div>
		);
	}

	// Error screen (will auto-dismiss after 3s)
	if (migrationState === 'error' && error) {
		return (
			<div className='flex items-center justify-center h-screen bg-background text-foreground'>
				<div className='text-center space-y-4 max-w-md'>
					<div className='text-2xl'>⚠️</div>
					<div className='text-lg font-medium text-destructive'>
						Migration Warning
					</div>
					<div className='text-sm text-muted-foreground'>
						{error}
					</div>
					<div className='text-xs text-muted-foreground'>
						Continuing with default settings...
					</div>
				</div>
			</div>
		);
	}

	// Main app wrapped in config providers
	return (
		<ConfigProvider>
			<App />
		</ConfigProvider>
	);
}
