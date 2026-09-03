import type {
	ActiveUsageState,
	CategoryUsageMetrics,
	UsageCategory,
	UsageMetrics,
	UsageRuntimeState,
} from '/storage/schema';
import type { SiteId } from '/types/sitelist';

export const USAGE_SESSION_GAP_MS = 30 * 60 * 1000;
export const USAGE_HEARTBEAT_MS = 15 * 1000;
export const MAX_USAGE_CHECKPOINT_MS = 30 * 1000;
export const USAGE_RETENTION_DAYS = 90;

const londonDateFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/London',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

export const dateKeyForTimestamp = (timestamp: number): string => {
	const parts = londonDateFormatter.formatToParts(new Date(timestamp));
	const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
	return `${value('year')}-${value('month')}-${value('day')}`;
};

const emptyCategoryMetrics = (): CategoryUsageMetrics => ({
	visits: 0,
	sessions: 0,
	activeMs: 0,
	snoozedActiveMs: 0,
	limitReachedCount: 0,
});

const categoryMetricsFor = (usage: UsageMetrics, date: string, siteId: SiteId, category: UsageCategory) => {
	const day = usage.days[date] ?? { date, sites: {} };
	usage.days[date] = day;
	const site = day.sites[siteId] ?? { categories: {} };
	day.sites[siteId] = site;
	const metrics = site.categories[category] ?? emptyCategoryMetrics();
	site.categories[category] = metrics;
	return metrics;
};

const firstTimestampOnDate = (startedAt: number, endedAt: number, date: string): number => {
	let low = startedAt;
	let high = endedAt;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (dateKeyForTimestamp(middle) === date) low = middle + 1;
		else high = middle;
	}
	return low;
};

export const addActiveDuration = (
	usage: UsageMetrics,
	siteId: SiteId,
	category: UsageCategory,
	startedAt: number,
	endedAt: number,
	snoozed: boolean,
): void => {
	let cursor = startedAt;
	while (cursor < endedAt) {
		const date = dateKeyForTimestamp(cursor);
		const boundary = dateKeyForTimestamp(endedAt - 1) === date
			? endedAt
			: firstTimestampOnDate(cursor, endedAt, date);
		const duration = boundary - cursor;
		const metrics = categoryMetricsFor(usage, date, siteId, category);
		metrics.activeMs += duration;
		if (snoozed) metrics.snoozedActiveMs += duration;
		cursor = boundary;
	}
};

const surfaceKey = (siteId: SiteId, category: UsageCategory) => `${siteId}:${category}`;

const recordForegroundEntry = (
	usage: UsageMetrics,
	siteId: SiteId,
	category: UsageCategory,
	now: number,
	session: boolean,
): void => {
	const metrics = categoryMetricsFor(usage, dateKeyForTimestamp(now), siteId, category);
	metrics.visits += 1;
	if (session) metrics.sessions += 1;
};

const checkpointActive = (
	usage: UsageMetrics,
	runtime: UsageRuntimeState,
	now: number,
	continuesActive: boolean,
): number => {
	const active = runtime.active;
	if (active == null) return 0;

	const endedAt = Math.min(now, active.startedAt + MAX_USAGE_CHECKPOINT_MS);
	const duration = Math.max(0, endedAt - active.startedAt);
	if (duration > 0) {
		addActiveDuration(usage, active.siteId, active.category, active.startedAt, endedAt, active.snoozed);
		const session = runtime.categorySessions[active.category];
		if (session != null) {
			session.activeMs += duration;
			session.lastActivityAt = endedAt;
		}
	}

	const currentDate = dateKeyForTimestamp(now);
	if (continuesActive && currentDate !== active.countedDate) {
		recordForegroundEntry(usage, active.siteId, active.category, now, true);
		active.countedDate = currentDate;
	}

	active.startedAt = now;
	runtime.lastActivityBySurface[surfaceKey(active.siteId, active.category)] = endedAt;
	return duration;
};

const beginActive = (
	usage: UsageMetrics,
	runtime: UsageRuntimeState,
	tabId: number,
	siteId: SiteId,
	category: UsageCategory,
	snoozed: boolean,
	now: number,
): void => {
	const date = dateKeyForTimestamp(now);
	const lastSurfaceActivity = runtime.lastActivityBySurface[surfaceKey(siteId, category)];
	const startsDailySurfaceSession = lastSurfaceActivity == null
		|| now - lastSurfaceActivity > USAGE_SESSION_GAP_MS
		|| dateKeyForTimestamp(lastSurfaceActivity) !== date;

	const categorySession = runtime.categorySessions[category];
	if (categorySession == null
		|| now - categorySession.lastActivityAt > USAGE_SESSION_GAP_MS
		|| categorySession.countedDate !== date) {
		runtime.categorySessions[category] = { activeMs: 0, lastActivityAt: now, countedDate: date };
	}

	recordForegroundEntry(usage, siteId, category, now, startsDailySurfaceSession);
	runtime.active = {
		tabId,
		siteId,
		category,
		snoozed,
		startedAt: now,
		countedDate: date,
	};
	runtime.lastActivityBySurface[surfaceKey(siteId, category)] = now;
};

export const recordUsageActivity = (
	usage: UsageMetrics,
	runtime: UsageRuntimeState,
	tabId: number,
	siteId: SiteId | undefined,
	category: UsageCategory | undefined,
	active: boolean,
	snoozed: boolean,
	now: number,
): number => {
	const current = runtime.active;
	const matchesTab = current?.tabId === tabId;

	if (!active || siteId == null || category == null) {
		if (!matchesTab) return 0;
		const duration = checkpointActive(usage, runtime, now, false);
		runtime.active = undefined;
		return duration;
	}

	if (current?.tabId === tabId && current.siteId === siteId && current.category === category) {
		if (now - current.startedAt > USAGE_SESSION_GAP_MS) {
			const duration = checkpointActive(usage, runtime, now, false);
			runtime.active = undefined;
			beginActive(usage, runtime, tabId, siteId, category, snoozed, now);
			return duration;
		}
		const duration = checkpointActive(usage, runtime, now, true);
		if (runtime.active != null) runtime.active.snoozed = snoozed;
		return duration;
	}

	let duration = 0;
	if (current != null) duration = checkpointActive(usage, runtime, now, false);
	beginActive(usage, runtime, tabId, siteId, category, snoozed, now);
	return duration;
};

export const incrementLimitReached = (
	usage: UsageMetrics,
	runtime: UsageRuntimeState,
	date: string,
	siteId: SiteId,
	category: UsageCategory,
): boolean => {
	const key = `${date}:${category}`;
	if (runtime.limitReachedKeys.includes(key)) return false;
	runtime.limitReachedKeys.push(key);
	categoryMetricsFor(usage, date, siteId, category).limitReachedCount += 1;
	return true;
};

export const localCategoryTotal = (
	usage: UsageMetrics,
	date: string,
	category: UsageCategory,
): CategoryUsageMetrics => {
	const total = emptyCategoryMetrics();
	for (const site of Object.values(usage.days[date]?.sites ?? {})) {
		const metrics = site?.categories[category];
		if (metrics == null) continue;
		total.visits += metrics.visits;
		total.sessions += metrics.sessions;
		total.activeMs += metrics.activeMs;
		total.snoozedActiveMs += metrics.snoozedActiveMs;
		total.limitReachedCount += metrics.limitReachedCount;
	}
	return total;
};

export const flattenUsageMetrics = (usage: UsageMetrics) => Object.values(usage.days).flatMap(day =>
	Object.entries(day.sites).flatMap(([siteId, site]) =>
		Object.entries(site?.categories ?? {}).map(([category, metrics]) => ({
			date: day.date,
			siteId: siteId as SiteId,
			category: category as UsageCategory,
			...metrics!,
			metricVersion: 1,
		}))
	)
);

export const pruneUsageMetrics = (usage: UsageMetrics, now: number): void => {
	const cutoff = dateKeyForTimestamp(now - (USAGE_RETENTION_DAYS - 1) * 24 * 60 * 60 * 1000);
	for (const date of Object.keys(usage.days)) {
		if (date < cutoff) delete usage.days[date];
	}
};

export const emptyUsageMetrics = (): UsageMetrics => ({ version: 2, days: {} });
export const emptyUsageRuntimeState = (): UsageRuntimeState => ({
	lastActivityBySurface: {},
	categorySessions: {},
	limitReachedKeys: [],
});

export const activeSessionMs = (runtime: UsageRuntimeState, category: UsageCategory) =>
	runtime.categorySessions[category]?.activeMs ?? 0;

export const migrateLegacyUsage = (legacy: unknown): UsageMetrics => {
	if (legacy == null || typeof legacy !== 'object') return emptyUsageMetrics();
	const value = legacy as { version?: number; days?: Record<string, { date?: string; sites?: Record<string, unknown> }> };
	if (value.version === 2) return value as UsageMetrics;
	const migrated = emptyUsageMetrics();
	for (const [date, day] of Object.entries(value.days ?? {})) {
		for (const [siteId, rawMetrics] of Object.entries(day.sites ?? {})) {
			const metrics = rawMetrics as Partial<CategoryUsageMetrics>;
			migrated.days[date] ??= { date, sites: {} };
			migrated.days[date]!.sites[siteId as SiteId] = {
				categories: {
					intentional: {
						visits: metrics.visits ?? 0,
						sessions: metrics.sessions ?? 0,
						activeMs: metrics.activeMs ?? 0,
						snoozedActiveMs: 0,
						limitReachedCount: 0,
					},
				},
			};
		}
	}
	return migrated;
};
