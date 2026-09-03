export type SiteList = {
	schemaVersion: 1,
	sites: Site[]
};

export type SiteId = string & { __siteId: never };
export type RegionId = string & { __sectionId: never };

export const siteId = (id: string): SiteId => id as SiteId;
export const regionId = (id: string): RegionId => id as RegionId;

export type Path = string | { regexp: string };
export type PathList = Path[];

export type Site = {
	id: SiteId,
	title: string,
	hosts: string[],
	paths: PathList,
	popular?: boolean,
	firstLoadRedirect?: {
		from: PathList,
		to: string,
		sessionKey: string,
	},
	regions: Region[]
};


export type Inject = {
	mode: 'firstChild' | 'lastChild' | 'before' | 'after' | 'overlay' | 'overlay-fixed' | 'fixed-corner'
	overlayZIndex?: number;
	selectors?: string[];
}

export type Region = {
	id: RegionId,
	selectors: string[],
	title: string,
	type: 'hide' | 'remove' | 'dull' | 'none',
	/** Category restored when this region is snoozed. Defaults to the current page category. */
	category?: 'algorithmic' | 'intentional',
	paths: 'inherit' | '*' | PathList,
	default?: boolean,
	inject?: Inject,
	extraCss?: string,
	removeFromDom?: boolean,
	textPatterns?: string[],
	textSelectors?: string[],
	textMatchMode?: 'candidate' | 'closest-post' | 'following-posts' | 'active-tab-timeline',
	groupSelector?: string,
	groupAncestorSelectors?: string[],
	groupMinimum?: number,
	behavior?: 'youtube-cinema-mode' | 'twitter-default-following',
}
