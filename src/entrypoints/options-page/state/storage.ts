import { createResource } from "solid-js";
import { resourceObj } from "/lib/solid-util";
import { loadSettingsLocked, saveSettingsLocked } from "/storage/storage";

export class StorageState {
	settingsLocked = resourceObj(createResource(loadSettingsLocked));

	async setSettingsLocked(locked: boolean) {
		await saveSettingsLocked(locked);
		await this.settingsLocked.refetch();
	}
}
