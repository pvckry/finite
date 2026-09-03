import { regionId, siteId, type Site } from "../types/sitelist";

export const site: Site = {
	id: siteId('instagram'),
	title: 'Instagram',
	hosts: ['www.instagram.com'],
	paths: ['/', '/explore/'],
	firstLoadRedirect: {
		from: ['/'],
		to: '/direct/inbox/',
		sessionKey: 'nfe-instagram-messages-redirected',
	},
	regions: [
		{
			id: regionId('stories'),
			title: 'Stories',
			type: 'remove',
			paths: ['/'],
			selectors: ['main', '[role="main"]'],
			groupSelector: 'a[href^="/stories/"]',
			groupAncestorSelectors: ['ul', '[role="list"]'],
			groupMinimum: 2,
			default: false,
		},
		{
			id: regionId('suggested-posts'),
			title: 'Suggested posts in the home feed',
			type: 'remove',
			paths: ['/'],
			selectors: ['main', '[role="main"]'],
			textSelectors: ['button', '[role="button"]', 'span'],
			textPatterns: [
				'^Suggested for you$',
				'^Suggested posts?$',
				'^Because you (?:watched|followed|liked).+$',
				'^Follow$',
				'^Suggestions pour vous$',
				'^Vorgeschlagene(?: Beiträge)?$',
				'^Sugerencias para ti$',
				'^Suggeriti per te$',
				'^Sugestões para você$',
				'^Voorgesteld voor jou$',
			],
			textMatchMode: 'closest-post',
			inject: {
				mode: 'fixed-corner',
				selectors: ['body'],
				overlayZIndex: 2147483646,
			}
		},
		{
			id: regionId('suggested-feed-after-caught-up'),
			title: 'Suggested feed after you are caught up',
			type: 'remove',
			paths: ['/'],
			selectors: ['main', '[role="main"]'],
			textSelectors: ['h1', 'h2', 'h3', '[role="heading"]', 'span'],
			textPatterns: [
				'^Suggested posts?$',
				'^Publications suggérées$',
				'^Vorgeschlagene Beiträge$',
				'^Publicaciones sugeridas$',
				'^Post suggeriti$',
				'^Publicações sugeridas$',
				'^Voorgestelde berichten$',
			],
			textMatchMode: 'following-posts',
		},
		{
			id: regionId('suggested-people'),
			title: 'Suggested accounts',
			type: 'remove',
			paths: ['/'],
			selectors: ['div:has(> div > a[href="/explore/people/"])']
		},
		{
			id: regionId('explore-suggestions'),
			title: 'Explore suggestions',
			type: 'remove',
			paths: ['/explore/'],
			selectors: ['main[role="main"]', 'main'],
			removeFromDom: true,
			inject: {
				mode: 'fixed-corner',
				selectors: ['body'],
				overlayZIndex: 2147483646,
			},
		},
		{
			id: regionId('reels-feed'),
			title: 'Reels feed',
			type: 'remove',
			paths: [{ regexp: '^/reels?(?:/|$)' }],
			selectors: ['main[role="main"]', 'main'],
			inject: {
				mode: 'fixed-corner',
				selectors: ['body'],
				overlayZIndex: 2147483646,
			},
		},
		{
			id: regionId('reels-button'),
			title: 'Reels navigation button',
			type: 'remove',
			paths: '*',
			selectors: ['a[href="/reels/"]', 'a[href="/reels"]'],
		},
	]
}

export default site;
