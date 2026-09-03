import { createContext, useContext, createResource, createMemo } from "solid-js";
import { expect, originsForSite } from "../../lib/util";
import type { SiteId, SiteList } from "../../types/sitelist";
import { loadEnabledSites, loadSnoozeMode } from "../../storage/storage";
import { getBrowser, type Permissions } from "../../lib/webextension";
import { resourceObj, signalObj } from "/lib/solid-util";
import { StorageState } from "./state/storage";
import type { FiniteSyncView } from "/messaging/messages";
import type { SnoozeState, UsageCategory } from "/storage/schema";

type SiteState = {
	enabled: boolean,
	permissionsEnabled: boolean,
};

const browser = getBrowser();

export class OptionsPageState {
	selectedSiteId = signalObj<SiteId | null>(null);
	clock = signalObj<number>(Date.now());

	storage = new StorageState();

	snoozeState = resourceObj(createResource<SnoozeState>(async () => browser.runtime.sendMessage({ type: 'readSnooze' })));
	snoozeMode = resourceObj(createResource(loadSnoozeMode));
	finiteSync = resourceObj(createResource<FiniteSyncView>(async () => browser.runtime.sendMessage({ type: 'readFiniteSync' })));
	enabledSites = resourceObj(createResource(loadEnabledSites));
	permissions = resourceObj(createResource(() => browser.permissions.getAll()));

	siteList = resourceObj(createResource<SiteList | undefined>(async () => {
			const siteListUrl = browser.runtime.getURL('sitelist.json');
			return await fetch(siteListUrl).then(siteList => siteList.json());
	}));

	constructor() {
		// Clock is only used for animating and updating displayed times
		const updateClock = () => {
			this.clock.set(Date.now());
			requestAnimationFrame(updateClock);
		};
		requestAnimationFrame(updateClock);
	}

	async requestPermissions(permissions: Permissions): Promise<boolean> {
		const result = await browser.permissions.request(permissions);
		this.permissions.refetch();
		return result;
	}

	async removePermissions(permissions: Permissions) {
		await browser.permissions.remove(permissions);
		this.permissions.refetch();
	}

	siteState(siteId: SiteId): SiteState {
		const enabled = this.enabledSites.get()?.includes(siteId) ?? false;
		const site = this.siteList.get()?.sites.find(site => site.id === siteId);

		let permissionsEnabled = true;
		if (site != null) {
			const origins = originsForSite(site);
			for (const origin of origins) {
				if (!this.permissions.get()?.origins.includes(origin)) {
					permissionsEnabled = false;
					break;
				}
			}
		}

		return {
			enabled,
			permissionsEnabled,
		}
	}

	sitesWithInvalidPermissions = createMemo(() => {
		let invalidSites: SiteId[] = [];
		const enabledSites = this.enabledSites.get() ?? [];

		for (const siteId of enabledSites) {
			const siteState = this.siteState(siteId);
			if (!siteState.permissionsEnabled) {
				invalidSites.push(siteId);
			}
		}

		return invalidSites;
	});

	allSitePermissionsValid() {
		return this.sitesWithInvalidPermissions().length === 0;
	}

	fixPermissions() {
		const invalidSites = this.sitesWithInvalidPermissions();

		let origins: string[] = [];

		for (const siteId of invalidSites) {
			const site = this.siteList.get()?.sites.find(site => site.id === siteId);
			if (site == null) continue;
			origins.push(...originsForSite(site));
		}

		this.requestPermissions({ origins, permissions: [] });
	}

	async startSnooze(category: Exclude<UsageCategory, 'messages'>, durationMs: number) {
		await browser.runtime.sendMessage({
			type: 'snooze',
			category,
			until: this.clock.get() + durationMs,
			triggerContext: 'settings',
		})

		this.snoozeState.refetch();
	}

	async cancelSnooze(category: Exclude<UsageCategory, 'messages'>) {
		await browser.runtime.sendMessage({
			type: 'snooze',
			category,
			until: this.clock.get(),
			triggerContext: 'settings',
		})
		this.snoozeState.refetch();
	}

	snoozeRemaining(category: Exclude<UsageCategory, 'messages'>) {
		const snooze = this.snoozeState.get()?.active[category];
		if (snooze == null) return 0;
		return Math.max(0, snooze.requestedEndAt - this.clock.get());
	}

	async setSettingsLocked(locked: boolean) {
		if (locked) {
			this.selectedSiteId.set(null);
		}
		await this.storage.setSettingsLocked(locked);
		await browser.runtime.sendMessage({ type: 'notifyOptionsUpdated' });
	}

	/**
 * Returns true if the user is not currently allowed to change settings (eg not currently snoozing)
 */
	settingsLockedDown() {
		return this.storage.settingsLocked.get() ?? false;
	}

	canUnlockSettings() {
		return this.snoozeRemaining('algorithmic') > 0 || this.snoozeRemaining('intentional') > 0;
	}
}

export const OptionsPageStateContext = createContext<OptionsPageState>();
export const useOptionsPageState = () => expect(useContext(OptionsPageStateContext));
