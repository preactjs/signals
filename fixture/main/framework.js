/** This tracks subscriptions of signals read inside a computed */
let currentSignal;
let commitError = null;
const pending = new Set();
/** Batch calls can be nested. 0 means that there is no batching */

let batchPending = 0;
let oldDeps = new Set();
class Signal {
	// These property names get minified - see /mangle.json

	/** @internal Internal, do not use. */

	/** @internal Internal, do not use. */

	/** @internal Internal, do not use. */

	/** @internal Internal, do not use. */

	/** @internal Determine if a computed is allowed to write or not */

	/** @internal Marks the signal as requiring an update */

	/** @internal Determine if reads should eagerly activate value */

	/** @internal Used to detect if there is a cycle in the graph */
	constructor(value) {
		this._subs = new Set();
		this._deps = new Set();
		this._pending = 0;
		this._value = void 0;
		this._readonly = false;
		this._requiresUpdate = false;
		this._active = false;
		this._isComputing = false;
		this._value = value;
	}

	toString() {
		return "" + this.value;
	}

	peek() {
		if (!this._active) {
			activate(this);
		}

		return this._value;
	}

	get value() {
		if (!this._active) {
			activate(this);
		} // If we read a signal outside of a computed we have no way
		// to unsubscribe from that. So we assume that the user wants
		// to get the value immediately like for testing.

		if (!currentSignal) {
			return this._value;
		} // subscribe the current computed to this signal:

		this._subs.add(currentSignal); // update the current computed's dependencies:

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
			let isFirst = pending.size === 0;
			pending.add(this); // in batch mode this signal may be marked already

			if (this._pending === 0) {
				mark(this);
			} // this is the first change, not a computed and we are not
			// in batch mode:

			if (isFirst && batchPending === 0) {
				sweep(pending);
				pending.clear();

				if (commitError) {
					const err = commitError; // Clear global error flag for next commit

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
		return (shouldUnmark, shouldCleanup) => {
			if (shouldUnmark) this._subs.forEach(unmark); // Any leftover dependencies here are not needed anymore

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
	/**
	 * A custom update routine to run when this Signal's value changes.
	 * @internal
	 */

	_updater() {
		// override me to handle updates
	}
}

function mark(signal) {
	if (signal._pending++ === 0) {
		signal._subs.forEach(mark);
	}
}

function unmark(signal) {
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

function sweep(subs) {
	subs.forEach(signal => {
		// If a computed errored during sweep, we'll discard that subtree
		// for this sweep cycle by setting PENDING to 0;
		if (signal._pending > 0) {
			signal._requiresUpdate = true;

			if (--signal._pending === 0) {
				if (signal._isComputing) {
					throw Error("Cycle detected");
				}

				signal._requiresUpdate = false;
				signal._isComputing = true;

				signal._updater();

				signal._isComputing = false;
				sweep(signal._subs);
			}
		}
	});
}

function subscribe(signal, to) {
	signal._active = true;

	signal._deps.add(to);

	to._subs.add(signal);
}

function unsubscribe(signal, from) {
	signal._deps.delete(from);

	from._subs.delete(signal); // If nobody listens to the signal we depended on, we can traverse
	// upwards and destroy all subscriptions until we encounter a writable
	// signal or a signal that others listen to as well.

	if (from._subs.size === 0) {
		from._active = false;

		from._deps.forEach(dep => unsubscribe(from, dep));
	}
}

const tmpPending = [];
/**
 * Refresh _just_ this signal and its dependencies recursively.
 * All other signals will be left untouched and added to the
 * global queue to flush later. Since we're traversing "upwards",
 * we don't have to care about topological sorting.
 */

function refreshStale(signal) {
	pending.delete(signal);
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

function activate(signal) {
	signal._active = true;
	refreshStale(signal);
}

function signal(value) {
	return new Signal(value);
}
function computed(compute) {
	const signal = new Signal(undefined);
	signal._readonly = true;

	function updater() {
		let finish = signal._setCurrent();

		try {
			let ret = compute();
			finish(signal._value === ret, true);
			signal._value = ret;
		} catch (err) {
			// Ensure that we log the first error not the last
			if (!commitError) commitError = err;
			finish(true, false);
		}
	}

	signal._updater = updater;
	return signal;
}
function effect(callback) {
	const s = computed(() => batch(callback)); // Set up subscriptions since this is a "reactor" signal

	activate(s);
	return () => s._setCurrent()(true, true);
}
function batch(cb) {
	batchPending++;

	try {
		return cb();
	} finally {
		// Since stale signals are refreshed upwards, we need to
		// add pending signals in reverse
		let item;

		while ((item = tmpPending.pop()) !== undefined) {
			pending.add(item);
		}

		if (--batchPending === 0) {
			sweep(pending);
			pending.clear();
		}
	}
}
export { Signal, batch, computed, effect, signal }; //# sourceMappingURL=signals-core.mjs.map
