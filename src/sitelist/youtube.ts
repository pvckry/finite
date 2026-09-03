import { type Site, siteId, regionId } from "../types/sitelist";

export const site: Site = {
			id: siteId('youtube'),
			title: 'YouTube',
			hosts: ['www.youtube.com', 'youtube.com'],
			paths: ['/', '/gaming', '/podcasts'],
			regions: [
				{
					id: regionId('cinema-mode'),
					title: 'Default to cinema mode',
					selectors: ['ytd-watch-flexy'],
					paths: ['/watch'],
					type: 'none',
					behavior: 'youtube-cinema-mode',
				},
				{
					id: regionId('feed'),
					title: 'Main feed',
					selectors: ['ytd-browse'],
					paths: 'inherit',
					type: 'hide',
					inject: {
						mode: 'fixed-corner',
						selectors: ['body'],
						overlayZIndex: 2019,
					},
				},
				{
					id: regionId('explore-nav'),
					title: 'Explore navigation menu',
					type: 'remove',
					paths: '*',
					selectors: ['ytd-guide-section-renderer:nth-child(4)']
				},
				{
					id: regionId('end-screen-suggested'),
					title: 'End screen suggested videos',
					paths: '*',
					type: 'remove',
					selectors: ['.ytp-fullscreen-grid'],
				},
				{
					id: regionId('sidebar-suggested'),
					title: 'Suggested videos sidebar',
					type: 'remove',
					paths: ['/watch'],
					selectors: [
						'ytd-watch-flexy #secondary',
						'ytd-watch-next-secondary-results-renderer',
						'#related',
					],
					removeFromDom: true,
					extraCss: `
						ytd-watch-flexy #columns.ytd-watch-flexy {
							display: block !important;
							max-width: none !important;
						}
						ytd-watch-flexy #primary.ytd-watch-flexy {
							box-sizing: border-box !important;
							margin-left: auto !important;
							margin-right: auto !important;
							max-width: 1280px !important;
							width: min(1280px, calc(100% - 48px)) !important;
						}
					`,
				},
				{
					id: regionId('comments'),
					title: 'Video comments',
					type: 'remove',
					paths: ['/watch'],
					selectors: [
						'ytd-comments',
						'#comments',
						'ytd-item-section-renderer[target-id="comments-section"]',
					],
					removeFromDom: true,
				},
				{
					id: regionId('live-chat'),
					title: 'Live chat',
					type: 'hide',
					paths: ['/watch'],
					selectors: ['ytd-live-chat-frame'],
					default: false,
				},
				{
					id: regionId('notifications'),
					title: 'Notifications',
					type: 'remove',
					paths: '*',
					selectors: ['ytd-notification-topbar-button-renderer'],
					default: false,
				},
				{
					id: regionId('subscriptions'),
					title: 'Subscriptions',
					type: 'remove',
					paths: '*',
					selectors: [
						'ytd-guide-section-renderer:nth-child(2)', 
						'ytd-mini-guide-renderer:nth-child(2)'
					],
					default: false,
				},
				{
					id: regionId('shorts-feed'),
					title: 'Shorts feed',
					type: 'hide',
					paths: [{ regexp: '^/shorts(?:/|$)' }],
					selectors: ['ytd-shorts', '#shorts-inner-container'],
					inject: {
						mode: 'fixed-corner',
						selectors: ['body'],
						overlayZIndex: 2020,
					},
				},
				{
					id: regionId('shorts-button'),
					title: 'Shorts navigation buttons',
					type: 'remove',
					paths: '*',
					selectors: [
						'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
						'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
					],
				},
				{
					id: regionId('shorts-shelves'),
					title: 'Shorts shelves and search results',
					type: 'remove',
					paths: '*',
					selectors: [
						'ytd-rich-shelf-renderer[is-shorts]',
						'ytd-reel-shelf-renderer',
						'grid-shelf-view-model',
					],
				},
			],
		}

export default site;
