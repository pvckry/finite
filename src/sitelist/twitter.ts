import { regionId, siteId, type Site } from "../types/sitelist";

export const site: Site = {
	id: siteId('twitter'),
	title: 'Twitter/X',
	hosts: ['x.com'],
	paths: ['/home', '/'],
	regions: [
		{
			id: regionId('default-following'),
			title: 'Default to the Following timeline',
			type: 'none',
			paths: 'inherit',
			selectors: ['main[role="main"]'],
			behavior: 'twitter-default-following',
		},
		{
			id: regionId('for-you-timeline'),
			title: 'For you timeline',
			type: 'remove',
			paths: 'inherit',
			selectors: ['main[role="main"]', 'div[data-testid="primaryColumn"]'],
			textSelectors: ['[role="tab"]'],
			textPatterns: ['^For you$'],
			textMatchMode: 'active-tab-timeline',
			inject: {
				mode: 'fixed-corner',
				selectors: ['body'],
			},
		},
		{
			id: regionId('following-timeline'),
			title: 'Following timeline',
			type: 'remove',
			paths: 'inherit',
			selectors: ['main[role="main"]', 'div[data-testid="primaryColumn"]'],
			textSelectors: ['[role="tab"]'],
			textPatterns: ['^Following$'],
			textMatchMode: 'active-tab-timeline',
			default: false,
			inject: {
				mode: 'fixed-corner',
				selectors: ['body'],
			},
		},
		{
			id: regionId('right-sidebar'),
			title: 'Search, trends, and suggested accounts sidebar',
			type: 'remove',
			paths: '*',
			selectors: ['div[data-testid="sidebarColumn"]'],
		},
		{
			id: regionId('promoted-posts'),
			title: 'Promoted posts',
			type: 'remove',
			paths: '*',
			selectors: [
				'[data-testid="placementTracking"] article',
				'a[href*="quick_promote_web"]',
			],
		},
		{
			id: regionId('who-to-follow'),
			title: 'Who to follow suggestions',
			type: 'remove',
			paths: '*',
			selectors: [
				'div[data-testid="primaryColumn"] section:has(a[href*="/i/connect_people"])',
				'div[data-testid="primaryColumn"] a[href*="/i/connect_people"]',
			],
		},
		{
			id: regionId('interaction-counts'),
			title: 'Reply, repost, like, and bookmark counts',
			type: 'remove',
			paths: '*',
			selectors: [
				'[data-testid="reply"] span',
				'[data-testid="retweet"] span',
				'[data-testid="unretweet"] span',
				'[data-testid="like"] span',
				'[data-testid="unlike"] span',
				'[data-testid="bookmark"] span',
				'[data-testid="removeBookmark"] span',
			],
		},
		{
			id: regionId('view-counts'),
			title: 'Post view counts',
			type: 'remove',
			paths: '*',
			selectors: [
				'article[data-testid="tweet"] a[href*="/analytics"] span',
				'div[role="dialog"] a[href*="/analytics"] span',
			],
		},
		{
			id: regionId('explore-navigation'),
			title: 'Explore navigation button',
			type: 'remove',
			paths: '*',
			selectors: ['[data-testid="AppTabBar_Explore_Link"]'],
		},
		{
			id: regionId('grok'),
			title: 'Grok navigation and drawer',
			type: 'remove',
			paths: '*',
			selectors: [
				'header[role="banner"] a[href*="/i/grok"]',
				'[data-testid="GrokDrawer"]',
			],
		},
		{
			id: regionId('premium'),
			title: 'Premium and creator promotions',
			type: 'remove',
			paths: '*',
			selectors: [
				'header[role="banner"] a[href*="/i/premium_sign_up"]',
				'header[role="banner"] a[href*="/i/jf/creators/studio"]',
				'div[data-testid="super-upsell-UpsellCardRenderProperties"]',
			],
		},
		{
			id: regionId('explore-posts'),
			title: 'Explore "Posts For You"',
			type: 'remove',
			paths: ['/explore'],
			selectors: [
				'div[data-testid="primaryColumn"] div[data-testid="cellInnerDiv"]:has(article[data-testid="tweet"])',
			],
		},
		{
			id: regionId('todays-news'),
			title: "Today's News",
			type: 'remove',
			paths: '*',
			selectors: [
				'div:has(> div[data-testid="news_sidebar"])',
				'div:has(> div[data-testid^="news_sidebar_article_"])',
			],
		},
		{
			id: regionId('trending'),
			title: "Trending now/What's happening",
			type: 'remove',
			paths: '*',
			selectors: [
				'section:has(div[aria-label="Timeline: Trending now"])',
				'div[aria-label="Timeline: Trending now"]',
			],
		},
	],
};

export default site;
