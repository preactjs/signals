/** This tracks subscriptions of signals read inside a computed */
let currentSignal;
const pending = new Set();
const effects = new Set();
/** Batch calls can be nested. 0 means that there is no batching */

let batchPending = 0;
let oldDeps = new Map();
class Signal {
	// These property names get minified - see /mangle.json

	/** @internal Internal, do not use. */

	/** @internal Internal, do not use. */

	/** @internal Internal, do not use. */

	/** @internal Internal, do not use. */

	/** @internal Internal, do not use. */

	/** @internal Determine if a computed is allowed to write or not */

	/** @internal Determine if reads should eagerly activate value */

	/** @internal Used to detect if there is a cycle in the graph */
	constructor(value) {
		this._subs = new Set();
		this._deps = new Map();
		this._version = 0;
		this._dirty = false;
		this._value = void 0;
		this._readonly = false;
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

		currentSignal._deps.set(this, this._version);

		oldDeps.delete(this);
		return this._value;
	}

	set value(value) {
		if (this._readonly) {
			throw Error("Computed signals are readonly");
		}

		if (this._value !== value) {
			this._version++;
			this._value = value;
			let isFirst = pending.size === 0;
			pending.add(this); // in batch mode this signal may be marked already

			if (!this._dirty) {
				mark(this);
			} // this is the first change, not a computed and we are not
			// in batch mode:

			if (isFirst && batchPending === 0) {
				try {
					effects.forEach(signal => activate(signal));
				} finally {
					pending.forEach(signal => (signal._dirty = false));
					pending.clear();
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
		this._deps = new Map();
		return (shouldUnmark, shouldCleanup) => {
			// Any leftover dependencies here are not needed anymore
			if (shouldCleanup) {
				// Unsubscribe from dependencies that were not accessed:
				oldDeps.forEach((_, dep) => unsubscribe(this, dep));
			} else {
				// Re-subscribe to dependencies that not accessed:
				oldDeps.forEach((_, dep) => subscribe(this, dep));
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
	if (!signal._dirty) {
		signal._dirty = true;

		if (signal._subs.size === 0) {
			effects.add(signal);
		} else {
			signal._subs.forEach(mark);
		}
	}
}

function subscribe(signal, to) {
	signal._active = true;

	signal._deps.set(to, to._version);

	to._subs.add(signal);
}

function unsubscribe(signal, from) {
	signal._deps.delete(from);

	from._subs.delete(signal); // If nobody listens to the signal we depended on, we can traverse
	// upwards and destroy all subscriptions until we encounter a writable
	// signal or a signal that others listen to as well.

	if (from._subs.size === 0) {
		from._active = false;

		from._deps.forEach((_, dep) => unsubscribe(from, dep));
	}
}
/**
 * Refresh _just_ this signal and its dependencies recursively.
 * All other signals will be left untouched and added to the
 * global queue to flush later. Since we're traversing "upwards",
 * we don't have to care about topological sorting.
 */

function refreshStale(signal) {
	const first = signal._deps.size === 0;
	let shouldUpdate = false;

	if (signal._dirty) {
		signal._deps.forEach((version, dep) => {
			if (dep._dirty) {
				refreshStale(dep);
			}

			if (dep._version !== version) {
				shouldUpdate = true;

				signal._deps.set(dep, dep._version);
			}
		});
	}

	effects.delete(signal);
	signal._dirty = false;

	if (first || shouldUpdate) {
		signal._updater();
	}
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
			if (signal._isComputing) {
				throw new Error("Cycle detected");
			}

			signal._isComputing = true;
			let ret = compute();
			const stale = signal._value === ret;
			if (!stale) signal._version++;
			finish(stale, true);
			signal._value = ret;
		} finally {
			signal._isComputing = false;
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
		if (--batchPending === 0) {
			try {
				effects.forEach(signal => activate(signal));
			} finally {
				pending.forEach(signal => (signal._dirty = false));
				pending.clear();
			}
		}
	}
}
export { Signal, batch, computed, effect, signal }; //# sourceMappingURL=signals-core.mjs.map
