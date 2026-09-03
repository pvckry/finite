import { render } from "solid-js/web";
import h from "solid-js/h";
import { Show, type ParentComponent } from "solid-js";

import { OptionsPageState, OptionsPageStateContext } from "./state";
import { Snooze } from "./snooze";
import { SitesTabContent } from "./tabs/sites";
import { SnoozeTabContent } from "./tabs/snooze";
import { versionText } from "/lib/util";
import { ActivityMetrics } from "./activity-metrics";
import { UsageLimitsPanel } from "./limits";
import { SyncPanel } from "./sync-panel";

const SettingsSection: ParentComponent<{ kicker: string, title: string, description: string }> = ({ kicker, title, description, children }) => (
	<section class="settings-section">
		<header class="settings-section-header">
			<div class="options-kicker">{kicker}</div>
			<h2>{title}</h2>
			<p>{description}</p>
		</header>
		<div class="settings-card shadow">{children}</div>
	</section>
);

const OptionsPage = () => {
	const state = new OptionsPageState();

	return <main class="options-page text-figure">
		<div class="options-shell space-y-8">
			<header class="options-header">
				<img class="options-logo" src="../../assets/icon64.png" alt="" />
				<div>
					<div class="options-kicker">Intentional browsing</div>
					<h1 class="options-title">Finite</h1>
					<p class="options-subtitle">Choose what disappears. Keep everything else.</p>
				</div>
			</header>

			<OptionsPageStateContext.Provider value={state}>
				<Show when={!state.allSitePermissionsValid()}>
					<div class="flex p-4 card shadow primary outlined gap-2 cross-center">
						<div>⚠️</div>
						<p class="flex-1 flex cross-center">Some enabled sites need more permissions to work correctly.</p>
						<button class="primary" onClick={() => state.fixPermissions()}>Fix permissions</button>
					</div>
				</Show>

				<div class="settings-sections">
					<SettingsSection kicker="Blockers" title="Sites" description="Enable a site, then fine-tune exactly which regions disappear.">
						<SitesTabContent />
					</SettingsSection>

					<SettingsSection kicker="Activity" title="Your browsing" description="Daily foreground visits, sessions, and active time across enabled sites.">
						<ActivityMetrics />
					</SettingsSection>

					<SettingsSection kicker="Boundaries" title="Daily limits" description="Use one shared allowance across both browsers; messages are always available.">
						<UsageLimitsPanel />
					</SettingsSection>

					<SettingsSection kicker="Take a break" title="Snooze" description="Temporarily restore blocked regions without changing your setup.">
						<div class="section-stack">
							<Snooze />
							<div class="subsection-heading">
								<strong>Snooze interaction</strong>
								<span>Choose how a snooze starts for both limited categories.</span>
							</div>
							<SnoozeTabContent />
						</div>
					</SettingsSection>

					<SettingsSection kicker="Across devices" title="Browser sync" description="Consolidate activity and keep settings aligned through your private Zenithar instance.">
						<SyncPanel />
					</SettingsSection>

				</div>

				<footer class="options-footer">
					<a href="https://github.com/pvckry/finite" target="_blank">View source on GitHub</a>
					<span aria-hidden="true">•</span>
					<span>Based on News Feed Eradicator by Jordan West and contributors</span>
					<span aria-hidden="true">•</span>
					<span>{versionText()}</span>
				</footer>
			</OptionsPageStateContext.Provider>
		</div>
	</main>
}

render(h(OptionsPage), document.querySelector("#root")!);
