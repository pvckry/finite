import { createMemo, createResource, For, onCleanup, onMount, Show } from 'solid-js';
import { localDateKey, loadUsageMetrics } from '/storage/storage';
import type { SiteUsageMetrics } from '/storage/schema';
import type { SiteId } from '/types/sitelist';
import { useOptionsPageState } from './state';

const recentDateKeys = (days: number): string[] => {
	const result: string[] = [];
	const date = new Date();
	date.setHours(12, 0, 0, 0);
	for (let offset = 0; offset < days; offset += 1) {
		result.push(localDateKey(date));
		date.setDate(date.getDate() - 1);
	}
	return result;
};

const formatDuration = (milliseconds: number): string => {
	if (milliseconds <= 0) return '0m';
	const minutes = Math.max(1, Math.round(milliseconds / 60_000));
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	if (hours === 0) return `${minutes}m`;
	if (remainingMinutes === 0) return `${hours}h`;
	return `${hours}h ${remainingMinutes}m`;
};

const formatDate = (date: string): string => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
	weekday: 'short',
	month: 'short',
	day: 'numeric',
});

export const ActivityMetrics = () => {
	const state = useOptionsPageState();
	const [usage, { refetch }] = createResource(loadUsageMetrics);
	const dates = recentDateKeys(7);
	const today = dates[0]!;

	onMount(() => {
		const refresh = () => refetch();
		const timer = setInterval(refresh, 30_000);
		window.addEventListener('focus', refresh);
		onCleanup(() => {
			clearInterval(timer);
			window.removeEventListener('focus', refresh);
		});
	});

	const siteTitle = (siteId: SiteId) => state.siteList.get()?.sites.find(site => site.id === siteId)?.title ?? siteId;
	const todayTotals = (): SiteUsageMetrics => {
		const sites = usage()?.days[today]?.sites ?? {};
		const totals: SiteUsageMetrics = { visits: 0, sessions: 0, activeMs: 0 };
		for (const site of Object.values(sites)) {
			totals.visits += site?.visits ?? 0;
			totals.sessions += site?.sessions ?? 0;
			totals.activeMs += site?.activeMs ?? 0;
		}
		return totals;
	};

	const rows = createMemo(() => dates.flatMap(date => {
		const sites = usage()?.days[date]?.sites ?? {};
		return Object.entries(sites)
			.filter(([, metrics]) => metrics != null && (metrics.visits > 0 || metrics.activeMs > 0))
			.map(([siteId, metrics]) => ({
				date,
				siteId: siteId as SiteId,
				title: siteTitle(siteId as SiteId),
				metrics: metrics!,
			}))
			.sort((a, b) => a.title.localeCompare(b.title));
	}));

	return <div class="activity-panel">
		<div class="activity-summary" aria-label="Today's activity">
			<div class="activity-stat">
				<span>Visits</span>
				<strong>{todayTotals().visits}</strong>
			</div>
			<div class="activity-stat">
				<span>Sessions</span>
				<strong>{todayTotals().sessions}</strong>
			</div>
			<div class="activity-stat">
				<span>Active time</span>
				<strong>{formatDuration(todayTotals().activeMs)}</strong>
			</div>
		</div>

		<div class="activity-explainer">
			<p>A visit is a foreground entry. A new session starts after 30 minutes away.</p>
			<p>Only visible, focused tabs count toward active time.</p>
		</div>

		<Show when={rows().length > 0} fallback={<div class="activity-empty">Your last seven days will appear here as you browse.</div>}>
			<div class="activity-table-wrap">
				<table class="activity-table">
					<thead>
						<tr>
							<th>Date</th>
							<th>Site</th>
							<th class="activity-number">Visits</th>
							<th class="activity-number">Sessions</th>
							<th class="activity-number">Active time</th>
						</tr>
					</thead>
					<tbody>
						<For each={rows()}>{row => <tr>
							<td>{row.date === today ? 'Today' : formatDate(row.date)}</td>
							<td><strong>{row.title}</strong></td>
							<td class="activity-number">{row.metrics.visits}</td>
							<td class="activity-number">{row.metrics.sessions}</td>
							<td class="activity-number">{formatDuration(row.metrics.activeMs)}</td>
						</tr>}</For>
					</tbody>
				</table>
			</div>
		</Show>

		<p class="activity-privacy">Stored only in this Chrome profile for 90 days. Finite records no URLs or page content.</p>
	</div>;
};
