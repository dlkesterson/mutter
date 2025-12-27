// IndexedDB utility for persistent storage

const DB_NAME = 'MutterDB';
const DB_VERSION = 1;
const STORE_NAME = 'settings';

interface SettingsStore {
    key: string;
    value: any;
}

let db: IDBDatabase | null = null;

// Initialize the database
export async function initDB(): Promise<IDBDatabase> {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            reject(new Error('Failed to open IndexedDB'));
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;

            // Create object store if it doesn't exist
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
    });
}

// Get a value from storage
export async function getStorageItem<T = any>(key: string): Promise<T | null> {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onerror = () => {
            reject(new Error(`Failed to get item: ${key}`));
        };

        request.onsuccess = () => {
            const result = request.result as SettingsStore | undefined;
            resolve(result ? result.value : null);
        };
    });
}

// Set a value in storage
export async function setStorageItem(key: string, value: any): Promise<void> {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ key, value });

        request.onerror = () => {
            reject(new Error(`Failed to set item: ${key}`));
        };

        request.onsuccess = () => {
            resolve();
        };
    });
}

// Remove a value from storage
export async function removeStorageItem(key: string): Promise<void> {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onerror = () => {
            reject(new Error(`Failed to remove item: ${key}`));
        };

        request.onsuccess = () => {
            resolve();
        };
    });
}

// Clear all storage
export async function clearStorage(): Promise<void> {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => {
            reject(new Error('Failed to clear storage'));
        };

        request.onsuccess = () => {
            resolve();
        };
    });
}

// Storage keys
export const StorageKeys = {
    VAULT_PATH: 'vault_path',
    LAST_OPENED_FILE: 'last_opened_file',
    EDITOR_SETTINGS: 'editor_settings',
    VOICE_LOG_COLLAPSED: 'voice_log_collapsed',
    AUTO_STOP_ENABLED: 'auto_stop_enabled',
    AUTO_STOP_TIMEOUT_MS: 'auto_stop_timeout_ms',
    MINIMAP_ENABLED: 'minimap_enabled',
} as const;
