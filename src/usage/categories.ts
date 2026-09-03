import type { UsageCategory } from '/storage/schema';
import type { SiteId } from '/types/sitelist';

export type ClassificationHints = {
	instagramSuggested?: boolean;
	twitterTimeline?: 'for-you' | 'following';
	provenance?: UsageCategory;
};

export const classifySurface = (
	siteId: SiteId,
	path: string,
	hints: ClassificationHints = {},
): UsageCategory => {
	const site = String(siteId);

	if (site === 'instagram') {
		if (path.startsWith('/direct')) return 'messages';
		if (path.startsWith('/reel') || path.startsWith('/explore')) return 'algorithmic';
		if (path === '/' && hints.instagramSuggested) return 'algorithmic';
		return hints.provenance ?? 'intentional';
	}

	if (site === 'youtube') {
		if (path.startsWith('/shorts')) return 'algorithmic';
		if (path === '/' || path === '/gaming' || path === '/podcasts') return 'algorithmic';
		return hints.provenance ?? 'intentional';
	}

	if (site === 'twitter') {
		if (path.startsWith('/messages')) return 'messages';
		if (path === '/' || path === '/home') {
			return hints.twitterTimeline === 'for-you' ? 'algorithmic' : 'intentional';
		}
		if (path.startsWith('/explore')) return 'algorithmic';
		return hints.provenance ?? 'intentional';
	}

	if (site === 'facebook') {
		if (path.startsWith('/messages')) return 'messages';
		if (path === '/' || path === '/home.php') return 'algorithmic';
		return hints.provenance ?? 'intentional';
	}

	if (site === 'reddit') {
		if (path.startsWith('/message') || path.startsWith('/chat')) return 'messages';
		if (/^\/(?:$|new\/?$|hot\/?$|rising\/?$|controversial\/?$|top\/?$|best\/?$|r\/popular\/?$|r\/all\/?$)/.test(path)) {
			return 'algorithmic';
		}
		return hints.provenance ?? 'intentional';
	}

	if (site === 'linkedin') {
		if (path.startsWith('/messaging')) return 'messages';
		if (path.startsWith('/feed')) return 'algorithmic';
		return hints.provenance ?? 'intentional';
	}

	if (site === 'threads') {
		if (path.startsWith('/direct') || path.startsWith('/messages')) return 'messages';
		if (path === '/' || path.startsWith('/for_you')) return 'algorithmic';
		return hints.provenance ?? 'intentional';
	}

	return hints.provenance ?? 'intentional';
};

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
