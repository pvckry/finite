import { describe, expect, test } from 'bun:test';
import { siteId } from '/types/sitelist';
import { transitionTimeline } from './timeline';

const youtube = siteId('youtube');
const context = { timeZone: 'Europe/London', utcOffsetMinutes: 60 };
let sequence = 0;
const makeID = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;

describe('raw activity timeline', () => {
	test('updates one semantic span across heartbeats and closes on blur', () => {
		const start = Date.parse('2026-09-03T10:00:00Z');
		const begun = transitionTimeline(undefined, {
			siteId: youtube,
			category: 'intentional',
			surfaceId: 'watch',
			snoozed: false,
		}, start, 'page_load', makeID, context);
		const heartbeat = transitionTimeline(begun.active, {
			siteId: youtube,
			category: 'intentional',
			surfaceId: 'watch',
			snoozed: false,
		}, start + 15_000, 'heartbeat', makeID, context);
		const closed = transitionTimeline(heartbeat.active, undefined, start + 20_000, 'blur', makeID, context);

		expect(heartbeat.active?.id).toBe(begun.active?.id);
		expect(heartbeat.active?.observedThrough).toBe(start + 15_000);
		expect(closed.active).toBeUndefined();
		expect(closed.upserts[0]?.endedAt).toBe(start + 20_000);
		expect(closed.upserts[0]?.endReason).toBe('blur');
	});

	test('closes and reopens when the privacy-safe surface changes', () => {
		const start = Date.parse('2026-09-03T10:00:00Z');
		const begun = transitionTimeline(undefined, {
			siteId: youtube,
			category: 'algorithmic',
			surfaceId: 'home',
			snoozed: false,
		}, start, 'page_load', makeID, context);
		const changed = transitionTimeline(begun.active, {
			siteId: youtube,
			category: 'algorithmic',
			surfaceId: 'shorts',
			snoozed: false,
		}, start + 10_000, 'navigation', makeID, context);

		expect(changed.upserts).toHaveLength(2);
		expect(changed.upserts[0]?.endReason).toBe('navigation');
		expect(changed.active?.surfaceId).toBe('shorts');
		expect(changed.active?.startReason).toBe('navigation');
	});

	test('caps a stale open span instead of inventing unattended time', () => {
		const start = Date.parse('2026-09-03T10:00:00Z');
		const begun = transitionTimeline(undefined, {
			siteId: youtube,
			category: 'algorithmic',
			surfaceId: 'shorts',
			snoozed: false,
		}, start, 'page_load', makeID, context);
		const resumed = transitionTimeline(begun.active, {
			siteId: youtube,
			category: 'algorithmic',
			surfaceId: 'shorts',
			snoozed: false,
		}, start + 60_000, 'heartbeat', makeID, context);

		expect(resumed.upserts).toHaveLength(2);
		expect(resumed.upserts[0]?.endedAt).toBe(start + 30_000);
		expect(resumed.upserts[0]?.endReason).toBe('stale');
		expect(resumed.active?.startedAt).toBe(start + 60_000);
	});

	test('splits a span when snooze state changes', () => {
		const start = Date.parse('2026-09-03T10:00:00Z');
		const begun = transitionTimeline(undefined, {
			siteId: youtube,
			category: 'algorithmic',
			surfaceId: 'shorts',
			snoozed: false,
		}, start, 'page_load', makeID, context);
		const snoozed = transitionTimeline(begun.active, {
			siteId: youtube,
			category: 'algorithmic',
			surfaceId: 'shorts',
			snoozed: true,
		}, start + 5_000, 'heartbeat', makeID, context);

		expect(snoozed.upserts[0]?.endReason).toBe('snooze_change');
		expect(snoozed.active?.startReason).toBe('snooze_change');
		expect(snoozed.active?.snoozed).toBeTrue();
	});
});
