import { getBrowser } from "/lib/webextension";
import type { FiniteSyncState, InterventionKind, Theme, TimelineActivityReason, UsageCategory, UsageLimits, UsageSurfaceId } from "/storage/schema";
import type { Region, RegionId, SiteId } from "/types/sitelist";

export const sendToServiceWorker = async <Response = any>(msg: ToServiceWorkerMessage): Promise<Response> => {
	const browser = getBrowser();
	return browser.runtime.sendMessage(msg);
}

export type FromServiceWorkerMessage = SiteDetails | OptionsUpdated;

/**
 * Respond to a content script with site details
 */
type SiteDetails = {
	type: 'nfe#siteDetails',
	token: number,
	siteId: SiteId,
	regions: DesiredRegionState[],
	theme: {
		id: Theme,
		css: string,
	}
	usage: UsageStatus,
	firstLoadRedirect: {
		to: string,
		sessionKey: string,
	} | null,
}

export type UsageStatus = {
	category: UsageCategory,
	sessionMs: number,
	dailyMs: number,
	limitMs: number | null,
	remainingMs: number | null,
	limitReached: boolean,
	snoozeUntil: number | null,
	updatedAt: number,
};

export type DesiredRegionState = {
	config: Region,
	css: string | null,
	style: string,
	enabled: boolean,
}

/**
 * Sent to content scripts to notify them that the options have changed and they will need to request an update
 */
type OptionsUpdated = {
	type: 'nfe#optionsUpdated',
}

export type ToServiceWorkerMessage = RequestSiteDetails | OpenOptionsPage | CloseCurrentTab | TrackUsageActivity | RecordIntervention | NotifyOptionsUpdated | SetSiteTheme | EnableSite | DisableSite | Snooze | ReadSnooze | SaveUsageLimits | ReadUsageLimits | PairFiniteSync | ReadFiniteSync | SyncFiniteNow | DisconnectFiniteSync;

// Request site details from service worker.
type RequestSiteDetails = {
	type: 'requestSiteDetails',
	path: string,
	category: UsageCategory,
	token: number
};

type OpenOptionsPage = {
	type: 'openOptionsPage',
};

type CloseCurrentTab = {
	type: 'closeCurrentTab',
};

type TrackUsageActivity = {
	type: 'trackUsageActivity',
	active: boolean,
	category: UsageCategory,
	surfaceId: UsageSurfaceId,
	reason: TimelineActivityReason,
};

type RecordIntervention = {
	type: 'recordIntervention',
	interventionKind: InterventionKind,
	category: Exclude<UsageCategory, 'messages'>,
	surfaceId: UsageSurfaceId,
};

type NotifyOptionsUpdated = {
	type: 'notifyOptionsUpdated',
}

type EnableSite = {
	type: 'enableSite',
	siteId: SiteId,
}

type SetSiteTheme = {
	type: 'setSiteTheme',
	siteId: SiteId,
	theme: Theme | null,
}

type DisableSite = {
	type: 'disableSite',
	siteId: SiteId,
}

type Snooze = {
	type: 'snooze',
	category: Exclude<UsageCategory, 'messages'>,
	until: number,
	triggerContext: 'blocker' | 'limit' | 'settings',
	sourceSiteId?: SiteId,
	sourceSurfaceId?: RegionId,
	usageSurfaceId?: UsageSurfaceId,
}

type ReadSnooze = {
	type: 'readSnooze',
}

type SaveUsageLimits = {
	type: 'saveUsageLimits',
	limits: UsageLimits,
}

type ReadUsageLimits = {
	type: 'readUsageLimits',
}

type PairFiniteSync = {
	type: 'pairFiniteSync',
	pairingCode: string,
	deviceName: string,
}

type ReadFiniteSync = {
	type: 'readFiniteSync',
}

type SyncFiniteNow = {
	type: 'syncFiniteNow',
}

type DisconnectFiniteSync = {
	type: 'disconnectFiniteSync',
}

export type FiniteSyncView = Pick<FiniteSyncState,
	'installationId' | 'deviceName' | 'settingsRevision' | 'lastAttemptAt' | 'lastSuccessAt' | 'lastError' | 'installations'
> & {
	paired: boolean,
};
