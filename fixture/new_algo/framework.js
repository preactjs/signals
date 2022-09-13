/** This tracks subscriptions of signals read inside a computed */
let currentSignal;
let globalVersion = 1;
let effects = [];
/** Batch calls can be nested. 0 means that there is no batching */

let batchPending = 0;
let oldDeps = [];
class Signal {
	// These property names get minified - see /mangle.json

	/** @internal Internal, do not use. */

	/** @internal Internal, do not use. */
	// _deps = new Map<Signal, number>();

	/** @internal Internal, do not use. */

	/** @internal Internal, do not use. */

	/** @internal Internal, do not use. */

	/** @internal Determine if a computed is allowed to write or not */

	/** @internal Determine if reads should eagerly activate value */

	/** @internal Determine if this is a computed signal */

	/** @internal Determine if this is a computed signal */
	constructor(value) {
		this._subs = new Set();
		this._deps = [];
		this._depVersions = [];
		this._version = 0;
		this._globalVersion = globalVersion - 1;
		this._value = void 0;
		this._readonly = false;
		this._isComputing = false;
		this._computed = false;
		this._effectSubsCount = 0;
		this._value = value;
	}

	toString() {
		return "" + this.value;
	}

	peek() {
		if (this._computed) {
			activate(this, true);
		}

		return this._value;
	}

	get value() {
		if (globalVersion === this._globalVersion) {
			return this._value;
		}

		if (this._computed) {
			activate(this, true);
		} // If we read a signal outside of a computed we have no way
		// to unsubscribe from that. So we assume that the user wants
		// to get the value immediately like for testing.

		if (!currentSignal) {
			return this._value;
		} // subscribe the current computed to this signal:

		this._subs.add(currentSignal); // update the current computed's dependencies:

		currentSignal._deps.push(this);

		currentSignal._depVersions.push(this._version);

		const idx = oldDeps.indexOf(this);
		if (idx > -1) oldDeps.splice(idx, 1);
		return this._value;
	}

	set value(value) {
		if (this._readonly) {
			throw Error("Computed signals are readonly");
		}

		if (this._value !== value) {
			this._version++;
			this._value = value;
			let isFirst = this._effectSubsCount === 0;
			this._effectSubsCount = 0;
			mark(this, this); // this is the first change, not a computed and we are not
			// in batch mode:

			if (isFirst && batchPending === 0) {
				for (let i = 0; i < effects.length; i++) {
					activate(effects[i], false);
				}

				effects = [];
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
		this._deps = [];
		this._depVersions = [];
		return (shouldUnmark, shouldCleanup) => {
			// Any leftover dependencies here are not needed anymore
			if (shouldCleanup) {
				// Unsubscribe from dependencies that were not accessed:
				oldDeps.forEach(dep => unsubscribe(this, dep));
			} else {
				// Re-subscribe to dependencies that not accessed:
				oldDeps.forEach(dep => subscribe(this, dep));
			}

			oldDeps = [];
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

function mark(signal, root) {
	if (signal._subs.size === 0) {
		root._effectSubsCount++;
		effects.push(signal);
	} else {
		signal._subs.forEach(mark);
	}
}

function subscribe(signal, to) {
	signal._deps.push(to);

	signal._depVersions.push(to._version);

	to._subs.add(signal);
}

function unsubscribe(signal, from) {
	const idx = signal._deps.indexOf(from);

	if (idx > -1) {
		signal._deps.splice(idx, 1);

		signal._depVersions.splice(idx, 1);
	}

	from._subs.delete(signal); // If nobody listens to the signal we depended on, we can traverse
	// upwards and destroy all subscriptions until we encounter a writable
	// signal or a signal that others listen to as well.

	if (from._subs.size === 0) {
		from._deps.forEach(dep => unsubscribe(from, dep));

		from._deps = [];
	}
}
/**
 * Refresh _just_ this signal and its dependencies recursively.
 * All other signals will be left untouched and added to the
 * global queue to flush later. Since we're traversing "upwards",
 * we don't have to care about topological sorting.
 */

function activate(signal, stopAtDeps) {
	const first = signal._deps.length === 0;
	let shouldUpdate = false;

	if (!first) {
		for (let i = 0; i < signal._deps.length; i++) {
			const dep = signal._deps[i];
			const version = signal._depVersions[i];

			if (!stopAtDeps && dep._computed) {
				activate(dep, stopAtDeps);
			}

			if (dep._version !== version) {
				shouldUpdate = true;
				signal._depVersions[i] = dep._version;
			}
		}
	}

	if (first || shouldUpdate) {
		signal._updater();
	}
}

function signal(value) {
	return new Signal(value);
}
function computed(compute) {
	const signal = new Signal(undefined);
	signal._readonly = true;
	signal._computed = true;

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

	activate(s, true);
	return () => s._setCurrent()(true, true);
}
function batch(cb) {
	batchPending++;

	try {
		return cb();
	} finally {
		if (--batchPending === 0) {
			for (let i = 0; i < effects.length; i++) {
				activate(effects[i], false);
			}

			effects = [];
		}
	}
}
export { Signal, batch, computed, effect, signal }; //# sourceMappingURL=signals-core.mjs.map
