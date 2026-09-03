import type { Accessor } from 'solid-js';
import { sendToServiceWorker, type UsageStatus } from '/messaging/messages';
import type { Theme } from '/storage/schema';
import type { UsageCategory } from '/storage/schema';
import type { SiteId } from '/types/sitelist';

export const BlockerPanel = ({
	siteId,
	theme,
	dailyCount,
	usage,
	category,
}: {
	siteId: Accessor<SiteId | null>;
	theme: Accessor<Theme | null>;
	dailyCount: Accessor<number | null>;
	usage: Accessor<UsageStatus | null>;
	category: Accessor<Exclude<UsageCategory, 'messages'>>;
}) => {
	const toggleTheme = async () => {
		const id = siteId();
		if (id == null) return;

		await sendToServiceWorker({
			type: 'setSiteTheme',
			siteId: id,
			theme: theme() === 'dark' ? 'light' : 'dark',
		});
	};

	const countText = () => {
		const count = dailyCount();
		if (count == null) return 'Updating today’s blocker count…';
		return `Blocked ${count} ${count === 1 ? 'time' : 'times'} today`;
	};

	const snooze = () => {
		const status = usage();
		if (status == null) return;
		return sendToServiceWorker({
			type: 'snooze',
			category: category(),
			until: Date.now() + 5 * 60 * 1000,
			triggerContext: 'blocker',
			sourceSiteId: siteId() ?? undefined,
		});
	};

	return (
		<aside class="blocker-card text-primary" aria-live="polite">
			<div class="blocker-topline">
				<div class="blocker-mark" aria-hidden="true">✓</div>
				<div>
					<div class="blocker-kicker">Distraction intercepted</div>
					<h2 class="blocker-title">Feed blocked</h2>
				</div>
			</div>
			<div class="blocker-count">{countText()}</div>
			<div class="blocker-actions">
				<button class="primary blocker-primary" onClick={() => sendToServiceWorker({ type: 'closeCurrentTab' })}>Close tab</button>
				<button class="secondary" onClick={snooze}>Snooze 5m</button>
				<button class="secondary" onClick={() => sendToServiceWorker({ type: 'openOptionsPage' })}>Settings</button>
				<button class="tertiary blocker-theme" aria-label="Toggle blocker panel theme" title="Toggle panel theme" onClick={toggleTheme}>
					{theme() === 'dark' ? '☀️' : '🌙'}
				</button>
			</div>
		</aside>
	);
};
