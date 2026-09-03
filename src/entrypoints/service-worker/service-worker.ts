import { getBrowser, type MessageSender, type TabId } from '/lib/webextension';
import type { Path, PathList, Region, Site, SiteId } from '/types/sitelist';
import type { DesiredRegionState, FiniteSyncView, FromServiceWorkerMessage, ToServiceWorkerMessage, UsageStatus } from '/messaging/messages';
import {
	loadCategorySnoozes,
	loadEnabledSites,
	loadFiniteSyncState,
	loadRegionsForSite,
	loadSitelist,
	loadSnoozeInactivityMs,
	loadUsageLimits,
	loadUsageMetrics,
	loadUsageRuntimeState,
	migrationPromise,
	recordDailyBlock,
	saveCategorySnoozes,
	saveSiteEnabled,
	saveThemeForSite,
	saveUsageLimits,
	saveUsageMetrics,
	saveUsageRuntimeState,
} from '/storage/storage';
import { originsForSite } from '/lib/util';
import type { CategorySnooze, FiniteSyncState, SnoozeState, Theme, UsageCategory, UsageMetrics, UsageRuntimeState } from '/storage/schema';
import { activeSessionMs, dateKeyForTimestamp, incrementLimitReached, localCategoryTotal, pruneUsageMetrics, recordUsageActivity } from '/usage/usage-metrics';
import { disconnectFinite, pairFinite, syncFinite } from '/sync/finite-sync';
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
migrationPromise.then(async () => {
	await syncRegisteredContentScript();
	runFiniteSync(true).catch(() => undefined);
});

const notifyTabsOptionsUpdated = async () => {
	const tabs = await browser.tabs.query({ url: '*://*/*' });

	await Promise.allSettled(
		tabs.map(tab => sendMessage(tab.id, { type: 'nfe#optionsUpdated' }))
	);
};

const syncView = (state: FiniteSyncState): FiniteSyncView => ({
	installationId: state.installationId,
	deviceName: state.deviceName,
	settingsRevision: state.settingsRevision,
	lastAttemptAt: state.lastAttemptAt,
	lastSuccessAt: state.lastSuccessAt,
	lastError: state.lastError,
	installations: state.installations,
	paired: state.installationToken != null,
});

let finiteSyncQueue = Promise.resolve<FiniteSyncState | undefined>(undefined);
const runFiniteSync = (force = false) => {
	finiteSyncQueue = finiteSyncQueue.catch(() => undefined).then(async () => {
		const current = await loadFiniteSyncState();
		if (current.installationToken == null) return current;
		if (!force && current.lastAttemptAt != null && Date.now() - current.lastAttemptAt < 60_000) return current;
		const synced = await syncFinite();
		await syncRegisteredContentScript();
		await notifyTabsOptionsUpdated();
		return synced;
	});
	return finiteSyncQueue;
};

const finishSnooze = (
	state: SnoozeState,
	category: Exclude<UsageCategory, 'messages'>,
	endedAt: number,
	reason: CategorySnooze['endReason'],
) => {
	const snooze = state.active[category];
	if (snooze == null) return false;
	snooze.endedAt = Math.max(snooze.startedAt, endedAt);
	snooze.endReason = reason;
	state.history.push(snooze);
	state.history = state.history.slice(-500);
	delete state.active[category];
	return true;
};

const normalizeSnoozes = async (state: SnoozeState, now: number) => {
	const inactivityMs = await loadSnoozeInactivityMs();
	let changed = false;
	for (const category of ['algorithmic', 'intentional'] as const) {
		const snooze = state.active[category];
		if (snooze == null) continue;
		if (snooze.requestedEndAt <= now) {
			changed = finishSnooze(state, category, snooze.requestedEndAt, 'expired') || changed;
		} else if (snooze.lastActiveAt + inactivityMs <= now) {
			changed = finishSnooze(state, category, snooze.lastActiveAt + inactivityMs, 'inactive') || changed;
		}
	}
	if (changed) await saveCategorySnoozes(state);
	return changed;
};

const consolidatedCategoryMs = (
	usage: UsageMetrics,
	sync: FiniteSyncState,
	date: string,
	category: UsageCategory,
) => {
	const local = localCategoryTotal(usage, date, category).activeMs;
	if (sync.installationToken == null || sync.consolidatedDailyTotals == null) return local;
	const server = sync.consolidatedDailyTotals
		.filter(total => total.date === date && total.category === category)
		.reduce((sum, total) => sum + total.activeMs, 0);
	const uploaded = sync.lastUploadedUsage == null
		? 0
		: localCategoryTotal(sync.lastUploadedUsage, date, category).activeMs;
	return server + Math.max(0, local - uploaded);
};

const usageStatusFor = async (
	category: UsageCategory,
	usage?: UsageMetrics,
	runtime?: UsageRuntimeState,
	snoozes?: SnoozeState,
): Promise<UsageStatus> => {
	const now = Date.now();
	const [currentUsage, currentRuntime, currentSnoozes, limits, sync] = await Promise.all([
		usage ?? loadUsageMetrics(),
		runtime ?? loadUsageRuntimeState(),
		snoozes ?? loadCategorySnoozes(),
		loadUsageLimits(),
		loadFiniteSyncState(),
	]);
	await normalizeSnoozes(currentSnoozes, now);
	const dailyMs = consolidatedCategoryMs(currentUsage, sync, dateKeyForTimestamp(now), category);
	const limit = category === 'messages' || !limits[category].enabled ? null : limits[category].dailyMs;
	const snooze = category === 'messages' ? undefined : currentSnoozes.active[category];
	const snoozeUntil = snooze != null && snooze.requestedEndAt > now ? snooze.requestedEndAt : null;
	return {
		category,
		sessionMs: activeSessionMs(currentRuntime, category),
		dailyMs,
		limitMs: limit,
		remainingMs: limit == null ? null : Math.max(0, limit - dailyMs),
		limitReached: limit != null && dailyMs >= limit && snoozeUntil == null,
		snoozeUntil,
		updatedAt: now,
	};
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

let usageQueue: Promise<UsageStatus | undefined> = Promise.resolve(undefined);
const trackUsage = (active: boolean, category: UsageCategory, sender: MessageSender) => {
	usageQueue = usageQueue.catch(() => undefined).then(async () => {
		const now = Date.now();
		const [usage, runtime, snoozes] = await Promise.all([
			loadUsageMetrics(),
			loadUsageRuntimeState(),
			loadCategorySnoozes(),
		]);
		await normalizeSnoozes(snoozes, now);

		let siteId: SiteId | undefined;
		if (active && sender.tab.incognito !== true) {
			try {
				const [siteList, enabledSiteIds] = await Promise.all([loadSitelist(), loadEnabledSites()]);
				const url = new URL(sender.url);
				const enabled = new Set(enabledSiteIds);
				siteId = siteList.sites.find(site => enabled.has(site.id) && site.hosts.includes(url.host))?.id;
			} catch {
				// Treat malformed or unavailable sender URLs as inactive rather than persisting them.
			}
		}

		const previousActive = runtime.active == null ? undefined : { ...runtime.active };
		const currentSnooze = category === 'messages' ? undefined : snoozes.active[category];
		const isSnoozing = currentSnooze != null && currentSnooze.requestedEndAt > now;
		const duration = recordUsageActivity(
			usage,
			runtime,
			sender.tab.id,
			siteId,
			siteId == null ? undefined : category,
			active && siteId != null,
			isSnoozing,
			now,
		);
		if (previousActive?.snoozed && previousActive.category !== 'messages') {
			const snooze = snoozes.active[previousActive.category];
			if (snooze != null) snooze.activeMs += duration;
		}
		if (active && siteId != null && currentSnooze != null) currentSnooze.lastActiveAt = now;
		pruneUsageMetrics(usage, now);

		let status = await usageStatusFor(category, usage, runtime, snoozes);
		if (siteId != null && status.limitReached) {
			if (incrementLimitReached(usage, runtime, dateKeyForTimestamp(now), siteId, category)) {
				status = await usageStatusFor(category, usage, runtime, snoozes);
			}
		}
		await Promise.all([
			saveUsageMetrics(usage),
			saveUsageRuntimeState(runtime),
			saveCategorySnoozes(snoozes),
		]);
		runFiniteSync().catch(() => undefined);
		return status;
	});
	return usageQueue;
};

const handleMessage = async (msg: ToServiceWorkerMessage, sender: MessageSender) => {
	if (msg.type === 'requestSiteDetails') {
		const [siteList, enabledSiteIds, snoozes] = await Promise.all([
			loadSitelist(),
			loadEnabledSites(),
			loadCategorySnoozes(),
		]);
		await normalizeSnoozes(snoozes, Date.now());

		const enabled = new Set(enabledSiteIds);
		const url = new URL(sender.url);
		const sites = siteList.sites.filter(site => enabled.has(site.id) && site.hosts.includes(url.host));
		if (sites.length === 0) return;

		const siteOptions = await Promise.all(sites.map(site => loadRegionsForSite(site.id)));
		const categorySnooze = msg.category === 'messages' ? undefined : snoozes.active[msg.category];
		const isSnoozing = categorySnooze != null && categorySnooze.requestedEndAt > Date.now();
		const regionsBySite = sites.map((site, siteIndex) => {
			const options = siteOptions[siteIndex]!;
			return site.regions.map((region): DesiredRegionState => {
				const style = cssForType(region.type);
				const regionCategory = region.category ?? msg.category;
				const regionSnooze = regionCategory === 'messages' ? undefined : snoozes.active[regionCategory];
				const regionIsSnoozing = regionSnooze != null && regionSnooze.requestedEndAt > Date.now();
				if (regionIsSnoozing || !isEnabledPath(site, region, msg.path)) {
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
			usage: await usageStatusFor(msg.category, undefined, undefined, snoozes),
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
		runFiniteSync().catch(() => undefined);
		return result;
	}

	if (msg.type === 'disableSite') {
		await disableSite(msg.siteId);
		await notifyTabsOptionsUpdated();
		runFiniteSync().catch(() => undefined);
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

	if (msg.type === 'trackUsageActivity') {
		return trackUsage(msg.active, msg.category, sender);
	}

	if (msg.type === 'notifyOptionsUpdated') {
		runFiniteSync().catch(() => undefined);
		return notifyTabsOptionsUpdated();
	}

	if (msg.type === 'snooze') {
		const now = Date.now();
		const snoozes = await loadCategorySnoozes();
		await normalizeSnoozes(snoozes, now);
		const existing = snoozes.active[msg.category];
		if (msg.until <= now) {
			if (existing != null) finishSnooze(snoozes, msg.category, now, 'cancelled');
		} else {
			if (existing != null) finishSnooze(snoozes, msg.category, now, 'extended');
			snoozes.active[msg.category] = {
				id: crypto.randomUUID(),
				category: msg.category,
				sourceSiteId: msg.sourceSiteId,
				sourceSurfaceId: msg.sourceSurfaceId,
				triggerContext: msg.triggerContext,
				startedAt: now,
				requestedEndAt: msg.until,
				lastActiveAt: now,
				activeMs: 0,
			};
		}
		await saveCategorySnoozes(snoozes);
		runFiniteSync(true).catch(() => undefined);
		await notifyTabsOptionsUpdated();
		return usageStatusFor(msg.category, undefined, undefined, snoozes);
	}

	if (msg.type === 'readSnooze') {
		const snoozes = await loadCategorySnoozes();
		await normalizeSnoozes(snoozes, Date.now());
		return snoozes;
	}

	if (msg.type === 'setSiteTheme') {
		await setSiteTheme(msg.siteId, msg.theme);
		runFiniteSync().catch(() => undefined);
		return;
	}

	if (msg.type === 'saveUsageLimits') {
		await saveUsageLimits(msg.limits);
		runFiniteSync().catch(() => undefined);
		return notifyTabsOptionsUpdated();
	}

	if (msg.type === 'readUsageLimits') {
		return loadUsageLimits();
	}

	if (msg.type === 'pairFiniteSync') {
		const paired = await pairFinite(msg.pairingCode, msg.deviceName);
		await syncRegisteredContentScript();
		await notifyTabsOptionsUpdated();
		runFiniteSync(true).catch(() => undefined);
		return syncView(paired);
	}

	if (msg.type === 'readFiniteSync') {
		return syncView(await loadFiniteSyncState());
	}

	if (msg.type === 'syncFiniteNow') {
		return syncView((await runFiniteSync(true)) ?? await loadFiniteSyncState());
	}

	if (msg.type === 'disconnectFiniteSync') {
		return syncView(await disconnectFinite());
	}
};

browser.runtime.onMessage.addListener((msg: ToServiceWorkerMessage, sender, sendResponse) => {
	handleMessage(msg, sender).then(sendResponse);
	return true;
});
