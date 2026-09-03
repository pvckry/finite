import { createMemo, createSignal, Show, type ParentComponent } from "solid-js";
import { displayDuration } from "../../lib/time";
import { useOptionsPageState } from "./state";
import { DAY, HOUR, MINUTE } from "/lib/time";
import type { UsageCategory } from "/storage/schema";
import { categoryTitle } from "/usage/categories";

type SnoozePendingInfo = {
	secondsEarned: number;
	pendingProgress: number;
}

type LimitedCategory = Exclude<UsageCategory, 'messages'>;

export const HoldSnoozeButton = ({ category }: { category: LimitedCategory }) => {
	const state = useOptionsPageState();

	const [buttonHeldSince, setButtonHeldSince] = createSignal<number | null>(null);

	const timeHeld = createMemo(() => {
		const since = buttonHeldSince();
		if (since == null) return null;

		return (state.clock.get() - since) / 1000;
	});

	const snoozePendingInfo = createMemo((): SnoozePendingInfo | null => {
		const holdTime = timeHeld();
		if (holdTime == null) return null;

		if (holdTime < 5) {
			return { secondsEarned: 0, pendingProgress: holdTime / 5 };
		}

		if (holdTime < 60) {
			return { secondsEarned: 30 + Math.round((holdTime - 5) * 5), pendingProgress: 1 };
		}

		return { secondsEarned: 30 + (55 * 5) + Math.round((holdTime - 60) * 20), pendingProgress: 1 };
	});

	const buttonDown = (e: { button: number, preventDefault: () => void }) => {
		if (e.button !== 0) return;
		setButtonHeldSince(state.clock.get());
	};

	const buttonUp = async (e: { button: number }) => {
		if (e.button !== 0) return;
		const { secondsEarned } = snoozePendingInfo() ?? {};
		if (secondsEarned != null && secondsEarned > 0) {
			await state.startSnooze(category, 1000 * secondsEarned);
		}
		setButtonHeldSince(null);
	};

	const snoozeButtonLabel = () => {
		const { secondsEarned } = snoozePendingInfo() ?? {};
		if (secondsEarned == null) return 'Press and hold to snooze';
		if (secondsEarned === 0) return 'Keep holding...';

		return `Snooze for ${displayDuration(secondsEarned * 1000)}`;
	}

	const snoozeButtonTransform = () => {
		const { pendingProgress } = snoozePendingInfo() ?? {};
		if (pendingProgress == null) return 'scaleX(0)';
		return `scaleX(${pendingProgress})`;
	}

	return <button class="primary font-lg p-8 overlay-container isolate" style="width: 300px" onMouseDown={buttonDown} onMouseUp={buttonUp} onContextMenu={e => e.preventDefault()} onMouseLeave={buttonUp}>
		<div class="z1 overlay bg-accent transform-origin-left" style={`transform: ${snoozeButtonTransform()}`} />
		<div class="z2 position-relative">
			{snoozeButtonLabel()}
		</div>
	</button>
}

const InstantSnoozeButton: ParentComponent<{ category: LimitedCategory, ms: number, primary?: boolean }> = ({category, ms, primary, children}) => {
	const state = useOptionsPageState();

	const onClick = async () => {
		await state.startSnooze(category, ms);
	}

	return <button class={`${primary ? 'primary' : 'tertiary'} font-lg p-4`} onClick={onClick}>{children}</button>
}

const InstantSnoozeButtons = ({ category }: { category: LimitedCategory }) => {
		return <div class="flex gap-2 cross-center card outlined shadow p-4 snooze-strip">
			<div class="text-secondary">Snooze for</div>
			<InstantSnoozeButton category={category} ms={MINUTE}>1m</InstantSnoozeButton>
			<InstantSnoozeButton category={category} ms={2 * MINUTE}>2m</InstantSnoozeButton>
			<InstantSnoozeButton category={category} ms={5 * MINUTE}>5m</InstantSnoozeButton>
			<InstantSnoozeButton category={category} primary ms={10 * MINUTE}>10m</InstantSnoozeButton>
			<InstantSnoozeButton category={category} ms={30 * MINUTE}>30m</InstantSnoozeButton>
			<InstantSnoozeButton category={category} ms={HOUR}>1h</InstantSnoozeButton>
			<InstantSnoozeButton category={category} ms={DAY}>24h</InstantSnoozeButton>
		</div>
}

const CategorySnooze = ({ category }: { category: LimitedCategory }) => {
	const state = useOptionsPageState();

	const isSnoozing = () => {
		return state.snoozeRemaining(category) > 0;
	}

	return <div class="category-snooze">
		<div class="category-snooze-heading">
			<strong>{categoryTitle(category)}</strong>
			<span>{category === 'algorithmic' ? 'Feeds, recommendations, explore, and short-form video.' : 'Following, subscriptions, searches, and direct visits.'}</span>
		</div>
		<Show when={!isSnoozing()}>
			<div class="flex axis-center">
				<Show when={state.snoozeMode.get() === 'hold'}>
					<HoldSnoozeButton category={category} />
				</Show>
				<Show when={state.snoozeMode.get() === 'instant'}>
					<InstantSnoozeButtons category={category} />
				</Show>
			</div>
		</Show>

		<Show when={isSnoozing()}>
			<div class="flex cross-center p-4 card secondary outlined shadow">
				<div class="flex-1">
					Snoozed for {displayDuration(state.snoozeRemaining(category))}. It will end after five inactive minutes.
				</div>
				<button class="secondary" onClick={() => state.cancelSnooze(category)}>
					Cancel snooze
				</button>
			</div>
		</Show>
	</div>
}

export const Snooze = () => <div class="category-snooze-list">
	<CategorySnooze category="algorithmic" />
	<CategorySnooze category="intentional" />
</div>;
