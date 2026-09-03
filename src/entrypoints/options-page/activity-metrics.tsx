import { createMemo, createResource, For, onCleanup, onMount, Show } from 'solid-js';
import { loadFiniteSyncState, localDateKey, loadUsageMetrics } from '/storage/storage';
import type { CategoryUsageMetrics, ConsolidatedDailyTotal, UsageCategory } from '/storage/schema';
import type { SiteId } from '/types/sitelist';
import { categoryTitle } from '/usage/categories';
import { flattenUsageMetrics } from '/usage/usage-metrics';
import { useOptionsPageState } from './state';

type ActivityRow = ConsolidatedDailyTotal;
const categories: UsageCategory[] = ['algorithmic', 'intentional', 'messages'];
const fields = ['visits', 'sessions', 'activeMs', 'snoozedActiveMs', 'limitReachedCount'] as const;

const recentDateKeys = (days: number): string[] => {
	const result: string[] = [];
	const cursor = new Date();
	while (result.length < days) {
		const key = localDateKey(cursor);
		if (!result.includes(key)) result.push(key);
		cursor.setUTCDate(cursor.getUTCDate() - 1);
	}
	return result;
};

export const formatDuration = (milliseconds: number): string => {
	if (milliseconds <= 0) return '0m';
	const minutes = Math.max(1, Math.round(milliseconds / 60_000));
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	if (hours === 0) return `${minutes}m`;
	if (remainingMinutes === 0) return `${hours}h`;
	return `${hours}h ${remainingMinutes}m`;
};

const formatDate = (date: string): string => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
	timeZone: 'Europe/London',
	weekday: 'short',
	month: 'short',
	day: 'numeric',
});

const rowKey = (row: Pick<ActivityRow, 'date' | 'siteId' | 'category'>) => `${row.date}:${row.siteId}:${row.category}`;
const zeroMetrics = (): CategoryUsageMetrics => ({ visits: 0, sessions: 0, activeMs: 0, snoozedActiveMs: 0, limitReachedCount: 0 });

export const ActivityMetrics = () => {
	const state = useOptionsPageState();
	const [usage, usageActions] = createResource(loadUsageMetrics);
	const [sync, syncActions] = createResource(loadFiniteSyncState);
	const dates = recentDateKeys(7);
	const today = dates[0]!;

	onMount(() => {
		const refresh = () => {
			usageActions.refetch();
			syncActions.refetch();
		};
		const timer = setInterval(refresh, 30_000);
		window.addEventListener('focus', refresh);
		onCleanup(() => {
			clearInterval(timer);
			window.removeEventListener('focus', refresh);
		});
	});

	const effectiveRows = createMemo((): ActivityRow[] => {
		const localRows = usage() == null ? [] : flattenUsageMetrics(usage()!).map(({ metricVersion: _, ...row }) => row);
		const syncState = sync();
		if (syncState?.installationToken == null || syncState.consolidatedDailyTotals == null) return localRows;

		const rows = new Map(syncState.consolidatedDailyTotals.map(row => [rowKey(row), { ...row }]));
		const uploaded = new Map(
			(syncState.lastUploadedUsage == null ? [] : flattenUsageMetrics(syncState.lastUploadedUsage))
				.map(row => [rowKey(row as ActivityRow), row]),
		);
		for (const local of localRows) {
			const key = rowKey(local);
			const server = rows.get(key) ?? { ...local, visits: 0, sessions: 0, activeMs: 0, snoozedActiveMs: 0, limitReachedCount: 0 };
			const previous = uploaded.get(key);
			for (const field of fields) server[field] += Math.max(0, local[field] - (previous?.[field] ?? 0));
			rows.set(key, server);
		}
		return Array.from(rows.values());
	});

	const todayTotals = (category: UsageCategory): CategoryUsageMetrics => {
		const total = zeroMetrics();
		for (const row of effectiveRows()) {
			if (row.date !== today || row.category !== category) continue;
			for (const field of fields) total[field] += row[field];
		}
		return total;
	};

	const siteTitle = (siteId: SiteId) => state.siteList.get()?.sites.find(site => site.id === siteId)?.title ?? siteId;
	const rows = createMemo(() => effectiveRows()
		.filter(row => dates.includes(row.date) && (row.visits > 0 || row.activeMs > 0))
		.map(row => ({ ...row, title: siteTitle(row.siteId) }))
		.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title) || a.category.localeCompare(b.category)));

	return <div class="activity-panel">
		<div class="activity-category-summary" aria-label="Today's activity by category">
			<For each={categories}>{category => <div class={`activity-category activity-${category}`}>
				<span>{categoryTitle(category)}</span>
				<strong>{formatDuration(todayTotals(category).activeMs)}</strong>
				<small>{todayTotals(category).visits} visits · {todayTotals(category).sessions} sessions</small>
			</div>}</For>
		</div>

		<div class="activity-explainer">
			<p>A visit is a foreground entry. A new session starts after 30 minutes away.</p>
			<p>Timers pause whenever the tab or browser window is not focused.</p>
		</div>

		<Show when={rows().length > 0} fallback={<div class="activity-empty">Your last seven days will appear here as you browse.</div>}>
			<div class="activity-table-wrap">
				<table class="activity-table">
					<thead><tr>
						<th>Date</th><th>Site</th><th>Category</th>
						<th class="activity-number">Visits</th><th class="activity-number">Sessions</th><th class="activity-number">Active</th>
					</tr></thead>
					<tbody><For each={rows()}>{row => <tr>
						<td>{row.date === today ? 'Today' : formatDate(row.date)}</td>
						<td><strong>{row.title}</strong></td>
						<td><span class={`category-pill category-${row.category}`}>{categoryTitle(row.category)}</span></td>
						<td class="activity-number">{row.visits}</td>
						<td class="activity-number">{row.sessions}</td>
						<td class="activity-number">{formatDuration(row.activeMs)}</td>
					</tr>}</For></tbody>
				</table>
			</div>
		</Show>

		<p class="activity-privacy">Finite records categories and totals—not URLs, titles, searches, messages, or page content. Paired browsers keep 90 days on Zenithar.</p>
	</div>;
};
