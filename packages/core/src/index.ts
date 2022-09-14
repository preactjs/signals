/** This tracks subscriptions of signals read inside a computed */
let currentSignal: Signal | undefined;
let commitError: Error | null = null;

let batchPending: Set<Signal> | null = null;

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
	/** @internal Determine if a computed is allowed to write or not */
	_readonly = false;
	/** @internal Marks the signal as requiring an update */
	_requiresUpdate = false;
	/** @internal Determine if reads should eagerly activate value */
	_active = false;
	/** @internal Used to detect if there is a cycle in the graph */
	_isComputing = false;

	constructor(value: T) {
		this._value = value;
	}

	toString() {
		return "" + this.value;
	}

	peek() {
		if (!this._active || this._pending > 0) {
			activate(this);
		}
		return this._value;
	}

	get value() {
		if (!this._active || this._pending > 0) {
			activate(this);
		}

		// If we read a signal outside of a computed we have no way
		// to unsubscribe from that. So we assume that the user wants
		// to get the value immediately like for testing.
		if (!currentSignal) {
			return this._value;
		}

		// subscribe the current computed to this signal:
		this._subs.add(currentSignal);
		// update the current computed's dependencies:
		currentSignal._deps.add(this);
		oldDeps.delete(this);

		return this._value;
	}

	set value(value) {
		if (this._readonly) {
			throw Error("Computed signals are readonly");
		}

		if (this._value !== value) {
			this._value = value;

			batch(() => {
				batchPending!.add(this);

				// in batch mode this signal may be marked already
				if (this._pending === 0) {
					mark(this);
				}
			});
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
				oldDeps.forEach(dep => unsubscribe(this, dep));
			} else {
				// Re-subscribe to dependencies that were not accessed:
				oldDeps.forEach(dep => subscribe(this, dep));
			}

			oldDeps.clear();
			oldDeps = prevOldDeps;
			currentSignal = prevSignal;
		};
	}

	subscribe(fn: (value: T) => void): () => void {
		return effect(() => fn(this.value));
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
	// We can only unmark this node as not needing an update if it
	// wasn't flagged as needing an update by someone else. This is
	// done to make the sweeping logic independent of the order
	// in which a dependency tries to unmark a subtree.
	if (
		!signal._requiresUpdate &&
		signal._pending > 0 &&
		--signal._pending === 0
	) {
		signal._subs.forEach(unmark);
	}
}

function sweep(subs: Set<Signal<any>>) {
	subs.forEach(signal => {
		// If a computed errored during sweep, we'll discard that subtree
		// for this sweep cycle by setting PENDING to 0;
		if (signal._pending > 1) return --signal._pending;
		let ready = true;
		signal._deps.forEach(dep => {
			if (dep._pending > 0) ready = false;
		});

		if (ready && signal._pending > 0 && --signal._pending === 0) {
			if (signal._isComputing) {
				throw Error("Cycle detected");
			}

			signal._requiresUpdate = false;
			signal._isComputing = true;
			signal._updater();
			signal._isComputing = false;
			sweep(signal._subs);
		}
	});
}

function subscribe(signal: Signal<any>, to: Signal<any>) {
	signal._active = true;
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
		from._active = false;
		from._deps.forEach(dep => unsubscribe(from, dep));
	}
}

const tmpPending: Signal[] = [];
/**
 * Refresh _just_ this signal and its dependencies recursively.
 * All other signals will be left untouched and added to the
 * global queue to flush later. Since we're traversing "upwards",
 * we don't have to care about topological sorting.
 */
function refreshStale(signal: Signal) {
	if (batchPending) {
		batchPending.delete(signal);
	}

	signal._pending = 0;
	signal._updater();
	if (commitError) {
		const err = commitError;
		commitError = null;
		throw err;
	}

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

function activate(signal: Signal) {
	signal._active = true;
	refreshStale(signal);
}

export function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

export type ReadonlySignal<T = any> = Omit<Signal<T>, "value"> & {
	readonly value: T;
};
export function computed<T>(compute: () => T): ReadonlySignal<T> {
	const signal = new Signal<T>(undefined as any);
	signal._readonly = true;

	function updater() {
		let finish = signal._setCurrent();

		try {
			let ret = compute();
			const stale = signal._value === ret;
			if (!stale) signal._subs.forEach(sub => (sub._requiresUpdate = true));
			finish(stale, true);
			signal._value = ret;
		} catch (err: any) {
			// Ensure that we log the first error not the last
			if (!commitError) commitError = err;
			finish(true, false);
		}
	}

	signal._updater = updater;

	return signal;
}

export function effect(callback: () => void) {
	const s = computed(() => batch(callback));
	// Set up subscriptions since this is a "reactor" signal
	activate(s);
	return () => s._setCurrent()(true, true);
}

export function batch<T>(cb: () => T): T {
	if (batchPending !== null) {
		return cb();
	} else {
		const pending: Set<Signal> = new Set();

		batchPending = pending;

		try {
			return cb();
		} finally {
			// Since stale signals are refreshed upwards, we need to
			// add pending signals in reverse
			let item: Signal | undefined;
			while ((item = tmpPending.pop()) !== undefined) {
				pending.add(item);
			}

			batchPending = null;

			sweep(pending);
			if (commitError) {
				const err = commitError;
				// Clear global error flag for next commit
				commitError = null;
				throw err;
			}
		}
	}
}
