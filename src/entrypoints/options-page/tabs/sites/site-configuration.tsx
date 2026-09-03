import { createResource, For, Show, type Accessor } from "solid-js";
import type { RegionId, Site, SiteId } from "/types/sitelist";
import { loadRegionsForSite, setRegionEnabledForSite } from "/storage/storage";
import { sendToServiceWorker } from "/messaging/messages";
import { expect } from "/lib/util";
import { useOptionsPageState } from "../../state";

export const SiteConfigPanel = ({ site } : { site: Accessor<Site | null> }) => {
	const [siteRegions, { refetch }] = createResource(async () => {
		return loadRegionsForSite(expect(site()).id);
	});

	const isRegionActive = (regionId: RegionId) => {
		const r = siteRegions();
		if (r == null) return null; // Region settings not yet loaded

		const defaultValue = site()!.regions.find(region => region.id === regionId)?.default ?? true;
		return r.regionEnabledOverride[regionId] ?? defaultValue;
	}

	return <div class="site-config space-y-4 py-4">
		<div class="px-4 flex space-x-2 cross-end site-config-header">
			<div class="flex-1 space-y-1">
				<div class="options-kicker">Fine-tune blocker</div>
				<h3 class="font-xl font-bold">{expect(site()).title}</h3>
			</div>
			<a class="font-sm hover:underline" target="_blank" href={`https://${expect(site()?.hosts[0])}`}>Visit site</a>
		</div>
		<div class="px-4">
			<p class="text-secondary font-sm">Toggle individual distractions without disabling the whole site.</p>
		</div>
		<ul class="region-list">
			<For each={expect(site()).regions}>
				{region => <li>
					<RegionToggleButton siteId={expect(site()).id} regionId={region.id} refetch={refetch} value={() => isRegionActive(region.id)} label={region.title} />
				</li>}
			</For>
		</ul>
	</div>
}

const RegionToggleButton = ({siteId, regionId, label, value, refetch}: { siteId: SiteId, regionId: RegionId, label: string, value: Accessor<boolean | null>, refetch: () => void }) => {
	const state = useOptionsPageState();

	const toggle = async (e: { preventDefault: () => void }) => {
		await setRegionEnabledForSite(siteId, regionId, !value());

		refetch();
		await sendToServiceWorker({
			type: 'notifyOptionsUpdated',
		})
	}

	const id = () => `region-toggle-${regionId}`;

	return <Show when={value() !== null}>
		<label for={id()} class="flex cross-center cursor-pointer hoverable px-4">
			<input id={id()} type="checkbox" class="toggle" disabled={state.settingsLockedDown()} onClick={toggle} checked={expect(value())} />
			<span class="flex-1 px-2 py-1">{ label }</span>
		</label>
	</Show>
}
