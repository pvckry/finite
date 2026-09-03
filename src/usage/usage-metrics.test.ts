import { describe, expect, test } from 'bun:test';
import { siteId } from '/types/sitelist';
import {
	MAX_USAGE_CHECKPOINT_MS,
	USAGE_RETENTION_DAYS,
	dateKeyForTimestamp,
	emptyUsageMetrics,
	emptyUsageRuntimeState,
	pruneUsageMetrics,
	recordUsageActivity,
} from './usage-metrics';

const youtube = siteId('youtube');
const instagram = siteId('instagram');
const localTime = (year: number, month: number, day: number, hour = 12, minute = 0) =>
	new Date(year, month - 1, day, hour, minute).getTime();

describe('daily usage metrics', () => {
	test('counts foreground entries separately from 30-minute sessions', () => {
		const usage = emptyUsageMetrics();
		const runtime = emptyUsageRuntimeState();
		const start = localTime(2026, 9, 3);

		recordUsageActivity(usage, runtime, 1, youtube, true, start);
		recordUsageActivity(usage, runtime, 1, undefined, false, start + 60_000);
		recordUsageActivity(usage, runtime, 1, youtube, true, start + 5 * 60_000);
		recordUsageActivity(usage, runtime, 1, undefined, false, start + 6 * 60_000);

		const metrics = usage.days[dateKeyForTimestamp(start)]!.sites[youtube]!;
		expect(metrics).toEqual({ visits: 2, sessions: 1, activeMs: 120_000 });

		recordUsageActivity(usage, runtime, 1, youtube, true, start + 37 * 60_000);
		expect(metrics.visits).toBe(3);
		expect(metrics.sessions).toBe(2);
	});

	test('switches the active site and checkpoints the previous one', () => {
		const usage = emptyUsageMetrics();
		const runtime = emptyUsageRuntimeState();
		const start = localTime(2026, 9, 3);

		recordUsageActivity(usage, runtime, 1, youtube, true, start);
		recordUsageActivity(usage, runtime, 2, instagram, true, start + 30_000);

		const day = usage.days[dateKeyForTimestamp(start)]!;
		expect(day.sites[youtube]).toEqual({ visits: 1, sessions: 1, activeMs: 30_000 });
		expect(day.sites[instagram]).toEqual({ visits: 1, sessions: 1, activeMs: 0 });
		expect(runtime.active?.siteId).toBe(instagram);
	});

	test('splits active time at local midnight and starts the new daily totals', () => {
		const usage = emptyUsageMetrics();
		const runtime = emptyUsageRuntimeState();
		const start = localTime(2026, 9, 3, 23, 59);
		const end = localTime(2026, 9, 4, 0, 1);

		recordUsageActivity(usage, runtime, 1, youtube, true, start);
		recordUsageActivity(usage, runtime, 1, youtube, true, end);

		expect(usage.days['2026-09-03']!.sites[youtube]).toEqual({
			visits: 1,
			sessions: 1,
			activeMs: 60_000,
		});
		expect(usage.days['2026-09-04']!.sites[youtube]).toEqual({
			visits: 1,
			sessions: 1,
			activeMs: MAX_USAGE_CHECKPOINT_MS - 60_000,
		});
	});

	test('caps a stale heartbeat and begins a new session after a long gap', () => {
		const usage = emptyUsageMetrics();
		const runtime = emptyUsageRuntimeState();
		const start = localTime(2026, 9, 3);

		recordUsageActivity(usage, runtime, 1, youtube, true, start);
		recordUsageActivity(usage, runtime, 1, youtube, true, start + 60 * 60_000);

		const metrics = usage.days[dateKeyForTimestamp(start)]!.sites[youtube]!;
		expect(metrics).toEqual({ visits: 2, sessions: 2, activeMs: MAX_USAGE_CHECKPOINT_MS });
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
