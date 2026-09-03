import { render } from 'solid-js/web';
import { getBrowser } from '../../lib/webextension';
import { signalObj, type SignalObj } from '../../lib/solid-util';
import type { DesiredRegionState, FromServiceWorkerMessage, ToServiceWorkerMessage } from '../../messaging/messages';
import { BlockerPanel } from '../../shared/blocker-panel';
import type { Theme } from '../../storage/schema';
import type { Region, RegionId, SiteId } from '../../types/sitelist';
import nfeStyles from './nfe-container.css?raw';
import sharedStyles from '../../shared/styles.css?raw';

const browser = getBrowser();
const token = Math.floor(Math.random() * 1000000);
let extensionContextValid = true;

const domReady = new Promise<Document>(resolve => {
	const timer = setInterval(() => {
		if (document.head != null && document.body != null) {
			clearInterval(timer);
			resolve(document);
		}
	}, 1);
});

type OverlayState = {
	referenceElement: Element;
	overlayContainer: HTMLDivElement;
};

type RegionState = {
	config: Region;
	injectedElement?: HTMLDivElement;
	injectedThemeStyleElement?: HTMLStyleElement;
	shadow?: ShadowRoot;
	overlay?: OverlayState;
	css?: string;
	style?: string;
	enabled?: boolean;
	dynamicElements: Set<Element>;
};

type ContentScriptState = {
	snoozeUntil?: number;
	snoozeTimer?: ReturnType<typeof setTimeout>;
	injectedPageStyleElement?: HTMLStyleElement;
	ready?: boolean;
	siteId: SignalObj<SiteId | null>;
	dailyBlockCount: SignalObj<number | null>;
	overlays: OverlayState[];
	theme: {
		css: string | null;
		id: SignalObj<Theme | null>;
	};
	regions: Map<RegionId, RegionState>;
};

const state: ContentScriptState = {
	regions: new Map(),
	overlays: [],
	siteId: signalObj<SiteId | null>(null),
	dailyBlockCount: signalObj<number | null>(null),
	theme: {
		css: null,
		id: signalObj<Theme | null>(null),
	},
};

const invalidateContentScript = () => {
	if (!extensionContextValid) return;
	extensionContextValid = false;
	state.injectedPageStyleElement?.remove();
	if (state.snoozeTimer != null) clearTimeout(state.snoozeTimer);

	for (const region of state.regions.values()) {
		for (const element of region.dynamicElements) element.removeAttribute(dynamicAttribute(region.config));
		region.injectedElement?.remove();
		region.overlay?.overlayContainer.remove();
	}
	state.regions.clear();
	state.overlays = [];
};

const isInvalidatedContextError = (error: unknown) => String(error).toLowerCase().includes('extension context invalidated');

window.addEventListener('unhandledrejection', event => {
	if (!isInvalidatedContextError(event.reason)) return;
	event.preventDefault();
	invalidateContentScript();
});

window.addEventListener('error', event => {
	if (!isInvalidatedContextError(event.error ?? event.message)) return;
	event.preventDefault();
	invalidateContentScript();
});

const sendMessage = async <Response = any>(message: ToServiceWorkerMessage): Promise<Response | undefined> => {
	if (!extensionContextValid) return undefined;
	try {
		return await browser.runtime.sendMessage(message) as Response;
	} catch (error) {
		if (isInvalidatedContextError(error)) {
			invalidateContentScript();
			return undefined;
		}
		throw error;
	}
};

const countedBlockKeys = new Set<string>();

const recordBlockOnce = () => {
	const key = `${state.siteId.get() ?? 'unknown'}:${window.location.pathname}`;
	if (countedBlockKeys.has(key)) return;
	countedBlockKeys.add(key);

	sendMessage({ type: 'recordBlock' })
		.then(count => {
			if (typeof count === 'number') state.dailyBlockCount.set(count);
			else countedBlockKeys.delete(key);
		})
		.catch(() => countedBlockKeys.delete(key));
};

const createOverlay = (refEl: Element, el: Element, position: 'fixed' | 'absolute', zIndex: number) => {
	const overlay = document.createElement('div');
	const overlayState = { referenceElement: refEl, overlayContainer: overlay };
	overlay.id = 'nfe-overlay';
	overlay.style.position = position;
	overlay.style.zIndex = `${zIndex}`;
	overlay.style.pointerEvents = 'none';
	state.overlays.push(overlayState);
	document.body.appendChild(overlay);
	overlay.appendChild(el);
	updateOverlay(overlayState);
	return overlayState;
};

const updateOverlay = (overlay: OverlayState) => {
	const refBounds = overlay.referenceElement.getBoundingClientRect();
	const bounds = overlay.overlayContainer.getBoundingClientRect();
	if (refBounds.width !== bounds.width || refBounds.height !== bounds.height) {
		overlay.overlayContainer.style.width = `${refBounds.width}px`;
		overlay.overlayContainer.style.height = `${refBounds.height}px`;
	}
	if (refBounds.top !== bounds.top || refBounds.left !== bounds.left) {
		overlay.overlayContainer.style.top = `${refBounds.top}px`;
		overlay.overlayContainer.style.left = `${refBounds.left}px`;
	}
};

const checkDom = () => {
	if (!extensionContextValid) return;
	for (const overlay of state.overlays) {
		if (document.contains(overlay.referenceElement)) updateOverlay(overlay);
	}
};

window.addEventListener('resize', checkDom);
setInterval(checkDom, 1000);

const isSnoozing = () => state.snoozeUntil != null && state.snoozeUntil > Date.now();
const isRegionBlockActive = (region: RegionState) => region.enabled === true && !isSnoozing();
const isDynamicRegion = (region: Region) => region.textPatterns != null || region.groupSelector != null;

const cleanupRegionInjection = (region: RegionState) => {
	region.injectedElement?.remove();
	region.injectedElement = undefined;
	region.shadow = undefined;
	region.injectedThemeStyleElement = undefined;

	if (region.overlay != null) {
		region.overlay.overlayContainer.remove();
		state.overlays = state.overlays.filter(overlay => overlay !== region.overlay);
		region.overlay = undefined;
	}
};

const tryInject = () => {
	if (!extensionContextValid || state.ready !== true) return;

	let isMissingElements = false;

	for (const region of state.regions.values()) {
		const injectConfig = region.config.inject;
		if (injectConfig == null || !isRegionBlockActive(region)) continue;

		const referenceStillExists = region.overlay == null || document.contains(region.overlay.referenceElement);
		if (region.injectedElement != null && document.contains(region.injectedElement) && referenceStillExists) {
			recordBlockOnce();
			continue;
		}

		cleanupRegionInjection(region);
		const selectors = injectConfig.selectors ?? region.config.selectors;

		for (const selector of selectors) {
			const el = document.querySelector(selector);
			if (el == null) {
				isMissingElements = true;
				continue;
			}

			const nfeElement = document.createElement('div');
			nfeElement.id = `nfe-root-${region.config.id}`;

			switch (injectConfig.mode) {
				case 'firstChild':
					el.prepend(nfeElement);
					break;
				case 'lastChild':
					el.appendChild(nfeElement);
					break;
				case 'before':
					el.before(nfeElement);
					break;
				case 'after':
					el.after(nfeElement);
					break;
				case 'overlay':
					region.overlay = createOverlay(el, nfeElement, 'absolute', injectConfig.overlayZIndex ?? 99999999);
					break;
				case 'overlay-fixed':
					region.overlay = createOverlay(el, nfeElement, 'fixed', injectConfig.overlayZIndex ?? 99999999);
					break;
				case 'fixed-corner':
					nfeElement.style.position = 'fixed';
					nfeElement.style.right = '16px';
					nfeElement.style.bottom = '16px';
					nfeElement.style.zIndex = `${injectConfig.overlayZIndex ?? 99999999}`;
					document.body.appendChild(nfeElement);
					break;
			}

			const shadow = nfeElement.attachShadow({ mode: 'open' });
			region.shadow = shadow;

			const themeStyle = document.createElement('style');
			themeStyle.textContent = state.theme.css?.replace(':root', ':host') ?? '';
			shadow.appendChild(themeStyle);
			region.injectedThemeStyleElement = themeStyle;

			const style = document.createElement('style');
			style.textContent = `${nfeStyles}\n${sharedStyles}`;
			shadow.appendChild(style);

			const container = document.createElement('div');
			container.id = 'nfe-container';
			shadow.appendChild(container);

			render(() => (
				<BlockerPanel
					siteId={state.siteId.get}
					theme={state.theme.id.get}
					dailyCount={state.dailyBlockCount.get}
				/>
			), container);

			region.injectedElement = nfeElement;
			recordBlockOnce();
			break;
		}
	}

	if (isMissingElements) setTimeout(tryInject, 1000);
};

const dynamicAttribute = (region: Region) => `data-nfe-block-${region.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

const matchesRegionText = (region: Region, text: string) => {
	return region.textPatterns?.some(pattern => {
		try {
			return new RegExp(pattern, 'i').test(text.trim());
		} catch {
			return false;
		}
	}) ?? false;
};

const matchingTextNodes = (region: Region, candidate: Element) => {
	const nodes = region.textSelectors == null
		? [candidate]
		: region.textSelectors.flatMap(selector => Array.from(candidate.querySelectorAll(selector)));
	return Array.from(new Set(nodes)).filter(node => matchesRegionText(region, node.textContent ?? ''));
};

const regionMatchesText = (region: Region, candidate: Element) => {
	if (region.textPatterns == null) return false;
	return matchingTextNodes(region, candidate).length > 0;
};

const postLinkSelector = 'a[href^="/p/"], a[href^="/reel/"], a[href*="/status/"]';

const uniquePostLinks = (element: Element) => new Set(
	Array.from(element.querySelectorAll<HTMLAnchorElement>(postLinkSelector))
		.map(link => link.href.split('?')[0])
).size;

const findPostContainer = (source: Element, root: Element): Element | null => {
	const semanticPost = source.closest('article, [data-testid="tweet"][role="article"]');
	if (semanticPost != null && root.contains(semanticPost)) return semanticPost;

	let branch: Element | null = source;
	let best: Element | null = null;
	let depth = 0;
	while (branch?.parentElement != null && depth < 14) {
		branch = branch.parentElement;
		depth += 1;
		if (branch === root || branch.matches('main, [role="main"]')) break;

		const linkCount = uniquePostLinks(branch);
		if (linkCount > 1) break;
		const containsPost = linkCount === 1 || branch.matches(postLinkSelector);
		const containsMedia = branch.querySelector('img, video') != null;
		if (containsPost && containsMedia) best = branch;
	}

	return best;
};

const postsAfterBoundary = (boundary: Element, root: Element) => {
	const posts = new Set<Element>();
	posts.add(boundary.closest('h1, h2, h3, [role="heading"]') ?? boundary);
	for (const link of root.querySelectorAll(postLinkSelector)) {
		if ((boundary.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) continue;
		const post = findPostContainer(link, root);
		if (post != null) posts.add(post);
	}

	for (const progress of root.querySelectorAll('[role="progressbar"]')) {
		if ((boundary.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) posts.add(progress);
	}
	return posts;
};

const activeTimelineForTab = (tab: Element, root: Element) => {
	const tabControl = tab.closest('[role="tab"]') ?? tab;
	const isSelected = tabControl.getAttribute('aria-selected') === 'true'
		|| tabControl.querySelector('[aria-selected="true"]') != null;
	if (!isSelected) return null;

	return root.querySelector(
		'div[aria-label^="Timeline:"], section[role="region"]:has(article[data-testid="tweet"])'
	);
};

const groupContainer = (region: Region, match: Element, root: Element) => {
	const minimum = region.groupMinimum ?? 1;
	for (const selector of region.groupAncestorSelectors ?? []) {
		const candidate = match.closest(selector);
		if (candidate != null && root.contains(candidate) && candidate.querySelectorAll(region.groupSelector!).length >= minimum) {
			return candidate;
		}
	}

	let branch: Element | null = match;
	while (branch?.parentElement != null) {
		branch = branch.parentElement;
		if (branch === root || branch.matches('main, [role="main"]')) break;
		if (branch.querySelectorAll(region.groupSelector!).length >= minimum) return branch;
	}
	return null;
};

const pauseMedia = (root: Element) => {
	const media = root.matches('video, audio')
		? [root as HTMLMediaElement]
		: Array.from(root.querySelectorAll<HTMLMediaElement>('video, audio'));

	for (const element of media) {
		element.muted = true;
		element.volume = 0;
		element.removeAttribute('autoplay');
		element.pause();
	}
};

const applyDynamicRegions = () => {
	for (const region of state.regions.values()) {
		const attribute = dynamicAttribute(region.config);
		for (const element of region.dynamicElements) element.removeAttribute(attribute);
		region.dynamicElements.clear();

		if (!isRegionBlockActive(region) || !isDynamicRegion(region.config)) continue;
		const markBlocked = (candidate: Element) => {
			candidate.setAttribute(attribute, '');
			region.dynamicElements.add(candidate);
			pauseMedia(candidate);
		};

		for (const selector of region.config.selectors) {
			for (const candidate of document.querySelectorAll(selector)) {
				if (region.config.groupSelector != null) {
					for (const match of candidate.querySelectorAll(region.config.groupSelector)) {
						const container = groupContainer(region.config, match, candidate);
						if (container != null) markBlocked(container);
					}
					continue;
				}

				if (region.config.textMatchMode === 'following-posts') {
					for (const boundary of matchingTextNodes(region.config, candidate)) {
						for (const element of postsAfterBoundary(boundary, candidate)) markBlocked(element);
					}
					continue;
				}

				if (region.config.textMatchMode === 'closest-post') {
					for (const marker of matchingTextNodes(region.config, candidate)) {
						const post = findPostContainer(marker, candidate);
						if (post != null) markBlocked(post);
					}
					continue;
				}

				if (region.config.textMatchMode === 'active-tab-timeline') {
					for (const tab of matchingTextNodes(region.config, candidate)) {
						const timeline = activeTimelineForTab(tab, candidate);
						if (timeline != null) markBlocked(timeline);
					}
					continue;
				}

				if (!regionMatchesText(region.config, candidate)) continue;
				markBlocked(candidate);
			}
		}
	}
};

const pauseBlockedMedia = () => {
	for (const region of state.regions.values()) {
		if (!isRegionBlockActive(region)) continue;

		if (isDynamicRegion(region.config)) {
			for (const element of region.dynamicElements) pauseMedia(element);
			continue;
		}

		for (const selector of region.config.selectors) {
			for (const element of document.querySelectorAll(selector)) pauseMedia(element);
		}
	}
};

const removeBlockedDomRegions = () => {
	for (const region of state.regions.values()) {
		if (!isRegionBlockActive(region) || region.config.removeFromDom !== true) continue;
		for (const selector of region.config.selectors) {
			for (const element of document.querySelectorAll(selector)) element.remove();
		}
	}
};

const isMediaBlocked = (media: HTMLMediaElement) => {
	for (const region of state.regions.values()) {
		if (!isRegionBlockActive(region)) continue;

		if (isDynamicRegion(region.config)) {
			if (Array.from(region.dynamicElements).some(element => element.contains(media))) return true;
			if ((region.config.textMatchMode ?? 'candidate') !== 'candidate') continue;
			for (const selector of region.config.selectors) {
				try {
					const candidate = media.closest(selector);
					if (candidate != null && regionMatchesText(region.config, candidate)) return true;
				} catch {
					// Ignore invalid selectors and continue checking the remaining region definitions.
				}
			}
			continue;
		}

		for (const selector of region.config.selectors) {
			try {
				if (media.closest(selector) != null) return true;
			} catch {
				// Ignore a selector if a future site configuration is not supported by Element.closest.
			}
		}
	}
	return false;
};

document.addEventListener('play', event => {
	if (!extensionContextValid) return;
	const media = event.target;
	if (!(media instanceof HTMLMediaElement) || !isMediaBlocked(media)) return;
	media.muted = true;
	media.volume = 0;
	media.pause();
}, true);

const activatedBehaviorKeys = new Set<string>();

const applyRegionBehaviors = () => {
	for (const region of state.regions.values()) {
		if (!isRegionBlockActive(region) || region.config.behavior == null) continue;
		const key = `${region.config.id}:${window.location.href}`;
		if (activatedBehaviorKeys.has(key)) continue;

		if (region.config.behavior === 'youtube-cinema-mode') {
			const watch = document.querySelector('ytd-watch-flexy');
			if (watch == null || document.fullscreenElement != null) continue;
			if (watch.hasAttribute('theater')) {
				activatedBehaviorKeys.add(key);
				continue;
			}
			const button = document.querySelector<HTMLElement>('.html5-video-player .ytp-size-button');
			if (button == null) continue;
			button.click();
			activatedBehaviorKeys.add(key);
			continue;
		}

		if (region.config.behavior === 'twitter-default-following') {
			const tabs = Array.from(document.querySelectorAll<HTMLElement>(
				'div[data-testid="ScrollSnap-List"][role="tablist"] [role="tab"], [role="tablist"] [role="tab"]'
			));
			const following = tabs.find(tab => /^Following$/i.test(tab.textContent?.trim() ?? ''))
				?? (tabs.length === 2 ? tabs[1] : undefined);
			if (following == null) continue;
			const selected = following.getAttribute('aria-selected') === 'true'
				|| following.querySelector('[aria-selected="true"]') != null;
			if (!selected) following.click();
			activatedBehaviorKeys.add(key);
		}
	}
};

let refreshScheduled = false;
const scheduleDomRefresh = () => {
	if (!extensionContextValid || refreshScheduled) return;
	refreshScheduled = true;
	requestAnimationFrame(() => {
		refreshScheduled = false;
		applyRegionBehaviors();
		applyDynamicRegions();
		removeBlockedDomRegions();
		pauseBlockedMedia();
		tryInject();
	});
};

domReady.then(() => {
	const observer = new MutationObserver(scheduleDomRefresh);
	observer.observe(document.documentElement, { childList: true, subtree: true });
	scheduleDomRefresh();
});

let path = window.location.pathname;
setInterval(() => {
	if (!extensionContextValid) return;
	if (path === window.location.pathname) return;
	path = window.location.pathname;
	sendMessage({ type: 'requestSiteDetails', path, token });
}, 50);

const setCss = (css: string) => {
	if (state.injectedPageStyleElement == null) {
		state.injectedPageStyleElement = document.createElement('style');
		document.head.appendChild(state.injectedPageStyleElement);
	}
	state.injectedPageStyleElement.textContent = css;
};

const endSnooze = () => {
	sendMessage({ type: 'requestSiteDetails', path: window.location.pathname, token });
	state.snoozeTimer = undefined;
};

const setSnoozeTimer = (snoozeUntil: number | null) => {
	state.snoozeUntil = snoozeUntil ?? undefined;
	if (state.snoozeTimer != null) clearTimeout(state.snoozeTimer);
	if (snoozeUntil != null) state.snoozeTimer = setTimeout(endSnooze, snoozeUntil - Date.now());
};

const patchState = (regions: DesiredRegionState[]) => {
	const seenRegions = new Set<RegionId>();

	for (const region of regions) {
		const id = region.config.id;
		seenRegions.add(id);
		if (!state.regions.has(id)) {
			state.regions.set(id, { config: region.config, dynamicElements: new Set() });
		}

		const current = state.regions.get(id)!;
		current.config = region.config;
		current.enabled = region.enabled;
		current.css = region.css ?? undefined;
		current.style = region.style;
	}

	let css = '';
	for (const [id, region] of state.regions.entries()) {
		if (!seenRegions.has(id)) {
			for (const element of region.dynamicElements) element.removeAttribute(dynamicAttribute(region.config));
			cleanupRegionInjection(region);
			state.regions.delete(id);
			continue;
		}

		if (region.injectedThemeStyleElement != null) {
			region.injectedThemeStyleElement.textContent = state.theme.css?.replace(':root', ':host') ?? '';
		}

		if (region.injectedElement != null) {
			region.injectedElement.style.display = isRegionBlockActive(region) ? 'block' : 'none';
			if (isRegionBlockActive(region)) recordBlockOnce();
		}

		if (region.css != null && isRegionBlockActive(region)) css += `${region.css}\n`;
		if (isDynamicRegion(region.config) && isRegionBlockActive(region)) {
			css += `[${dynamicAttribute(region.config)}] { ${region.style ?? ''} }\n`;
		}
	}

	setCss(css);
	scheduleDomRefresh();
};

browser.runtime.onMessage.addListener(async (msg: FromServiceWorkerMessage) => {
	if (msg.type === 'nfe#siteDetails' && msg.token === token) {
		if (msg.firstLoadRedirect != null) {
			try {
				if (sessionStorage.getItem(msg.firstLoadRedirect.sessionKey) == null) {
					sessionStorage.setItem(msg.firstLoadRedirect.sessionKey, '1');
					window.location.replace(msg.firstLoadRedirect.to);
					return;
				}
			} catch {
				// If session storage is unavailable, continue without redirecting.
			}
		}

		setSnoozeTimer(msg.snoozeUntil != null && msg.snoozeUntil > Date.now() ? msg.snoozeUntil : null);
		state.ready = true;
		state.siteId.set(msg.siteId);
		state.theme.css = msg.theme.css;
		state.theme.id.set(msg.theme.id);
		await domReady;
		patchState(msg.regions);
	}

	if (msg.type === 'nfe#optionsUpdated') {
		sendMessage({ type: 'requestSiteDetails', path: window.location.pathname, token });
	}
});

const pingServiceWorker = () => {
	if (state.ready || !extensionContextValid) return;
	sendMessage({ type: 'requestSiteDetails', path: window.location.pathname, token });
	setTimeout(pingServiceWorker, 25);
};

pingServiceWorker();
