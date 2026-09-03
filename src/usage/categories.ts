import type { UsageCategory } from '/storage/schema';
import type { UsageSurfaceId } from '/storage/schema';
import type { SiteId } from '/types/sitelist';

export type ClassificationHints = {
	instagramSuggested?: boolean;
	twitterTimeline?: 'for-you' | 'following';
	provenance?: UsageCategory;
};

export type SurfaceClassification = {
	category: UsageCategory;
	surfaceId: UsageSurfaceId;
};

export const classifySurfaceDetails = (
	siteId: SiteId,
	path: string,
	hints: ClassificationHints = {},
): SurfaceClassification => {
	const site = String(siteId);

	if (site === 'instagram') {
		if (path.startsWith('/direct')) return { category: 'messages', surfaceId: 'messages' };
		if (path.startsWith('/reel')) return { category: 'algorithmic', surfaceId: 'reels' };
		if (path.startsWith('/explore')) return { category: 'algorithmic', surfaceId: 'explore' };
		if (path === '/' && hints.instagramSuggested) return { category: 'algorithmic', surfaceId: 'home_suggested' };
		if (path === '/') return { category: hints.provenance ?? 'intentional', surfaceId: 'home_following' };
		return { category: hints.provenance ?? 'intentional', surfaceId: 'other' };
	}

	if (site === 'youtube') {
		if (path.startsWith('/shorts')) return { category: 'algorithmic', surfaceId: 'shorts' };
		if (path === '/') return { category: 'algorithmic', surfaceId: 'home' };
		if (path === '/gaming') return { category: 'algorithmic', surfaceId: 'gaming' };
		if (path === '/podcasts') return { category: 'algorithmic', surfaceId: 'podcasts' };
		if (path.startsWith('/watch')) return { category: hints.provenance ?? 'intentional', surfaceId: 'watch' };
		if (path.startsWith('/results')) return { category: hints.provenance ?? 'intentional', surfaceId: 'search_results' };
		if (path.startsWith('/feed/subscriptions')) return { category: hints.provenance ?? 'intentional', surfaceId: 'subscriptions' };
		return { category: hints.provenance ?? 'intentional', surfaceId: 'other' };
	}

	if (site === 'twitter') {
		if (path.startsWith('/messages')) return { category: 'messages', surfaceId: 'messages' };
		if (path === '/' || path === '/home') {
			return hints.twitterTimeline === 'for-you'
				? { category: 'algorithmic', surfaceId: 'for_you' }
				: { category: 'intentional', surfaceId: 'following' };
		}
		if (path.startsWith('/explore')) return { category: 'algorithmic', surfaceId: 'explore' };
		return { category: hints.provenance ?? 'intentional', surfaceId: 'other' };
	}

	if (site === 'facebook') {
		if (path.startsWith('/messages')) return { category: 'messages', surfaceId: 'messages' };
		if (path === '/' || path === '/home.php') return { category: 'algorithmic', surfaceId: 'home_feed' };
		return { category: hints.provenance ?? 'intentional', surfaceId: 'other' };
	}

	if (site === 'reddit') {
		if (path.startsWith('/message') || path.startsWith('/chat')) return { category: 'messages', surfaceId: 'messages' };
		if (/^\/(?:$|new\/?$|hot\/?$|rising\/?$|controversial\/?$|top\/?$|best\/?$)/.test(path)) {
			return { category: 'algorithmic', surfaceId: 'home_feed' };
		}
		if (/^\/r\/(?:popular|all)\/?$/.test(path)) return { category: 'algorithmic', surfaceId: 'popular_feed' };
		if (/^\/r\/[^/]+\/?$/.test(path)) return { category: hints.provenance ?? 'intentional', surfaceId: 'community' };
		return { category: hints.provenance ?? 'intentional', surfaceId: 'post_or_other' };
	}

	if (site === 'linkedin') {
		if (path.startsWith('/messaging')) return { category: 'messages', surfaceId: 'messages' };
		if (path.startsWith('/feed')) return { category: 'algorithmic', surfaceId: 'home_feed' };
		return { category: hints.provenance ?? 'intentional', surfaceId: 'other' };
	}

	if (site === 'threads') {
		if (path.startsWith('/direct') || path.startsWith('/messages')) return { category: 'messages', surfaceId: 'messages' };
		if (path === '/' || path.startsWith('/for_you')) return { category: 'algorithmic', surfaceId: 'for_you' };
		return { category: hints.provenance ?? 'intentional', surfaceId: 'other' };
	}

	return { category: hints.provenance ?? 'intentional', surfaceId: 'other' };
};

export const classifySurface = (
	siteId: SiteId,
	path: string,
	hints: ClassificationHints = {},
): UsageCategory => classifySurfaceDetails(siteId, path, hints).category;

export const categoryTitle = (category: UsageCategory): string => {
	if (category === 'algorithmic') return 'Algorithmic';
	if (category === 'intentional') return 'Intentional';
	return 'Messages';
};

export const siteIdForHost = (host: string): SiteId | null => {
	const normalized = host.toLowerCase();
	if (normalized === 'www.youtube.com' || normalized === 'youtube.com') return 'youtube' as SiteId;
	if (normalized === 'www.instagram.com') return 'instagram' as SiteId;
	if (normalized === 'x.com') return 'twitter' as SiteId;
	if (normalized.endsWith('facebook.com')) return 'facebook' as SiteId;
	if (normalized === 'www.reddit.com' || normalized === 'old.reddit.com') return 'reddit' as SiteId;
	if (normalized === 'www.linkedin.com') return 'linkedin' as SiteId;
	if (normalized === 'www.threads.com') return 'threads' as SiteId;
	return null;
};
