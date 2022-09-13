// The current computed that is running
let currentComputed = null; // A set of listeners which will be triggered after the batch is complete

let batchPending = null;
const processingSignals = new Set();
function batch(f) {
	if (batchPending === null) {
		const listeners = new Set();
		const old = batchPending;
		batchPending = listeners;

		try {
			return f();
		} finally {
			batchPending = old;
			processingSignals.clear(); // Trigger any pending listeners

			listeners.forEach(listener => {
				listener();
			});
		} // We're already inside of an outer batch
	} else {
		return f();
	}
}
class Signal {
	// These property names get minified - see /mangle.json

	/** @internal */
	constructor(value) {
		this._value = void 0;
		this._children = new Set();
		this._value = value;
	}

	toString() {
		return "" + this.value;
	}
	/**
	 * This uses WeakRef in order to avoid memory leaks: if the child is not
	 * used anywhere then it can be garbage collected.
	 *
	 * @internal
	 */

	/**
	 * Recurse down all children, marking them as dirty and adding
	 * listeners to batchPending.
	 *
	 * @internal
	 */
	_wakeup() {
		this._children.forEach(childRef => {
			const child = childRef.deref();

			if (child) {
				child._wakeup(); // If the child has been garbage collected, then remove it from the Set
			} else {
				this._children.delete(childRef);
			}
		});
	}

	peek() {
		return this._value;
	}

	get value() {
		const value = this._value;

		if (currentComputed !== null) {
			// This is used to detect infinite cycles
			if (batchPending !== null) {
				processingSignals.add(this);
			} // If accessing inside of a computed, add this to the computed's parents

			currentComputed._addDependency(this, value);
		}

		return value;
	}

	set value(value) {
		if (
			currentComputed !== null &&
			batchPending !== null &&
			processingSignals.has(this)
		) {
			throw new Error("Cycle detected");
		}

		this._value = value; // If the value is set outside of a batch, this ensures that all of the
		// children will be fully marked as dirty before triggering any listeners

		batch(() => {
			this._wakeup();
		});
	}
}
function signal(value) {
	return new Signal(value);
}

class Computed extends Signal {
	// These property names get minified - see /mangle.json

	/**
	 * Whether this is the first time processing this computed
	 *
	 * @internal
	 */

	/**
	 * Whether any of the computed's parents have changed or not.
	 *
	 * @internal
	 */

	/**
	 * Whether the callback errored or not.
	 *
	 * @internal
	 */

	/**
	 * WeakRefs have their own object identity, so we must reuse
	 * the same WeakRef over and over again
	 *
	 * @internal
	 */

	/**
	 * The parent dependencies for this computed.
	 *
	 * @internal
	 */

	/** @internal */
	constructor(callback) {
		super(undefined);
		this._first = true;
		this._dirty = true;
		this._hasError = false;
		this._weak = new WeakRef(this);
		this._parents = new Map();
		this._callback = void 0;
		this._callback = callback;
	}
	/**
	 * Mark this computed as dirty whenever any of its parents change.
	 *
	 * @internal
	 */

	_wakeup() {
		this._dirty = true;

		super._wakeup();
	}
	/**
	 * This is called when another Signal's .value is accessed inside of
	 * this computed, it adds the Signal as a dependency of this computed.
	 *
	 * @internal
	 */

	_addDependency(parent, value) {
		this._parents.set(parent, value); // This uses a WeakRef to avoid a memory leak

		parent._children.add(this._weak);
	}
	/**
	 * Removes all links between this computed and its dependencies.
	 *
	 * @internal
	 */

	_removeDependencies() {
		this._parents.forEach((_value, parent) => {
			parent._children.delete(this._weak);
		});

		this._parents.clear();
	}

	peek() {
		if (this._dirty) {
			this._dirty = false;

			try {
				let changed = false;

				if (this._first) {
					this._first = false;
					changed = true;
				} else {
					// This checks if at least one of its parents has a different value
					this._parents.forEach((oldValue, parent) => {
						const newValue = parent.peek();

						if (oldValue !== newValue) {
							changed = true;
						}
					});
				}

				if (changed) {
					this._hasError = false; // Because the dependencies might have changed, we first
					// remove all of the old links between this computed and
					// its dependencies.
					//
					// The links will be recreated by the _addDependency method.

					this._removeDependencies();

					const old = currentComputed;
					currentComputed = this;

					try {
						this._value = this._callback();
					} finally {
						currentComputed = old;
					}
				}
			} catch (e) {
				this._hasError = true; // We reuse the _value slot for the error, instead of using a separate property

				this._value = e;
			}
		}

		if (this._hasError) {
			throw this._value;
		} else {
			return this._value;
		}
	}

	get value() {
		const value = this.peek();

		if (currentComputed !== null) {
			// If accessing inside of a computed, add this to the computed's parents
			currentComputed._addDependency(this, value);
		}

		return value;
	}

	set value(v) {
		throw new Error("Computed signals are readonly");
	}
}

function computed(f) {
	return new Computed(f);
}

class Effect extends Computed {
	// These property names get minified - see /mangle.json

	/** @internal */
	constructor(callback) {
		super(callback);
		this._listener = null;
	}
	/** @internal */

	_wakeup() {
		if (batchPending === null) {
			throw new Error("Invalid batchPending");
		}

		if (this._listener !== null) {
			batchPending.add(this._listener);
		}

		super._wakeup();
	}
	/** @internal */

	_listen(callback) {
		let oldValue = this.value;

		const listener = () => {
			const newValue = this.value;

			if (oldValue !== newValue) {
				oldValue = newValue;
				callback(oldValue);
			}
		};

		this._listener = listener;
		callback(oldValue);
		return () => {
			this._listener = null;

			this._removeDependencies();
		};
	}
}

function effect(callback) {
	return new Effect(() => batch(callback))._listen(() => {});
}
export { Signal, batch, computed, effect, signal }; //# sourceMappingURL=signals-core.mjs.map
