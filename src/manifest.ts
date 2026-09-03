import packageJson from '../package.json';

export default {
	"name": "Finite",
	"version": packageJson.version,
	"description": packageJson.description,
	"manifest_version": 3,
	"permissions": ["storage", "scripting"],
	"optional_host_permissions": [
		"*://www.facebook.com/*",
		"*://web.facebook.com/*",
		"*://m.facebook.com/*",
		"*://www.instagram.com/*",
		"*://www.youtube.com/*",
		"*://youtube.com/*",
		"*://www.reddit.com/*",
		"*://old.reddit.com/*",
		"*://x.com/*",
		"*://www.linkedin.com/*",
		"*://www.threads.com/*"
	],
	"action": {
		"default_icon": {
			"16": "assets/icons/logo-contrast-16.png",
			"32": "assets/icons/logo-contrast-32.png",
			"64": "assets/icons/logo-contrast-64.png",
		},
		"default_title": "Finite"
	},
	"background": {
		"service_worker": "entrypoints/service-worker/service-worker.js",
		"type": "module"
	},
	"options_ui": {
		"page": "entrypoints/options-page/index.html",
		"open_in_tab": true,
		"browser_style": false
	},
	"icons": {
		"16": "assets/icon16.png",
		"32": "assets/icon32.png",
		"48": "assets/icon48.png",
		"64": "assets/icon64.png",
		"128": "assets/icon128.png"
	},
	"web_accessible_resources": [
		{
			"resources": ["sitelist.json", "entrypoints/intercept/intercept.js"],
			"extension_ids": [],
		}
	]
}
