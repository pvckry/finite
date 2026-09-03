import { createSignal, onCleanup, onMount, Show, type Accessor } from 'solid-js';
import { categoryTitle } from '/usage/categories';
import { sendToServiceWorker, type UsageStatus } from '/messaging/messages';
import type { SiteId } from '/types/sitelist';

const formatDuration = (milliseconds: number) => {
	const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
		: `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const UsageOverlay = ({ status, siteId }: {
	status: Accessor<UsageStatus | null>;
	siteId: Accessor<SiteId | null>;
}) => {
	const [clock, setClock] = createSignal(Date.now());
	onMount(() => {
		const timer = setInterval(() => setClock(Date.now()), 1000);
		onCleanup(() => clearInterval(timer));
	});

	const liveDelta = () => {
		const value = status();
		return value == null || document.visibilityState !== 'visible' || !document.hasFocus()
			? 0
			: Math.max(0, clock() - value.updatedAt);
	};
	const session = () => (status()?.sessionMs ?? 0) + liveDelta();
	const daily = () => (status()?.dailyMs ?? 0) + liveDelta();
	const remaining = () => status()?.remainingMs == null ? null : Math.max(0, status()!.remainingMs! - liveDelta());
	const snoozeRemaining = () => Math.max(0, (status()?.snoozeUntil ?? 0) - clock());
	const snoozeLimit = () => {
		const value = status();
		if (value == null || value.category === 'messages') return;
		return sendToServiceWorker({
			type: 'snooze',
			category: value.category,
			until: Date.now() + 5 * 60 * 1000,
			triggerContext: 'limit',
			sourceSiteId: siteId() ?? undefined,
		});
	};

	return <>
		<Show when={status() != null}>
			<div class="usage-hud text-primary" aria-live="polite">
				<strong>{categoryTitle(status()!.category)}</strong>
				<span>Session {formatDuration(session())}</span>
				<span>Today {formatDuration(daily())}</span>
				<Show when={remaining() != null && snoozeRemaining() === 0}>
					<span class="usage-remaining">{formatDuration(remaining()!)} left</span>
				</Show>
				<Show when={snoozeRemaining() > 0}>
					<span class="usage-remaining">Snoozed {formatDuration(snoozeRemaining())}</span>
				</Show>
				<Show when={status()!.category === 'messages'}>
					<span class="usage-unlimited">No limit</span>
				</Show>
			</div>
		</Show>

		<Show when={status()?.limitReached === true}>
			<div class="limit-backdrop text-primary" role="dialog" aria-modal="true" aria-labelledby="finite-limit-title">
				<div class="limit-card">
					<div class="blocker-mark" aria-hidden="true">✓</div>
					<div class="blocker-kicker">Daily boundary reached</div>
					<h2 id="finite-limit-title">That’s enough {categoryTitle(status()!.category).toLowerCase()} time for today.</h2>
					<p>You’ve used {formatDuration(daily())}. Finite will keep this category closed until tomorrow.</p>
					<div class="limit-actions">
						<button class="primary" onClick={() => sendToServiceWorker({ type: 'closeCurrentTab' })}>Close tab</button>
						<button class="secondary" onClick={snoozeLimit}>Snooze 5 minutes</button>
						<button class="tertiary" onClick={() => sendToServiceWorker({ type: 'openOptionsPage' })}>Settings</button>
					</div>
				</div>
			</div>
		</Show>
	</>;
};
