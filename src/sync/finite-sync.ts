import packageJson from '../../package.json';
import type {
	ConsolidatedDailyTotal,
	FiniteSyncState,
	PendingTimelineEvent,
	SharedSettings,
	SnoozeState,
	SyncInstallation,
	UsageMetrics,
} from '/storage/schema';
import {
	applySharedSettings,
	loadCategorySnoozes,
	loadFiniteSyncState,
	loadSharedSettings,
	loadUsageMetrics,
	saveFiniteSyncState,
} from '/storage/storage';
import { flattenUsageMetrics } from '/usage/usage-metrics';
import { loadPendingTimelineEvents, removeAcknowledgedTimelineEvents } from '/usage/timeline-store';
import { FINITE_SUPABASE_ANON_KEY, FINITE_SYNC_ENDPOINT } from './config';

type PairResponse = {
	userId: string;
	installationToken: string;
	settings: SharedSettings;
	settingsRevision: number;
};

type SyncResponse = {
	settings: SharedSettings;
	settingsRevision: number;
	settingsApplied: boolean;
	dailyTotals: ConsolidatedDailyTotal[];
	installations: SyncInstallation[];
	serverTime: string;
};

class FiniteSyncError extends Error {}

const request = async <Response>(body: Record<string, unknown>, token?: string): Promise<Response> => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 20_000);
	try {
		const response = await fetch(FINITE_SYNC_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${FINITE_SUPABASE_ANON_KEY}`,
				apikey: FINITE_SUPABASE_ANON_KEY,
				'Content-Type': 'application/json',
				...(token == null ? {} : { 'X-Finite-Token': token }),
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
		if (!response.ok) {
			throw new FiniteSyncError(typeof payload?.message === 'string' ? payload.message : 'Finite sync is unavailable.');
		}
		return payload as Response;
	} catch (error) {
		if (error instanceof FiniteSyncError) throw error;
		if (error instanceof DOMException && error.name === 'AbortError') throw new FiniteSyncError('Finite sync timed out.');
		throw new FiniteSyncError('Finite sync is unavailable. Local activity is safe and will retry.');
	} finally {
		clearTimeout(timeout);
	}
};

const serializeSnoozes = (state: SnoozeState) => [...state.history, ...Object.values(state.active)]
	.filter(snooze => snooze != null)
	.slice(-500)
	.map(snooze => ({
		id: snooze!.id,
		category: snooze!.category,
		sourceSiteId: snooze!.sourceSiteId,
		sourceSurfaceId: snooze!.sourceSurfaceId,
		triggerContext: snooze!.triggerContext,
		startedAt: new Date(snooze!.startedAt).toISOString(),
		requestedEndAt: new Date(snooze!.requestedEndAt).toISOString(),
		endedAt: snooze!.endedAt == null ? null : new Date(snooze!.endedAt).toISOString(),
		endReason: snooze!.endReason ?? null,
		activeMs: snooze!.activeMs,
	}));

const serializeActivitySpans = (events: PendingTimelineEvent[]) => events
	.filter(event => event.kind === 'activity_span')
	.map(event => ({
		id: event.id,
		eventVersion: event.eventVersion,
		siteId: event.siteId,
		category: event.category,
		surfaceId: event.surfaceId,
		snoozed: event.snoozed,
		startedAt: new Date(event.startedAt).toISOString(),
		observedThrough: new Date(event.observedThrough).toISOString(),
		endedAt: event.endedAt == null ? null : new Date(event.endedAt).toISOString(),
		startReason: event.startReason,
		endReason: event.endReason ?? null,
		timeZone: event.timeZone,
		utcOffsetMinutes: event.utcOffsetMinutes,
	}));

const serializeInterventions = (events: PendingTimelineEvent[]) => events
	.filter(event => event.kind === 'intervention')
	.map(event => ({
		id: event.id,
		eventVersion: event.eventVersion,
		siteId: event.siteId,
		category: event.category,
		surfaceId: event.surfaceId,
		interventionKind: event.interventionKind,
		occurredAt: new Date(event.occurredAt).toISOString(),
		timeZone: event.timeZone,
		utcOffsetMinutes: event.utcOffsetMinutes,
	}));

export const pairFinite = async (pairingCode: string, deviceName: string): Promise<FiniteSyncState> => {
	const [state, initialSettings] = await Promise.all([loadFiniteSyncState(), loadSharedSettings()]);
	const attempted: FiniteSyncState = { ...state, deviceName: deviceName.trim(), lastAttemptAt: Date.now(), lastError: undefined };
	await saveFiniteSyncState(attempted);
	try {
		const response = await request<PairResponse>({
			action: 'pair',
			pairingCode: pairingCode.trim(),
			installationId: state.installationId,
			deviceName: deviceName.trim(),
			extensionVersion: packageJson.version,
			initialSettings,
		});
		await applySharedSettings(response.settings);
		const paired: FiniteSyncState = {
			...attempted,
			installationToken: response.installationToken,
			userId: response.userId,
			settingsRevision: response.settingsRevision,
			settingsDirty: false,
			lastSuccessAt: Date.now(),
		};
		await saveFiniteSyncState(paired);
		return paired;
	} catch (error) {
		const failed = { ...attempted, lastError: error instanceof Error ? error.message : String(error) };
		await saveFiniteSyncState(failed);
		throw error;
	}
};

const postSync = async (
	state: FiniteSyncState,
	usage: UsageMetrics,
	snoozes: SnoozeState,
	timelineEvents: PendingTimelineEvent[],
	settings: SharedSettings | null,
	baseRevision: number | null,
) => request<SyncResponse>({
	action: 'sync',
	installationId: state.installationId,
	extensionVersion: packageJson.version,
	activity: flattenUsageMetrics(usage),
	snoozes: serializeSnoozes(snoozes),
	activitySpans: serializeActivitySpans(timelineEvents),
	interventions: serializeInterventions(timelineEvents),
	settings,
	settingsBaseRevision: baseRevision,
}, state.installationToken);

export const syncFinite = async (): Promise<FiniteSyncState> => {
	const state = await loadFiniteSyncState();
	if (state.installationToken == null) return state;

	const [usage, snoozes, localSettings, timelineEvents] = await Promise.all([
		loadUsageMetrics(),
		loadCategorySnoozes(),
		loadSharedSettings(),
		loadPendingTimelineEvents(),
	]);
	const attempted: FiniteSyncState = { ...state, lastAttemptAt: Date.now(), lastError: undefined };
	await saveFiniteSyncState(attempted);

	try {
		let response = await postSync(
			attempted,
			usage,
			snoozes,
			timelineEvents,
			attempted.settingsDirty ? localSettings : null,
			attempted.settingsDirty ? attempted.settingsRevision ?? 1 : null,
		);

		if (attempted.settingsDirty && !response.settingsApplied) {
			response = await postSync(attempted, usage, snoozes, timelineEvents, localSettings, response.settingsRevision);
		}

		const settingsWon = !attempted.settingsDirty || response.settingsApplied;
		if (!attempted.settingsDirty) await applySharedSettings(response.settings);
		const synced: FiniteSyncState = {
			...attempted,
			settingsRevision: response.settingsRevision,
			settingsDirty: settingsWon ? false : true,
			lastSuccessAt: Date.now(),
			lastError: undefined,
			consolidatedDailyTotals: response.dailyTotals,
			lastUploadedUsage: usage,
			installations: response.installations,
		};
		await removeAcknowledgedTimelineEvents(timelineEvents);
		await saveFiniteSyncState(synced);
		return synced;
	} catch (error) {
		const failed = { ...attempted, lastError: error instanceof Error ? error.message : String(error) };
		await saveFiniteSyncState(failed);
		throw error;
	}
};

export const disconnectFinite = async (): Promise<FiniteSyncState> => {
	const current = await loadFiniteSyncState();
	const disconnected: FiniteSyncState = {
		installationId: current.installationId,
		settingsDirty: true,
	};
	await saveFiniteSyncState(disconnected);
	return disconnected;
};
