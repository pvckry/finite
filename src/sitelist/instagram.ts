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
			selectors: ['body'],
			groupSelector: 'a[href^="/stories/"]',
			groupAncestorSelectors: ['ul', '[role="list"]', 'div'],
			groupMinimum: 2,
			default: false,
		},
		{
			id: regionId('suggested-posts'),
			title: 'Suggested posts in the home feed',
			type: 'remove',
			category: 'algorithmic',
			paths: ['/'],
			selectors: ['main', '[role="main"]'],
			textSelectors: ['button', '[role="button"]', 'span[dir="auto"]', '[aria-label]'],
			textPatterns: [
				'^Suggested for you$',
				'^Suggested posts?$',
				'^Because you (?:watched|followed|liked).+$',
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
			category: 'algorithmic',
			paths: ['/'],
			selectors: ['main', '[role="main"]'],
			textSelectors: ['h1', 'h2', 'h3', '[role="heading"]'],
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
			category: 'algorithmic',
			paths: ['/'],
			selectors: ['div:has(> div > a[href="/explore/people/"])']
		},
		{
			id: regionId('explore-suggestions'),
			title: 'Explore suggestions',
			type: 'hide',
			category: 'algorithmic',
			paths: ['/explore/'],
			selectors: ['main[role="main"]', 'main', '[role="progressbar"]'],
			extraCss: `
				body:has(a[href="/explore/"][aria-current="page"]) [role="progressbar"] {
					display: none !important;
				}
			`,
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
			category: 'algorithmic',
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
			category: 'algorithmic',
			paths: '*',
			selectors: ['a[href="/reels/"]', 'a[href="/reels"]'],
		},
	]
}

export default site;
