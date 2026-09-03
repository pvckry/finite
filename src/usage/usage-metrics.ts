import type { ActiveUsageState, UsageMetrics, UsageRuntimeState } from '/storage/schema';
import type { SiteId } from '/types/sitelist';

export const USAGE_SESSION_GAP_MS = 30 * 60 * 1000;
export const USAGE_HEARTBEAT_MS = 60 * 1000;
export const MAX_USAGE_CHECKPOINT_MS = 90 * 1000;
export const USAGE_RETENTION_DAYS = 90;

export const dateKeyForTimestamp = (timestamp: number): string => {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

const nextLocalMidnight = (timestamp: number): number => {
	const date = new Date(timestamp);
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
};

const siteMetricsFor = (usage: UsageMetrics, date: string, siteId: SiteId) => {
	const day = usage.days[date] ?? { date, sites: {} };
	usage.days[date] = day;
	const site = day.sites[siteId] ?? { visits: 0, sessions: 0, activeMs: 0 };
	day.sites[siteId] = site;
	return site;
};

export const addActiveDuration = (usage: UsageMetrics, siteId: SiteId, startedAt: number, endedAt: number): void => {
	let cursor = startedAt;
	while (cursor < endedAt) {
		const boundary = Math.min(endedAt, nextLocalMidnight(cursor));
		siteMetricsFor(usage, dateKeyForTimestamp(cursor), siteId).activeMs += boundary - cursor;
		cursor = boundary;
	}
};

const recordForegroundEntry = (usage: UsageMetrics, siteId: SiteId, now: number, session: boolean): void => {
	const metrics = siteMetricsFor(usage, dateKeyForTimestamp(now), siteId);
	metrics.visits += 1;
	if (session) metrics.sessions += 1;
};

const checkpointActive = (usage: UsageMetrics, runtime: UsageRuntimeState, now: number, continuesActive: boolean): void => {
	const active = runtime.active;
	if (active == null) return;

	const endedAt = Math.min(now, active.startedAt + MAX_USAGE_CHECKPOINT_MS);
	if (endedAt > active.startedAt) addActiveDuration(usage, active.siteId, active.startedAt, endedAt);

	const currentDate = dateKeyForTimestamp(now);
	if (continuesActive && currentDate !== active.countedDate) {
		recordForegroundEntry(usage, active.siteId, now, true);
		active.countedDate = currentDate;
	}

	active.startedAt = now;
	runtime.lastActivityBySite[active.siteId] = endedAt;
};

const beginActive = (usage: UsageMetrics, runtime: UsageRuntimeState, tabId: number, siteId: SiteId, now: number): void => {
	const lastActivity = runtime.lastActivityBySite[siteId];
	const startsDailySession = lastActivity == null
		|| now - lastActivity > USAGE_SESSION_GAP_MS
		|| dateKeyForTimestamp(lastActivity) !== dateKeyForTimestamp(now);

	recordForegroundEntry(usage, siteId, now, startsDailySession);
	runtime.active = {
		tabId,
		siteId,
		startedAt: now,
		countedDate: dateKeyForTimestamp(now),
	};
	runtime.lastActivityBySite[siteId] = now;
};

export const recordUsageActivity = (
	usage: UsageMetrics,
	runtime: UsageRuntimeState,
	tabId: number,
	siteId: SiteId | undefined,
	active: boolean,
	now: number,
): void => {
	const current = runtime.active;
	const matchesCurrent = current?.tabId === tabId && (siteId == null || current.siteId === siteId);

	if (!active || siteId == null) {
		if (!matchesCurrent) return;
		checkpointActive(usage, runtime, now, false);
		runtime.active = undefined;
		return;
	}

	if (current?.tabId === tabId && current.siteId === siteId) {
		if (now - current.startedAt > USAGE_SESSION_GAP_MS) {
			checkpointActive(usage, runtime, now, false);
			runtime.active = undefined;
			beginActive(usage, runtime, tabId, siteId, now);
			return;
		}
		checkpointActive(usage, runtime, now, true);
		return;
	}

	if (current != null) checkpointActive(usage, runtime, now, false);
	beginActive(usage, runtime, tabId, siteId, now);
};

export const pruneUsageMetrics = (usage: UsageMetrics, now: number): void => {
	const cutoff = new Date(now);
	cutoff.setHours(0, 0, 0, 0);
	cutoff.setDate(cutoff.getDate() - (USAGE_RETENTION_DAYS - 1));

	for (const date of Object.keys(usage.days)) {
		if (new Date(`${date}T00:00:00`).getTime() < cutoff.getTime()) delete usage.days[date];
	}
};

export const emptyUsageMetrics = (): UsageMetrics => ({ version: 1, days: {} });
export const emptyUsageRuntimeState = (): UsageRuntimeState => ({ lastActivityBySite: {} });
