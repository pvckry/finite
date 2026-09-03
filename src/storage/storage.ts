import { getBrowser } from "../lib/webextension";
import type { RegionId, SiteId, SiteList } from "../types/sitelist";
import {
	type CategorySnooze,
	CURRENT_STORAGE_SCHEMA_VERSION,
	type FiniteSyncState,
	type SharedSettings,
	type SiteConfig,
	SiteStateTagV1,
	type SnoozeMode,
	type SnoozeState,
	type StorageLocal,
	type StorageLocalV2,
	type StorageLocalV3,
	type StorageSyncV1,
	type Theme,
	type UsageCategory,
	type UsageLimits,
	type UsageMetrics,
	type UsageRuntimeState,
} from "./schema";
import { dateKeyForTimestamp, emptyUsageMetrics, emptyUsageRuntimeState, migrateLegacyUsage } from "/usage/usage-metrics";

export const DEFAULT_USAGE_LIMITS: UsageLimits = {
	algorithmic: { enabled: true, dailyMs: 30 * 60 * 1000 },
	intentional: { enabled: true, dailyMs: 2 * 60 * 60 * 1000 },
};
export const DEFAULT_SNOOZE_INACTIVITY_MS = 5 * 60 * 1000;

const ensureMigrated = async (): Promise<void> => {
	const browser = getBrowser();

	const [storageSync, storageLocal] = await Promise.all([
		browser.storage.sync.get(null) as Promise<StorageSyncV1 | undefined>,
		browser.storage.local.get(null) as Promise<(StorageLocalV2 | StorageLocalV3) | undefined>,
	]);
	// Remove the obsolete pre-metrics blocker counter from existing profiles.
	await browser.storage.local.remove('dailyBlockerCounter');

	if (storageLocal?.version === CURRENT_STORAGE_SCHEMA_VERSION) {
		return;
	}

	let enabledSites: SiteId[] = storageLocal?.enabledSites ?? [];
	if (storageLocal?.version !== 2 && storageSync?.sites != null) {
		enabledSites = Object.entries(storageSync.sites)
			.filter(([, state]) => state?.type !== SiteStateTagV1.DISABLED)
			.map(([siteId,]) => siteId as SiteId);
	}

	const now = Date.now();
	const legacySnoozeUntil = storageLocal?.version === 2 ? storageLocal.snoozeUntil : undefined;
	const categorySnoozes: SnoozeState = { active: {}, history: [] };
	if (legacySnoozeUntil != null && legacySnoozeUntil > now) {
		for (const category of ['algorithmic', 'intentional'] as const) {
			categorySnoozes.active[category] = {
				id: crypto.randomUUID(),
				category,
				triggerContext: 'settings',
				startedAt: now,
				requestedEndAt: legacySnoozeUntil,
				lastActiveAt: now,
				activeMs: 0,
			};
		}
	}

	const migratedData: StorageLocalV3 = {
		version: 3,
		snoozeMode: storageLocal?.snoozeMode ?? (storageSync?.version != null ? 'instant' : 'hold'),
		settingsLocked: storageLocal?.settingsLocked,
		enabledSites,
		siteConfig: storageLocal?.siteConfig,
		usageLimits: DEFAULT_USAGE_LIMITS,
		snoozeInactivityMs: DEFAULT_SNOOZE_INACTIVITY_MS,
		categorySnoozes,
		usageMetrics: migrateLegacyUsage(storageLocal?.usageMetrics),
	};

	await browser.storage.local.set(migratedData);
};

export const migrationPromise = ensureMigrated();

async function getKey<Key extends keyof StorageLocal>(k: Key, defaultValue?: undefined): Promise<NonNullable<StorageLocalV3[Key]> | undefined>;
async function getKey<Key extends keyof StorageLocal>(k: Key, defaultValue?: NonNullable<StorageLocalV3[Key]>): Promise<NonNullable<StorageLocalV3[Key]>>;
async function getKey<Key extends keyof StorageLocal>(k: Key, defaultValue: NonNullable<StorageLocalV3[Key]> | undefined): Promise<NonNullable<StorageLocalV3[Key]> | undefined> {
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
export const saveSettingsLocked = async (settingsLocked: boolean) => {
	await setKey('settingsLocked', settingsLocked);
	await markSyncSettingsDirty();
};

export const loadEnabledSites = () => getKey('enabledSites', []);

export const saveSiteEnabled = async (siteId: SiteId, enable: boolean): Promise<void> => {
	const s = await getKey('enabledSites', []);
	let sites = new Set(s ?? []);

	enable ? sites.add(siteId) : sites.delete(siteId);

	await setKey('enabledSites', Array.from(sites));
	await markSyncSettingsDirty();
}

export const loadSnoozeMode = () => getKey('snoozeMode', 'hold');
export const saveSnoozeMode = async (snoozeMode: SnoozeMode) => {
	await setKey('snoozeMode', snoozeMode);
	await markSyncSettingsDirty();
};

export const loadUsageLimits = () => getKey('usageLimits', DEFAULT_USAGE_LIMITS);
export const saveUsageLimits = async (usageLimits: UsageLimits) => {
	await setKey('usageLimits', usageLimits);
	await markSyncSettingsDirty();
};

export const loadSnoozeInactivityMs = () => getKey('snoozeInactivityMs', DEFAULT_SNOOZE_INACTIVITY_MS);
export const loadCategorySnoozes = () => getKey('categorySnoozes', { active: {}, history: [] } as SnoozeState);
export const saveCategorySnoozes = (categorySnoozes: SnoozeState) => setKey('categorySnoozes', categorySnoozes);

export const activeSnoozeFor = async (category: UsageCategory, now = Date.now()): Promise<CategorySnooze | undefined> => {
	if (category === 'messages') return undefined;
	const state = await loadCategorySnoozes();
	const snooze = state.active[category];
	return snooze != null && snooze.requestedEndAt > now && snooze.endedAt == null ? snooze : undefined;
};

export const localDateKey = (date = new Date()) => dateKeyForTimestamp(date.getTime());

export const loadSiteConfig = async (siteId: SiteId): Promise<SiteConfig | undefined> => {
	const sites = await getKey('siteConfig', {});
	return sites[siteId];
};

export const loadUsageMetrics = async () => migrateLegacyUsage(await getKey('usageMetrics', emptyUsageMetrics()));
export const saveUsageMetrics = (usageMetrics: UsageMetrics) => setKey('usageMetrics', usageMetrics);

export const loadUsageRuntimeState = async (): Promise<UsageRuntimeState> => {
	const browser = getBrowser();
	const result = await browser.storage.session.get('usageRuntimeState');
	const state = result?.usageRuntimeState as Partial<UsageRuntimeState> | undefined;
	return {
		active: state?.active,
		timelineActive: state?.timelineActive,
		lastActivityBySurface: state?.lastActivityBySurface ?? {},
		categorySessions: state?.categorySessions ?? {},
		limitReachedKeys: state?.limitReachedKeys ?? [],
	};
};

export const saveUsageRuntimeState = async (usageRuntimeState: UsageRuntimeState): Promise<void> => {
	const browser = getBrowser();
	await browser.storage.session.set({ usageRuntimeState });
};

export const loadThemeForSite = async (siteId: SiteId): Promise<Theme | undefined> => loadSiteConfig(siteId).then(site => site?.theme);
export const saveThemeForSite = async (siteId: SiteId, theme: Theme | undefined) => {
	const siteConfig = (await getKey('siteConfig') ?? {});

	const site = siteConfig[siteId] ?? {
		regionEnabledOverride: {},
	};

	site.theme = theme;

	siteConfig[siteId] = site;
	await setKey('siteConfig', siteConfig);
	await markSyncSettingsDirty();
}

export const loadRegionsForSite = async (siteId: SiteId): Promise<SiteConfig> => loadSiteConfig(siteId).then(site => site ?? { regionEnabledOverride: {} });

export const clearRegionsForSite = async (siteId: SiteId): Promise<void> => {
	const siteConfig = (await getKey('siteConfig') ?? {});

	if (siteConfig[siteId] == null) {
		// Site config doesn't exist, nothing to clear
		return;
	}

	siteConfig[siteId].regionEnabledOverride = {};
	await setKey('siteConfig', siteConfig);
	await markSyncSettingsDirty();
}

export const setRegionEnabledForSite = async (siteId: SiteId, regionId: RegionId, enabled: boolean) => {
	const siteConfig = (await getKey('siteConfig') ?? {});

	const site = siteConfig[siteId] ?? {
		regionEnabledOverride: {},
	};

	site.regionEnabledOverride[regionId] = enabled;

	siteConfig[siteId] = site;
	await setKey('siteConfig', siteConfig);
	await markSyncSettingsDirty();
}

export const loadFiniteSyncState = async (): Promise<FiniteSyncState> => {
	const existing = await getKey('finiteSync');
	if (existing != null) return existing;
	const created: FiniteSyncState = {
		installationId: crypto.randomUUID(),
		settingsDirty: true,
	};
	await setKey('finiteSync', created);
	return created;
};

export const saveFiniteSyncState = (finiteSync: FiniteSyncState) => setKey('finiteSync', finiteSync);

export const markSyncSettingsDirty = async (): Promise<void> => {
	const state = await loadFiniteSyncState();
	if (state.settingsDirty) return;
	await saveFiniteSyncState({ ...state, settingsDirty: true });
};

export const loadSharedSettings = async (): Promise<SharedSettings> => {
	const [limits, enabledSites, snoozeMode, settingsLocked, siteConfig, snoozeInactivityMs] = await Promise.all([
		loadUsageLimits(),
		loadEnabledSites(),
		loadSnoozeMode(),
		loadSettingsLocked(),
		getKey('siteConfig', {}),
		loadSnoozeInactivityMs(),
	]);
	return {
		schemaVersion: 1,
		dayTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
		limits,
		snooze: { endAfterInactiveMs: snoozeInactivityMs },
		enabledSites,
		snoozeMode,
		settingsLocked,
		siteConfig,
	};
};

export const applySharedSettings = async (settings: SharedSettings): Promise<void> => {
	const browser = getBrowser();
	await migrationPromise;
	await browser.storage.local.set({
		version: CURRENT_STORAGE_SCHEMA_VERSION,
		usageLimits: settings.limits,
		snoozeInactivityMs: settings.snooze.endAfterInactiveMs,
		enabledSites: settings.enabledSites,
		snoozeMode: settings.snoozeMode,
		settingsLocked: settings.settingsLocked,
		siteConfig: settings.siteConfig,
	});
};

let siteListPromise: Promise<SiteList> | undefined;

export const loadSitelist = async (): Promise<SiteList> => {
	if (siteListPromise == null) {
		const browser = getBrowser();
		const siteListUrl = browser.runtime.getURL('sitelist.json');
		siteListPromise = fetch(siteListUrl).then(siteList => siteList.json());
	}
	return siteListPromise
}
