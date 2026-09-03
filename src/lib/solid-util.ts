import { createSignal, type Accessor, type ResourceReturn, type Setter } from "solid-js";

export type SignalObj<T> = {
	set: Setter<T>,
	get: Accessor<T>,
};

/**
 * Destructuring is inconvenient inside objects, so this is to make it more explicit what's going on
 */
export const signalObj = <T>(defaultVal: T): SignalObj<T> => {
	const [get, set] = createSignal(defaultVal);
	return {set, get}
};

export const resourceObj = <T, R>(v: ResourceReturn<T, R>) => {
	const [get, { refetch }] = v;
	return {get, refetch};
};
