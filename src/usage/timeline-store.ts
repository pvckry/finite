import type { PendingTimelineEvent } from '/storage/schema';

const DATABASE_NAME = 'finite-private-events';
const DATABASE_VERSION = 1;
const EVENT_STORE = 'pending-timeline-events';

let databasePromise: Promise<IDBDatabase> | undefined;

const database = (): Promise<IDBDatabase> => {
	if (databasePromise != null) return databasePromise;
	databasePromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
		request.onerror = () => reject(request.error ?? new Error('Finite event storage is unavailable.'));
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(EVENT_STORE)) {
				const store = db.createObjectStore(EVENT_STORE, { keyPath: 'id' });
				store.createIndex('updatedAt', 'updatedAt');
			}
		};
		request.onsuccess = () => resolve(request.result);
	});
	return databasePromise;
};

const requestResult = <Value>(request: IDBRequest<Value>): Promise<Value> => new Promise((resolve, reject) => {
	request.onsuccess = () => resolve(request.result);
	request.onerror = () => reject(request.error ?? new Error('Finite event storage failed.'));
});

export const upsertPendingTimelineEvents = async (events: PendingTimelineEvent[]): Promise<void> => {
	if (events.length === 0) return;
	const db = await database();
	await new Promise<void>((resolve, reject) => {
		const transaction = db.transaction(EVENT_STORE, 'readwrite');
		const store = transaction.objectStore(EVENT_STORE);
		for (const event of events) store.put(event);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error ?? new Error('Finite event storage failed.'));
		transaction.onabort = () => reject(transaction.error ?? new Error('Finite event storage was interrupted.'));
	});
};

export const loadPendingTimelineEvents = async (limit = 2_000): Promise<PendingTimelineEvent[]> => {
	const db = await database();
	const transaction = db.transaction(EVENT_STORE, 'readonly');
	const events = await requestResult(transaction.objectStore(EVENT_STORE).getAll()) as PendingTimelineEvent[];
	return events
		.sort((left, right) => left.updatedAt - right.updatedAt || left.id.localeCompare(right.id))
		.slice(0, limit);
};

export const removeAcknowledgedTimelineEvents = async (sent: PendingTimelineEvent[]): Promise<void> => {
	if (sent.length === 0) return;
	const db = await database();
	await new Promise<void>((resolve, reject) => {
		const transaction = db.transaction(EVENT_STORE, 'readwrite');
		const store = transaction.objectStore(EVENT_STORE);
		for (const event of sent) {
			const get = store.get(event.id);
			get.onsuccess = () => {
				const current = get.result as PendingTimelineEvent | undefined;
				if (current != null && current.updatedAt <= event.updatedAt) store.delete(event.id);
			};
		}
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error ?? new Error('Finite event cleanup failed.'));
		transaction.onabort = () => reject(transaction.error ?? new Error('Finite event cleanup was interrupted.'));
	});
};
