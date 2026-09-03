import type {
	ActivityEndReason,
	ActivitySpanEvent,
	ActivityStartReason,
	InterventionEvent,
	InterventionKind,
	TimelineActivityReason,
	UsageCategory,
	UsageSurfaceId,
} from '/storage/schema';
import type { SiteId } from '/types/sitelist';
import { MAX_USAGE_CHECKPOINT_MS } from './usage-metrics';

export type TimelineActivityInput = {
	siteId: SiteId;
	category: UsageCategory;
	surfaceId: UsageSurfaceId;
	snoozed: boolean;
};

export type TimelineTransition = {
	active?: ActivitySpanEvent;
	upserts: ActivitySpanEvent[];
};

type LocalContext = {
	timeZone: string;
	utcOffsetMinutes: number;
};

export const localTimelineContext = (timestamp: number): LocalContext => ({
	timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
	utcOffsetMinutes: -new Date(timestamp).getTimezoneOffset(),
});

const startReason = (reason: TimelineActivityReason, previous?: ActivitySpanEvent): ActivityStartReason => {
	if (reason === 'focus') return 'focus';
	if (reason === 'navigation') return 'navigation';
	if (reason === 'surface_change') return 'surface_change';
	if (reason === 'heartbeat' || reason === 'visible') return previous == null ? 'resume' : 'surface_change';
	return 'page_load';
};

const requestedEndReason = (reason: TimelineActivityReason): ActivityEndReason => {
	if (reason === 'blur') return 'blur';
	if (reason === 'hidden') return 'hidden';
	if (reason === 'pagehide') return 'pagehide';
	if (reason === 'navigation') return 'navigation';
	return 'surface_change';
};

const sameContext = (
	active: ActivitySpanEvent,
	input: TimelineActivityInput,
	context: LocalContext,
) => active.siteId === input.siteId
	&& active.category === input.category
	&& active.surfaceId === input.surfaceId
	&& active.snoozed === input.snoozed
	&& active.timeZone === context.timeZone
	&& active.utcOffsetMinutes === context.utcOffsetMinutes;

const close = (
	active: ActivitySpanEvent,
	requestedAt: number,
	reason: ActivityEndReason,
): ActivitySpanEvent => {
	const endedAt = Math.max(
		active.startedAt,
		Math.min(requestedAt, active.observedThrough + MAX_USAGE_CHECKPOINT_MS),
	);
	return {
		...active,
		observedThrough: endedAt,
		endedAt,
		endReason: requestedAt > active.observedThrough + MAX_USAGE_CHECKPOINT_MS ? 'stale' : reason,
		updatedAt: requestedAt,
	};
};

export const transitionTimeline = (
	active: ActivitySpanEvent | undefined,
	input: TimelineActivityInput | undefined,
	now: number,
	reason: TimelineActivityReason,
	makeID: () => string = () => crypto.randomUUID(),
	context: LocalContext = localTimelineContext(now),
): TimelineTransition => {
	if (input == null) {
		if (active == null) return { upserts: [] };
		const ended = close(active, now, requestedEndReason(reason));
		return { upserts: [ended] };
	}

	if (active != null && sameContext(active, input, context)
		&& now <= active.observedThrough + MAX_USAGE_CHECKPOINT_MS) {
		const observed = {
			...active,
			observedThrough: Math.max(active.observedThrough, now),
			updatedAt: now,
		};
		return { active: observed, upserts: [observed] };
	}

	const upserts: ActivitySpanEvent[] = [];
	if (active != null) {
		const contextChanged = active.timeZone !== context.timeZone
			|| active.utcOffsetMinutes !== context.utcOffsetMinutes;
		const endReason: ActivityEndReason = now > active.observedThrough + MAX_USAGE_CHECKPOINT_MS
			? 'stale'
			: active.snoozed !== input.snoozed
				? 'snooze_change'
				: contextChanged
					? 'surface_change'
					: requestedEndReason(reason);
		upserts.push(close(active, now, endReason));
	}

	const next: ActivitySpanEvent = {
		id: makeID(),
		kind: 'activity_span',
		eventVersion: 1,
		siteId: input.siteId,
		category: input.category,
		surfaceId: input.surfaceId,
		snoozed: input.snoozed,
		startedAt: now,
		observedThrough: now,
		startReason: active != null && active.snoozed !== input.snoozed
			? 'snooze_change'
			: startReason(reason, active),
		timeZone: context.timeZone,
		utcOffsetMinutes: context.utcOffsetMinutes,
		updatedAt: now,
	};
	upserts.push(next);
	return { active: next, upserts };
};

export const createInterventionEvent = (
	input: Omit<TimelineActivityInput, 'snoozed'> & { category: Exclude<UsageCategory, 'messages'> },
	interventionKind: InterventionKind,
	now = Date.now(),
	makeID: () => string = () => crypto.randomUUID(),
	context: LocalContext = localTimelineContext(now),
): InterventionEvent => ({
	id: makeID(),
	kind: 'intervention',
	eventVersion: 1,
	siteId: input.siteId,
	category: input.category,
	surfaceId: input.surfaceId,
	interventionKind,
	occurredAt: now,
	timeZone: context.timeZone,
	utcOffsetMinutes: context.utcOffsetMinutes,
	updatedAt: now,
});
