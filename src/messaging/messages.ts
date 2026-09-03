import { getBrowser } from "/lib/webextension";
import type { Theme } from "/storage/schema";
import type { Region, SiteId } from "/types/sitelist";

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
	snoozeUntil: number | null,
	firstLoadRedirect: {
		to: string,
		sessionKey: string,
	} | null,
}

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

export type ToServiceWorkerMessage = RequestSiteDetails | OpenOptionsPage | CloseCurrentTab | RecordBlock | NotifyOptionsUpdated | SetSiteTheme | EnableSite | DisableSite | Snooze | ReadSnooze;

// Request site details from service worker.
type RequestSiteDetails = {
	type: 'requestSiteDetails',
	path: string,
	token: number
};

type OpenOptionsPage = {
	type: 'openOptionsPage',
};

type CloseCurrentTab = {
	type: 'closeCurrentTab',
};

type RecordBlock = {
	type: 'recordBlock',
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
	until: number
}

type ReadSnooze = {
	type: 'readSnooze',
}
