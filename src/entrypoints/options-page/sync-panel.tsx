import { createSignal, Show } from 'solid-js';
import { getBrowser } from '/lib/webextension';
import { useOptionsPageState } from './state';

const browser = getBrowser();

const defaultDeviceName = () => /Mac/i.test(navigator.platform) ? 'MacBook' : /Win/i.test(navigator.platform) ? 'PC' : 'Browser';

const formatTimestamp = (timestamp?: number) => timestamp == null
	? 'Not yet'
	: new Date(timestamp).toLocaleString();

export const SyncPanel = () => {
	const state = useOptionsPageState();
	const [pairingCode, setPairingCode] = createSignal('');
	const [deviceName, setDeviceName] = createSignal(defaultDeviceName());
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	const pair = async () => {
		setBusy(true);
		setError(null);
		try {
			await browser.runtime.sendMessage({ type: 'pairFiniteSync', pairingCode: pairingCode(), deviceName: deviceName() });
			setPairingCode('');
			await state.finiteSync.refetch();
		} catch (value) {
			setError(value instanceof Error ? value.message : String(value));
		} finally {
			setBusy(false);
		}
	};

	const syncNow = async () => {
		setBusy(true);
		setError(null);
		try {
			await browser.runtime.sendMessage({ type: 'syncFiniteNow' });
			await state.finiteSync.refetch();
		} catch (value) {
			setError(value instanceof Error ? value.message : String(value));
		} finally {
			setBusy(false);
		}
	};

	const disconnect = async () => {
		await browser.runtime.sendMessage({ type: 'disconnectFiniteSync' });
		await state.finiteSync.refetch();
	};

	return <div class="sync-panel">
		<Show when={state.finiteSync.get()?.paired} fallback={<>
			<div class="sync-intro">
				<strong>Pair this browser</strong>
				<p>Enter a one-time code from your Zenithar instance. Finite uses its own installation token and does not take over your Vckry app session.</p>
			</div>
			<div class="sync-pair-form">
				<label>
					<span>Device name</span>
					<input value={deviceName()} maxlength="80" onInput={event => setDeviceName(event.currentTarget.value)} />
				</label>
				<label>
					<span>Pairing code</span>
					<input class="sync-code" value={pairingCode()} maxlength="32" autocomplete="off" spellcheck={false} onInput={event => setPairingCode(event.currentTarget.value)} />
				</label>
				<button class="primary" disabled={busy() || pairingCode().trim().length !== 32 || deviceName().trim().length === 0} onClick={pair}>Pair browser</button>
			</div>
		</>}>
			<div class="sync-status">
				<div>
					<div class="sync-status-line"><span class="sync-dot" /> <strong>Paired as {state.finiteSync.get()?.deviceName}</strong></div>
					<p>Last successful sync: {formatTimestamp(state.finiteSync.get()?.lastSuccessAt)}</p>
				</div>
				<div class="sync-actions">
					<button class="primary" disabled={busy()} onClick={syncNow}>Sync now</button>
					<button class="tertiary" disabled={busy()} onClick={disconnect}>Disconnect</button>
				</div>
			</div>
		</Show>
		<Show when={error() ?? state.finiteSync.get()?.lastError}>
			<p class="sync-error">{error() ?? state.finiteSync.get()?.lastError}</p>
		</Show>
		<p class="panel-note">Only site, category, totals, limits, settings, and snooze outcomes sync. URLs and page content are never recorded.</p>
	</div>;
};
