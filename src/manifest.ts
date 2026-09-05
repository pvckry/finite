import packageJson from '../package.json';

export default {
	"name": "Finite",
	"version": packageJson.version,
	"description": packageJson.description,
	"manifest_version": 3,
	"key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1EjVwe2HuREe6NQwouRU9Rs+poIFb6Hg9gETVdD/TjiMqL/GjvSa4oTD5DU+aZhvxowPsTEXaLfaIQ/knC7lCaHQT0Thc7pDoIgbIVNk6tR5uJzY7FRppAALqyTUOfqhOTdGd4Cs2i4nnpSO9YoM28Y55AXsqQ4NbFooVx1EDkEDrREtt4syPG4W4bn6S9jprfh5vhyI4Nco9gmmZD8AyMnvPI9pJaUqSKFr69TaL76REl9idgD/XFGH+Ck4vf+2oVxeggKeOaJsuGG7ttrrVyr3aWsNLOUYTQKCa+u+IEcIZPi4CQ8ych6ub9B7rms2OI4VG0ZIrhZatDkeRt2/lwIDAQAB",
	"update_url": "https://api.vckry.com/finite-updates/updates.xml",
	"permissions": ["storage", "scripting"],
	"host_permissions": ["https://api.vckry.com/*"],
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
