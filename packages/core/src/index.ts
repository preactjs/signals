const SUBS = Symbol.for("subs");
const DEPS = Symbol.for("deps");
const VALUE = Symbol.for("value");
const PENDING = Symbol.for("pending");

let ROOT: Signal;

/** This tracks subscriptions of signals read inside a computed */
let currentSignal: Signal;
let commitError: Error | null = null;

const pending = new Set<Signal>();
/** Batch calls can be nested. 0 means that there is no batching */
let batchPending = 0;

let oldDeps = new Set<Signal>();

class Signal<T = any> {
	[SUBS] = new Set<Signal>();
	[DEPS] = new Set<Signal>();
	[PENDING] = 0;
	[VALUE]: T;

	constructor(value: T) {
		this[VALUE] = value;
	}

	toString() {
		return "" + this.value;
	}

	get value() {
		// subscribe the current computed to this signal:
		this[SUBS].add(currentSignal);
		// update the current computed's dependencies:
		currentSignal[DEPS].add(this);
		oldDeps.delete(this);

		// refresh stale value when this signal is read from withing
		// batching and when it has been marked already
		if (batchPending > 0 && this[PENDING] > 0) {
			refreshStale(this);
		}
		return this[VALUE];
	}

	set value(value) {
		if (this[VALUE] !== value) {
			this[VALUE] = value;
			let isFirst = pending.size === 0;

			pending.add(this);
			// in batch mode this signal may be marked already
			if (this[PENDING] === 0) {
				mark(this);
			}

			// this is the first change, not a computed and we are not
			// in batch mode:
			if (isFirst && batchPending === 0) {
				sweep(pending);
				pending.clear();
				if (commitError) {
					const err = commitError;
					// Clear global error flag for next commit
					commitError = null;
					throw err;
				}
			}
		}
	}

	updater() {
		// override me to handle updates
	}
}

function mark(signal: Signal) {
	if (signal[PENDING]++ === 0) {
		signal[SUBS].forEach(mark);
	}
}

function unmark(signal: Signal<any>) {
	if (--signal[PENDING] === 0) {
		signal[SUBS].forEach(unmark);
	}
}

function sweep(subs: Set<Signal<any>>) {
	subs.forEach(signal => {
		// If a computed errored during sweep, we'll discard that subtree
		// for this sweep cycle by setting PENDING to 0;
		if (signal[PENDING] > 0 && --signal[PENDING] === 0) {
			signal.updater();
			sweep(signal[SUBS]);
		}
	});
}

function unsubscribe(signal: Signal<any>, from: Signal<any>) {
	signal[DEPS].delete(from);
	from[SUBS].delete(signal);

	// If nobody listens to the signal we depended on, we can traverse
	// upwards and destroy all subscriptions until we encounter a writable
	// signal or a signal that others listen to as well.
	if (from[SUBS].size === 0) {
		from[DEPS].forEach(dep => unsubscribe(from, dep));
	}
}

const tmpPending: Signal[] = [];
/**
 * Refresh _just_ this signal and its dependencies recursively.
 * All other signals will be left untouched and added to the
 * global queue to flush later. Since we're traversing "upwards",
 * we don't have to car about topological sorting.
 */
function refreshStale(signal: Signal) {
	pending.delete(signal);
	signal[PENDING] = 0;
	signal.updater();

	signal[SUBS].forEach(sub => {
		if (sub[PENDING] > 0) {
			// If PENDING > 1 then we can safely reduce the counter because
			// the final sweep will take care of the rest. But if it's
			// exactly 1 we can't do that otherwise the sweeping logic
			// assumes that this signal was already updated.
			if (sub[PENDING] > 1) sub[PENDING]--;
			tmpPending.push(sub);
		}
	});
}

ROOT = currentSignal = new Signal(undefined);

export function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

export function computed<T>(compute: () => T): Signal<T> {
	const signal = new Signal<T>(undefined as any);

	function updater() {
		let tmp = currentSignal;
		currentSignal = signal;

		// Computed might conditionally access signals. This means that we need
		// to ensure that we unsubscribe from any old depedencies that aren't
		// used anymore.
		oldDeps = signal[DEPS];
		signal[DEPS] = new Set();

		try {
			let ret = compute();

			// Any leftover dependencies here are not needed anymore
			oldDeps.forEach(sub => unsubscribe(signal, sub));
			oldDeps.clear();

			if (signal[VALUE] === ret) {
				signal[SUBS].forEach(unmark);
			} else {
				signal[VALUE] = ret;
			}
		} catch (err: any) {
			// This is used by other computed's too, so we need to cleanup
			// after ourselves.
			oldDeps.clear();
			signal[SUBS].forEach(sub => unmark(sub));

			// Ensure that we log the first error not the last
			if (!commitError) commitError = err;
		} finally {
			currentSignal = tmp;
		}
	}

	signal.updater = updater;
	updater();

	return signal;
}

export function observe<T>(signal: Signal<T>, callback: (value: T) => void) {
	computed(() => callback(signal.value));
}

export function batch<T>(cb: () => T): T {
	batchPending++;
	try {
		return cb();
	} finally {
		// Since stale signals are refreshed upwards, we need to
		// add pending signals in reverse
		let item: Signal | undefined;
		while ((item = tmpPending.pop()) !== undefined) {
			pending.add(item);
		}

		if (--batchPending === 0) {
			sweep(pending);
		}
	}
}
