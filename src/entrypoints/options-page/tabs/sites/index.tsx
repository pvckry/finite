import { createMemo, For, Show } from "solid-js";
import { getBrowser } from "/lib/webextension";
import type { Site } from "/types/sitelist";
import { originsForSite } from "/lib/util";
import { SiteConfigPanel } from "./site-configuration";
import { useOptionsPageState } from "../../state";
import { LockedSettingsOverlay, SettingsLockFooter } from "../../lock";

const browser = getBrowser();

const Site = ({ site }: { site: Site }) => {
	const state = useOptionsPageState();

	async function enableSite(site: Site) {
		const origins = originsForSite(site);

		const permissionAccepted = await state.requestPermissions({ origins, permissions: [] });

		if (!permissionAccepted) {
			return disableSite(site);
		}

		await browser.runtime.sendMessage({
			type: 'enableSite',
			siteId: site.id
		});

		await state.enabledSites.refetch();
	};

	const disableSite = async (site: Site) => {
		const origins = originsForSite(site);

		await browser.runtime.sendMessage({
			type: 'disableSite',
			siteId: site.id
		});

		await state.enabledSites.refetch();

		const enabledSiteIds = new Set(state.enabledSites.get() ?? []);
		const originsStillNeeded = new Set(
			(state.siteList.get()?.sites ?? [])
				.filter(candidate => enabledSiteIds.has(candidate.id))
				.flatMap(originsForSite)
		);
		const removableOrigins = origins.filter(origin => !originsStillNeeded.has(origin));
		if (removableOrigins.length > 0) {
			await state.removePermissions({ origins: removableOrigins, permissions: [] });
		}
		state.selectedSiteId.set(null);
	}

	const id = `site-toggle-${site.id}`;
	const selectSite = () => state.selectedSiteId.set(state.selectedSiteId.get() === site.id ? null : site.id);

	return <>
		<li class="site-row" aria-selected={state.selectedSiteId.get() === site.id}>
			<input id={id} aria-label={`Enable ${site.title}`} type="checkbox" disabled={state.settingsLockedDown()} class="toggle" onChange={event => {
				if (event.currentTarget.checked) enableSite(site);
				else disableSite(site);
			}} checked={state.siteState(site.id).enabled} />
			<button type="button" class="site-select" onClick={selectSite} aria-expanded={state.selectedSiteId.get() === site.id}>
				<Show when={state.sitesWithInvalidPermissions().includes(site.id)}>
					<span class="">⚠️</span>
				</Show>
				<div class="flex flex-col flex-1 site-copy">
					<div class="font-bold">{site.title}</div>
					<div class="font-xs text-figure-500">{site.hosts.join(', ')}</div>
				</div>
				<span class="site-chevron" aria-hidden="true">›</span>
			</button>
		</li>
	</>
}

export const SiteList = () => {
	const state = useOptionsPageState();

	const selectedSite = createMemo(() => {
		const siteId = state.selectedSiteId.get();
		if (!siteId) return null;
		return state.siteList.get()?.sites.find(s => s.id === siteId) ?? null;
	});

	return  <div class="overlay-container">
		<div class="flex site-browser blur-disabled" aria-disabled={state.settingsLockedDown()}>
			<ul class={`flex viewport-scroller flex-col py-2 site-list ${selectedSite() == null ? 'flex-1' : 'br-1 mw-xs'}`}>
				<For each={state.siteList.get()?.sites}>
					{site => <Site site={site} />}
				</For>
			</ul>
			<Show when={selectedSite() != null}>
				<div class="flex-1 site-detail">
					<SiteConfigPanel site={selectedSite} />
				</div>
			</Show>
		</div>

		<LockedSettingsOverlay />
	</div>
};

export const SitesTabContent = () => {
	return <div>
		<SiteList />
		<SettingsLockFooter />
	</div>
}
