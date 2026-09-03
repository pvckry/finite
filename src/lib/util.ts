import type { Site } from "../types/sitelist";
import packageJson from '../../package.json';

export function originsForSite(site: Site) {
	return site.hosts.map(host => `*://${host}/*`);
}

export const versionText = () => {
	return `v${packageJson.version}`;
}

export function expect<T>(value: T | null | undefined): T {
	if (value == null) {
		throw new Error(`Expected value to be defined, got ${value}`);
	}
	return value;
}
