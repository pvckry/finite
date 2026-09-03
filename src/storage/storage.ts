import { getBrowser } from "../lib/webextension";
import type { RegionId, SiteId, SiteList } from "../types/sitelist";
import { type StorageSyncV1, SiteStateTagV1, type StorageLocal, type StorageLocalV2, CURRENT_STORAGE_SCHEMA_VERSION, type SiteConfig, type Theme, type SnoozeMode } from "./schema";

const ensureMigrated = async (): Promise<void> => {
	const browser = getBrowser();

	const [storageSync, storageLocal] = await Promise.all([
		browser.storage.sync.get(null) as Promise<StorageSyncV1 | undefined>,
		browser.storage.local.get(null) as Promise<StorageLocalV2 | undefined>,
	]);

	if (storageSync?.version == null) {
		// Nothing stored in sync storage, nothing to migrate
		await browser.storage.local.set({ 'version': CURRENT_STORAGE_SCHEMA_VERSION });
		return;
	}

	if (storageSync.version != null && storageLocal?.version === 2) {
		// Leave sync storage in place in case older versions are running elsewhere
		return;
	}

	// Do migration
	let enabledSites: SiteId[] = []

	if (storageSync.sites != null) {
		enabledSites = Object.entries(storageSync.sites)
			.filter(([, state]) => state?.type !== SiteStateTagV1.DISABLED)
			.map(([siteId,]) => siteId as SiteId);
	}

	const migratedData: StorageLocalV2 = {
		version: 2,
		snoozeMode: 'instant', // Preserve original snooze behaviour for existing users
		enabledSites,
	}

	await browser.storage.local.set(migratedData);
};

export const migrationPromise = ensureMigrated();

async function getKey<Key extends keyof StorageLocal>(k: Key, defaultValue?: undefined): Promise<NonNullable<StorageLocalV2[Key]> | undefined>;
async function getKey<Key extends keyof StorageLocal>(k: Key, defaultValue?: NonNullable<StorageLocalV2[Key]>): Promise<NonNullable<StorageLocalV2[Key]>>;
async function getKey<Key extends keyof StorageLocal>(k: Key, defaultValue: NonNullable<StorageLocalV2[Key]> | undefined): Promise<NonNullable<StorageLocalV2[Key]> | undefined> {
	const browser = getBrowser();
	await migrationPromise;
	const result = await browser.storage.local.get(k);
	if (result == null) return defaultValue;
	if (result[k] == null) return defaultValue;
	return (result[k]) as NonNullable<StorageLocal[Key]>;
}

const setKey = async <Key extends keyof StorageLocal>(k: Key, val: StorageLocal[Key]): Promise<void> => {
	const browser = getBrowser();
	await migrationPromise;
	return await browser.storage.local.set({ [k]: val });
}

export const loadSettingsLocked = () => getKey('settingsLocked', false);
export const saveSettingsLocked = (settingsLocked: boolean) => setKey('settingsLocked', settingsLocked);

export const loadEnabledSites = () => getKey('enabledSites', []);

export const saveSiteEnabled = async (siteId: SiteId, enable: boolean): Promise<void> => {
	const s = await getKey('enabledSites', []);
	let sites = new Set(s ?? []);

	enable ? sites.add(siteId) : sites.delete(siteId);

	return setKey('enabledSites', Array.from(sites));
}

export const loadSnoozeUntil = () => getKey('snoozeUntil', undefined);
export const saveSnoozeUntil = (snoozeUntil: number | undefined) => setKey('snoozeUntil', snoozeUntil);

export const loadSnoozeMode = () => getKey('snoozeMode', 'hold');
export const saveSnoozeMode = (snoozeMode: SnoozeMode) => setKey('snoozeMode', snoozeMode);

const localDateKey = (date = new Date()) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export const loadDailyBlockerCount = async () => {
	const today = localDateKey();
	const counter = await getKey('dailyBlockerCounter', { date: today, count: 0 });
	return counter.date === today ? counter.count : 0;
}

export const recordDailyBlock = async () => {
	const today = localDateKey();
	const current = await getKey('dailyBlockerCounter', { date: today, count: 0 });
	const next = {
		date: today,
		count: current.date === today ? current.count + 1 : 1,
	};
	await setKey('dailyBlockerCounter', next);
	return next.count;
}

export const loadSiteConfig = async (siteId: SiteId): Promise<SiteConfig | undefined> => {
	const sites = await getKey('siteConfig', {});
	return sites[siteId];
};

export const loadThemeForSite = async (siteId: SiteId): Promise<Theme | undefined> => loadSiteConfig(siteId).then(site => site?.theme);
export const saveThemeForSite = async (siteId: SiteId, theme: Theme | undefined) => {
	const siteConfig = (await getKey('siteConfig') ?? {});

	const site = siteConfig[siteId] ?? {
		regionEnabledOverride: {},
	};

	site.theme = theme;

	siteConfig[siteId] = site;
	return setKey('siteConfig', siteConfig);
}

export const loadRegionsForSite = async (siteId: SiteId): Promise<SiteConfig> => loadSiteConfig(siteId).then(site => site ?? { regionEnabledOverride: {} });

export const clearRegionsForSite = async (siteId: SiteId): Promise<void> => {
	const siteConfig = (await getKey('siteConfig') ?? {});

	if (siteConfig[siteId] == null) {
		// Site config doesn't exist, nothing to clear
		return;
	}

	siteConfig[siteId].regionEnabledOverride = {};
	return setKey('siteConfig', siteConfig);
}

export const setRegionEnabledForSite = async (siteId: SiteId, regionId: RegionId, enabled: boolean) => {
	const siteConfig = (await getKey('siteConfig') ?? {});

	const site = siteConfig[siteId] ?? {
		regionEnabledOverride: {},
	};

	site.regionEnabledOverride[regionId] = enabled;

	siteConfig[siteId] = site;
	return setKey('siteConfig', siteConfig);
}

let siteListPromise: Promise<SiteList> | undefined;

export const loadSitelist = async (): Promise<SiteList> => {
	if (siteListPromise == null) {
		const browser = getBrowser();
		const siteListUrl = browser.runtime.getURL('sitelist.json');
		siteListPromise = fetch(siteListUrl).then(siteList => siteList.json());
	}
	return siteListPromise
}
