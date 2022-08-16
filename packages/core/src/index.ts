let ROOT: Signal;

/** This tracks subscriptions of signals read inside a computed */
let currentSignal: Signal;
let commitError: Error | null = null;

const pending = new Set<Signal>();
/** Batch calls can be nested. 0 means that there is no batching */
let batchPending = 0;

let oldDeps = new Set<Signal>();

export class Signal<T = any> {
	// These property names get minified - see /mangle.json

	/** @internal Internal, do not use. */
	_subs = new Set<Signal>();
	/** @internal Internal, do not use. */
	_deps = new Set<Signal>();
	/** @internal Internal, do not use. */
	_pending = 0;
	/** @internal Internal, do not use. */
	_value: T;
	/** Determine if a computed is allowed to write or not */
	_readonly = false;

	constructor(value: T) {
		this._value = value;
	}

	toString() {
		return "" + this.value;
	}

	get value() {
		// subscribe the current computed to this signal:
		this._subs.add(currentSignal);
		// update the current computed's dependencies:
		currentSignal._deps.add(this);
		oldDeps.delete(this);

		// refresh stale value when this signal is read from withing
		// batching and when it has been marked already
		if (batchPending > 0 && this._pending > 0) {
			refreshStale(this);
		}
		return this._value;
	}

	set value(value) {
		if (this._readonly) {
			throw new Error("Computed signals are readonly");
		}

		if (this._value !== value) {
			this._value = value;
			let isFirst = pending.size === 0;

			pending.add(this);
			// in batch mode this signal may be marked already
			if (this._pending === 0) {
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

	/**
	 * Start a read operation where this signal is the "current signal" context.
	 * Returns a function that must be called to end the read context.
	 * @internal
	 */
	_setCurrent() {
		let prevSignal = currentSignal;
		let prevOldDeps = oldDeps;
		currentSignal = this;
		oldDeps = this._deps;
		this._deps = new Set();

		return (shouldUnmark: boolean, shouldCleanup: boolean) => {
			if (shouldUnmark) this._subs.forEach(unmark);

			// Any leftover dependencies here are not needed anymore
			if (shouldCleanup) {
				// Unsubscribe from dependencies that were not accessed:
				oldDeps.forEach(sub => unsubscribe(this, sub));
			} else {
				// Re-subscribe to dependencies that not accessed:
				oldDeps.forEach(sub => subscribe(this, sub));
			}

			oldDeps.clear();
			oldDeps = prevOldDeps;
			currentSignal = prevSignal;
		};
	}

	/**
	 * A custom update routine to run when this Signal's value changes.
	 * @internal
	 */
	_updater() {
		// override me to handle updates
	}
}

function mark(signal: Signal) {
	if (signal._pending++ === 0) {
		signal._subs.forEach(mark);
	}
}

function unmark(signal: Signal<any>) {
	if (--signal._pending === 0) {
		signal._subs.forEach(unmark);
	}
}

function sweep(subs: Set<Signal<any>>) {
	subs.forEach(signal => {
		// If a computed errored during sweep, we'll discard that subtree
		// for this sweep cycle by setting PENDING to 0;
		if (signal._pending > 0 && --signal._pending === 0) {
			signal._updater();
			sweep(signal._subs);
		}
	});
}

function subscribe(signal: Signal<any>, to: Signal<any>) {
	signal._deps.add(to);
	to._subs.add(signal);
}

function unsubscribe(signal: Signal<any>, from: Signal<any>) {
	signal._deps.delete(from);
	from._subs.delete(signal);

	// If nobody listens to the signal we depended on, we can traverse
	// upwards and destroy all subscriptions until we encounter a writable
	// signal or a signal that others listen to as well.
	if (from._subs.size === 0) {
		from._deps.forEach(dep => unsubscribe(from, dep));
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
	signal._pending = 0;
	signal._updater();

	signal._subs.forEach(sub => {
		if (sub._pending > 0) {
			// If PENDING > 1 then we can safely reduce the counter because
			// the final sweep will take care of the rest. But if it's
			// exactly 1 we can't do that otherwise the sweeping logic
			// assumes that this signal was already updated.
			if (sub._pending > 1) sub._pending--;
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
	signal._readonly = true;

	function updater() {
		let finish = signal._setCurrent();

		try {
			let ret = compute();

			finish(signal._value === ret, true);
			signal._value = ret;
		} catch (err: any) {
			// Ensure that we log the first error not the last
			if (!commitError) commitError = err;
			finish(true, false);
		}
	}

	signal._updater = updater;
	updater();

	return signal;
}

export function observe<T>(signal: Signal<T>, callback: (value: T) => void) {
	const s = computed(() => callback(signal.value));
	s._readonly = true;
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
