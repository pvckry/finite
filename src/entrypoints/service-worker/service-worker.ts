import { getBrowser, type MessageSender, type TabId } from '/lib/webextension';
import type { Path, PathList, Region, Site, SiteId } from '/types/sitelist';
import type { DesiredRegionState, FromServiceWorkerMessage, ToServiceWorkerMessage } from '/messaging/messages';
import {
	loadEnabledSites,
	loadRegionsForSite,
	loadSitelist,
	loadSnoozeUntil,
	migrationPromise,
	recordDailyBlock,
	saveSiteEnabled,
	saveSnoozeUntil,
	saveThemeForSite,
} from '/storage/storage';
import { originsForSite } from '/lib/util';
import type { Theme } from '/storage/schema';
import themeDark from '/themes/dark.css?raw';
import themeLight from '/themes/light.css?raw';

const browser = getBrowser();
const CONTENT_SCRIPT_ID = 'nfe-enabled-sites';

browser.action.onClicked.addListener(() => {
	browser.runtime.openOptionsPage();
});

const sendMessage = (tabId: TabId, message: FromServiceWorkerMessage) => browser.tabs.sendMessage(tabId, message);

let registrationSync = Promise.resolve();

const syncRegisteredContentScript = () => {
	registrationSync = registrationSync.then(async () => {
		const [siteList, enabledSiteIds, registeredScripts] = await Promise.all([
			loadSitelist(),
			loadEnabledSites(),
			browser.scripting.getRegisteredContentScripts(),
		]);

		const enabled = new Set(enabledSiteIds);
		const matches = Array.from(new Set(
			siteList.sites
				.filter(site => enabled.has(site.id))
				.flatMap(originsForSite)
		)).sort();
		const registeredScript = registeredScripts.length === 1 ? registeredScripts[0] : undefined;
		const registeredMatches = registeredScript != null
			? [...registeredScript.matches].sort()
			: [];
		const registrationIsCurrent = registeredScript != null
			&& registeredScript.id === CONTENT_SCRIPT_ID
			&& registeredMatches.length === matches.length
			&& registeredMatches.every((match, index) => match === matches[index]);

		if (registrationIsCurrent) return;

		if (registeredScripts.length > 0) {
			await browser.scripting.unregisterContentScripts({ ids: registeredScripts.map(script => script.id) });
		}

		if (matches.length === 0) return;

		await browser.scripting.registerContentScripts([{
			id: CONTENT_SCRIPT_ID,
			js: ['/entrypoints/intercept/intercept.js'],
			runAt: 'document_start',
			matches,
			allFrames: false,
		}]);
	});

	return registrationSync;
};

browser.runtime.onInstalled.addListener(async (details) => {
	await migrationPromise;
	await syncRegisteredContentScript();

	if (details.reason === 'install') {
		browser.runtime.openOptionsPage();
	}
});

// Keep registrations correct after an unpacked-extension reload as well as install/update events.
migrationPromise.then(syncRegisteredContentScript);

const notifyTabsOptionsUpdated = async () => {
	const tabs = await browser.tabs.query({ url: '*://*/*' });

	await Promise.allSettled(
		tabs.map(tab => sendMessage(tab.id, { type: 'nfe#optionsUpdated' }))
	);
};

const pathPatternMatches = (path: string, pattern: Path): boolean => {
	if (typeof pattern === 'string') {
		return pattern === path;
	}
	return new RegExp(pattern.regexp).test(path);
};

const pathInPathList = (path: string, pathlist: PathList): boolean => {
	return pathlist.some(pattern => pathPatternMatches(path, pattern));
};

const isEnabledPath = (site: Site, region: Region, path: string): boolean => {
	if (region.paths === '*') return true;
	if (region.paths === 'inherit') return pathInPathList(path, site.paths);
	return pathInPathList(path, region.paths);
};

const cssForType = (type: Region['type']): string => {
	switch (type) {
		case 'remove':
		case 'hide':
			return 'display: none !important;';
		case 'dull':
			return 'filter: grayscale(100%) !important;';
		case 'none':
			return '';
	}
};

const isDynamicRegion = (region: Region) => region.textPatterns != null || region.groupSelector != null;

const sanitizeSelector = (selector: string): string => {
	return selector.replaceAll('{', '').replaceAll('}', '').replaceAll(',', '').replaceAll('@', '');
};

const enableSite = async (siteId: SiteId) => {
	const siteList = await loadSitelist();
	if (!siteList.sites.some(site => site.id === siteId)) return false;

	await saveSiteEnabled(siteId, true);
	await syncRegisteredContentScript();
	return true;
};

const disableSite = async (siteId: SiteId) => {
	await saveSiteEnabled(siteId, false);
	await syncRegisteredContentScript();
};

const setSiteTheme = async (siteId: SiteId, theme: Theme | null) => {
	await saveThemeForSite(siteId, theme ?? undefined);
	await notifyTabsOptionsUpdated();
};

let counterQueue = Promise.resolve(0);
const countBlock = () => {
	counterQueue = counterQueue.then(recordDailyBlock);
	return counterQueue;
};

const handleMessage = async (msg: ToServiceWorkerMessage, sender: MessageSender) => {
	if (msg.type === 'requestSiteDetails') {
		const [siteList, snoozeUntil, enabledSiteIds] = await Promise.all([
			loadSitelist(),
			loadSnoozeUntil(),
			loadEnabledSites(),
		]);

		const enabled = new Set(enabledSiteIds);
		const url = new URL(sender.url);
		const sites = siteList.sites.filter(site => enabled.has(site.id) && site.hosts.includes(url.host));
		if (sites.length === 0) return;

		const siteOptions = await Promise.all(sites.map(site => loadRegionsForSite(site.id)));
		const isSnoozing = snoozeUntil != null && snoozeUntil > Date.now();
		const regionsBySite = sites.map((site, siteIndex) => {
			const options = siteOptions[siteIndex]!;
			return site.regions.map((region): DesiredRegionState => {
				const style = cssForType(region.type);
				if (isSnoozing || !isEnabledPath(site, region, msg.path)) {
					return { config: region, css: null, style, enabled: false };
				}

				const isEnabled = options.regionEnabledOverride[region.id] ?? region.default ?? true;
				const selector = region.selectors.map(sanitizeSelector).join(',');
				const css = [
					!isDynamicRegion(region) && style !== '' ? `${selector} { ${style} }` : '',
					region.extraCss ?? '',
				].filter(Boolean).join('\n') || null;
				return { config: region, css, style, enabled: isEnabled };
			});
		});

		const panelSiteIndex = regionsBySite.findIndex(regions => regions.some(region => region.enabled && region.config.inject != null));
		const primarySiteIndex = panelSiteIndex >= 0 ? panelSiteIndex : 0;
		const primarySite = sites[primarySiteIndex]!;
		const theme = siteOptions[primarySiteIndex]!.theme ?? 'light';
		const firstLoadRedirect = !isSnoozing
			&& primarySite.firstLoadRedirect != null
			&& pathInPathList(msg.path, primarySite.firstLoadRedirect.from)
			? {
				to: primarySite.firstLoadRedirect.to,
				sessionKey: primarySite.firstLoadRedirect.sessionKey,
			}
			: null;
		await sendMessage(sender.tab.id, {
			type: 'nfe#siteDetails',
			regions: regionsBySite.flat(),
			token: msg.token,
			snoozeUntil: snoozeUntil ?? null,
			firstLoadRedirect,
			siteId: primarySite.id,
			theme: {
				css: theme === 'light' ? themeLight : themeDark,
				id: theme,
			},
		});
		return;
	}

	if (msg.type === 'enableSite') {
		const result = await enableSite(msg.siteId);
		await notifyTabsOptionsUpdated();
		return result;
	}

	if (msg.type === 'disableSite') {
		await disableSite(msg.siteId);
		await notifyTabsOptionsUpdated();
		return;
	}

	if (msg.type === 'openOptionsPage') {
		return browser.runtime.openOptionsPage();
	}

	if (msg.type === 'closeCurrentTab') {
		return browser.tabs.remove(sender.tab.id);
	}

	if (msg.type === 'recordBlock') {
		return countBlock();
	}

	if (msg.type === 'notifyOptionsUpdated') {
		return notifyTabsOptionsUpdated();
	}

	if (msg.type === 'snooze') {
		await saveSnoozeUntil(msg.until);
		return notifyTabsOptionsUpdated();
	}

	if (msg.type === 'readSnooze') {
		return await loadSnoozeUntil() ?? null;
	}

	if (msg.type === 'setSiteTheme') {
		return setSiteTheme(msg.siteId, msg.theme);
	}
};

browser.runtime.onMessage.addListener((msg: ToServiceWorkerMessage, sender, sendResponse) => {
	handleMessage(msg, sender).then(sendResponse);
	return true;
});
