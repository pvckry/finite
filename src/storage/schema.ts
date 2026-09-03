import type { RegionId, SiteId } from "../types/sitelist";

export const CURRENT_STORAGE_SCHEMA_VERSION = 2;

export type SnoozeMode = 'instant' | 'hold';

export type DailyBlockerCounter = {
	date: string;
	count: number;
};

export type StorageLocalV2 = {
	version: 2;
	snoozeMode?: SnoozeMode;
	settingsLocked?: boolean;
	enabledSites?: SiteId[];
	siteConfig?: Record<SiteId, SiteConfig>;
	snoozeUntil?: number;
	dailyBlockerCounter?: DailyBlockerCounter;
};

export type SiteConfig = {
	theme?: Theme;
	// Overrides the enabled state from the sitelist if set
	regionEnabledOverride: Record<RegionId, boolean>;
};

export type Theme = 'light' | 'dark';

export type StorageLocal = StorageLocalV2;

///////// OLDER VERSIONS /////////

/**
 * Deprecated in v3.0.0
 */
export type StorageSyncV1 = {
	version: 1;
	sites: Partial<SitesStateV1>;
};

export type SitesStateV1 = Record<SiteId, SiteStateV1>;

export const enum SiteStateTagV1 {
	ENABLED = 'enabled',
	CHECK_PERMISSIONS = 'check_permissions',
	DISABLED = 'disabled',
	DISABLED_TEMPORARILY = 'disabled_temporarily',
}

export type SiteStateV1 =
	| { type: SiteStateTagV1.ENABLED }
	| { type: SiteStateTagV1.DISABLED }
	| { type: SiteStateTagV1.CHECK_PERMISSIONS }
	| { type: SiteStateTagV1.DISABLED_TEMPORARILY; disabled_until: number };
