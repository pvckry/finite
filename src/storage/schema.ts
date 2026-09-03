import type { RegionId, SiteId } from "../types/sitelist";

export const CURRENT_STORAGE_SCHEMA_VERSION = 3;

export type SnoozeMode = 'instant' | 'hold';

export type UsageCategory = 'algorithmic' | 'intentional' | 'messages';

export const USAGE_CATEGORIES: UsageCategory[] = ['algorithmic', 'intentional', 'messages'];

export type CategoryUsageMetrics = {
	visits: number;
	sessions: number;
	activeMs: number;
	snoozedActiveMs: number;
	limitReachedCount: number;
};

export type SiteUsageMetrics = {
	categories: Partial<Record<UsageCategory, CategoryUsageMetrics>>;
};

export type DailyUsageMetrics = {
	date: string;
	sites: Partial<Record<SiteId, SiteUsageMetrics>>;
};

export type UsageMetrics = {
	version: 2;
	days: Record<string, DailyUsageMetrics>;
};

export type ActiveUsageState = {
	tabId: number;
	siteId: SiteId;
	category: UsageCategory;
	snoozed: boolean;
	startedAt: number;
	countedDate: string;
};

export type CategorySessionRuntime = {
	activeMs: number;
	lastActivityAt: number;
	countedDate: string;
};

export type UsageRuntimeState = {
	active?: ActiveUsageState;
	lastActivityBySurface: Record<string, number>;
	categorySessions: Partial<Record<UsageCategory, CategorySessionRuntime>>;
	limitReachedKeys: string[];
};

export type UsageLimit = {
	enabled: boolean;
	dailyMs: number;
};

export type UsageLimits = Record<'algorithmic' | 'intentional', UsageLimit>;

export type SnoozeEndReason = 'expired' | 'cancelled' | 'inactive' | 'extended' | 'browser_closed';

export type CategorySnooze = {
	id: string;
	category: Exclude<UsageCategory, 'messages'>;
	sourceSiteId?: SiteId;
	sourceSurfaceId?: RegionId;
	triggerContext: 'blocker' | 'limit' | 'settings';
	startedAt: number;
	requestedEndAt: number;
	lastActiveAt: number;
	endedAt?: number;
	endReason?: SnoozeEndReason;
	activeMs: number;
};

export type SnoozeState = {
	active: Partial<Record<Exclude<UsageCategory, 'messages'>, CategorySnooze>>;
	history: CategorySnooze[];
};

export type SharedSettings = {
	schemaVersion: 1;
	dayTimezone: 'Europe/London';
	limits: UsageLimits;
	snooze: { endAfterInactiveMs: number };
	enabledSites: SiteId[];
	snoozeMode: SnoozeMode;
	settingsLocked: boolean;
	siteConfig: Record<SiteId, SiteConfig>;
};

export type ConsolidatedDailyTotal = {
	date: string;
	siteId: SiteId;
	category: UsageCategory;
	visits: number;
	sessions: number;
	activeMs: number;
	snoozedActiveMs: number;
	limitReachedCount: number;
};

export type SyncInstallation = {
	id: string;
	deviceName: string;
	lastSeenAt: string;
	revokedAt: string | null;
};

export type FiniteSyncState = {
	installationId: string;
	installationToken?: string;
	userId?: string;
	deviceName?: string;
	settingsRevision?: number;
	settingsDirty: boolean;
	lastAttemptAt?: number;
	lastSuccessAt?: number;
	lastError?: string;
	consolidatedDailyTotals?: ConsolidatedDailyTotal[];
	lastUploadedUsage?: UsageMetrics;
	installations?: SyncInstallation[];
};

export type StorageLocalV3 = {
	version: 3;
	snoozeMode?: SnoozeMode;
	settingsLocked?: boolean;
	enabledSites?: SiteId[];
	siteConfig?: Record<SiteId, SiteConfig>;
	usageLimits?: UsageLimits;
	snoozeInactivityMs?: number;
	categorySnoozes?: SnoozeState;
	usageMetrics?: UsageMetrics;
	finiteSync?: FiniteSyncState;
};

export type SiteConfig = {
	theme?: Theme;
	// Overrides the enabled state from the sitelist if set
	regionEnabledOverride: Record<RegionId, boolean>;
};

export type Theme = 'light' | 'dark';

export type StorageLocal = StorageLocalV3;

///////// OLDER VERSIONS /////////

/**
 * Deprecated in v3.0.0
 */
export type StorageSyncV1 = {
	version: 1;
	sites: Partial<SitesStateV1>;
};

export type StorageLocalV2 = {
	version: 2;
	snoozeMode?: SnoozeMode;
	settingsLocked?: boolean;
	enabledSites?: SiteId[];
	siteConfig?: Record<SiteId, SiteConfig>;
	snoozeUntil?: number;
	usageMetrics?: {
		version: 1;
		days: Record<string, {
			date: string;
			sites: Partial<Record<SiteId, { visits: number; sessions: number; activeMs: number }>>;
		}>;
	};
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
