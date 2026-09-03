import { createResource, For, Show } from 'solid-js';
import { getBrowser } from '/lib/webextension';
import type { UsageLimits } from '/storage/schema';
import { categoryTitle } from '/usage/categories';

const browser = getBrowser();
const categories = ['algorithmic', 'intentional'] as const;

export const UsageLimitsPanel = () => {
	const [limits, { mutate, refetch }] = createResource<UsageLimits>(async () => browser.runtime.sendMessage({ type: 'readUsageLimits' }));

	const save = async (next: UsageLimits) => {
		mutate(next);
		await browser.runtime.sendMessage({ type: 'saveUsageLimits', limits: next });
		await refetch();
	};

	return <div class="limits-panel">
		<For each={categories}>{category => <div class="limit-setting">
			<div class="limit-setting-copy">
				<strong>{categoryTitle(category)}</strong>
				<span>{category === 'algorithmic' ? 'Recommendations, feeds, Explore, Reels, and Shorts.' : 'Following, subscriptions, search, and direct visits.'}</span>
			</div>
			<Show when={limits() != null}>
				<label class="limit-enabled">
					<input
						type="checkbox"
						class="toggle"
						checked={limits()![category].enabled}
						onChange={event => save({ ...limits()!, [category]: { ...limits()![category], enabled: event.currentTarget.checked } })}
					/>
					<span>Limit</span>
				</label>
				<label class="limit-duration">
					<input
						type="number"
						min="1"
						max="1440"
						step="5"
						disabled={!limits()![category].enabled}
						value={Math.round(limits()![category].dailyMs / 60_000)}
						onChange={event => {
							const minutes = Math.min(1440, Math.max(1, Number(event.currentTarget.value) || 1));
							save({ ...limits()!, [category]: { ...limits()![category], dailyMs: minutes * 60_000 } });
						}}
					/>
					<span>minutes / day</span>
				</label>
			</Show>
		</div>}</For>
		<div class="messages-limit-note">
			<strong>Messages</strong>
			<span>Always unlimited, while still counted separately.</span>
		</div>
		<p class="panel-note">Limits use Europe/London days and consolidated totals when browser sync is paired.</p>
	</div>;
};
