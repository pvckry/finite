import { describe, expect, test } from 'bun:test';
import { siteId } from '/types/sitelist';
import {
	MAX_USAGE_CHECKPOINT_MS,
	USAGE_RETENTION_DAYS,
	addActiveDuration,
	dateKeyForTimestamp,
	emptyUsageMetrics,
	emptyUsageRuntimeState,
	pruneUsageMetrics,
	recordUsageActivity,
} from './usage-metrics';

const youtube = siteId('youtube');
const instagram = siteId('instagram');
const localTime = (year: number, month: number, day: number, hour = 12, minute = 0, second = 0) =>
	new Date(year, month - 1, day, hour, minute, second).getTime();

describe('daily usage metrics', () => {
	test('counts foreground entries separately from 30-minute sessions', () => {
		const usage = emptyUsageMetrics();
		const runtime = emptyUsageRuntimeState();
		const start = localTime(2026, 9, 3);

		recordUsageActivity(usage, runtime, 1, youtube, 'intentional', true, false, start);
		recordUsageActivity(usage, runtime, 1, undefined, undefined, false, false, start + 15_000);
		recordUsageActivity(usage, runtime, 1, youtube, 'intentional', true, false, start + 5 * 60_000);
		recordUsageActivity(usage, runtime, 1, undefined, undefined, false, false, start + 5 * 60_000 + 15_000);

		const metrics = usage.days[dateKeyForTimestamp(start)]!.sites[youtube]!.categories.intentional!;
		expect(metrics).toEqual({ visits: 2, sessions: 1, activeMs: 30_000, snoozedActiveMs: 0, limitReachedCount: 0 });

		recordUsageActivity(usage, runtime, 1, youtube, 'intentional', true, false, start + 37 * 60_000);
		expect(metrics.visits).toBe(3);
		expect(metrics.sessions).toBe(2);
	});

	test('switches the active site and checkpoints the previous one', () => {
		const usage = emptyUsageMetrics();
		const runtime = emptyUsageRuntimeState();
		const start = localTime(2026, 9, 3);

		recordUsageActivity(usage, runtime, 1, youtube, 'algorithmic', true, false, start);
		recordUsageActivity(usage, runtime, 2, instagram, 'intentional', true, false, start + 30_000);

		const day = usage.days[dateKeyForTimestamp(start)]!;
		expect(day.sites[youtube]!.categories.algorithmic).toEqual({ visits: 1, sessions: 1, activeMs: 30_000, snoozedActiveMs: 0, limitReachedCount: 0 });
		expect(day.sites[instagram]!.categories.intentional).toEqual({ visits: 1, sessions: 1, activeMs: 0, snoozedActiveMs: 0, limitReachedCount: 0 });
		expect(runtime.active?.siteId).toBe(instagram);
		expect(runtime.active?.category).toBe('intentional');
	});

	test('splits active time at local midnight and starts the new daily totals', () => {
		const usage = emptyUsageMetrics();
		const runtime = emptyUsageRuntimeState();
		const start = localTime(2026, 9, 3, 23, 59, 50);
		const end = localTime(2026, 9, 4, 0, 0, 10);

		addActiveDuration(usage, youtube, 'algorithmic', start, end, true);

		expect(usage.days['2026-09-03']!.sites[youtube]!.categories.algorithmic).toEqual({
			visits: 0,
			sessions: 0,
			activeMs: 10_000,
			snoozedActiveMs: 10_000,
			limitReachedCount: 0,
		});
		expect(usage.days['2026-09-04']!.sites[youtube]!.categories.algorithmic).toEqual({
			visits: 0,
			sessions: 0,
			activeMs: 10_000,
			snoozedActiveMs: 10_000,
			limitReachedCount: 0,
		});
	});

	test('caps a stale heartbeat and begins a new session after a long gap', () => {
		const usage = emptyUsageMetrics();
		const runtime = emptyUsageRuntimeState();
		const start = localTime(2026, 9, 3);

		recordUsageActivity(usage, runtime, 1, youtube, 'algorithmic', true, false, start);
		recordUsageActivity(usage, runtime, 1, youtube, 'algorithmic', true, false, start + 60 * 60_000);

		const metrics = usage.days[dateKeyForTimestamp(start)]!.sites[youtube]!.categories.algorithmic!;
		expect(metrics).toEqual({ visits: 2, sessions: 2, activeMs: MAX_USAGE_CHECKPOINT_MS, snoozedActiveMs: 0, limitReachedCount: 0 });
	});

	test('retains today plus the previous 89 local calendar days', () => {
		const usage = emptyUsageMetrics();
		const now = localTime(2026, 9, 3);
		const kept = new Date(now);
		kept.setDate(kept.getDate() - (USAGE_RETENTION_DAYS - 1));
		const removed = new Date(kept);
		removed.setDate(removed.getDate() - 1);
		usage.days[dateKeyForTimestamp(kept.getTime())] = { date: dateKeyForTimestamp(kept.getTime()), sites: {} };
		usage.days[dateKeyForTimestamp(removed.getTime())] = { date: dateKeyForTimestamp(removed.getTime()), sites: {} };

		pruneUsageMetrics(usage, now);

		expect(usage.days[dateKeyForTimestamp(kept.getTime())]).toBeDefined();
		expect(usage.days[dateKeyForTimestamp(removed.getTime())]).toBeUndefined();
	});
});
