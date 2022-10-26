function cycleDetected(): never {
	throw new Error("Cycle detected");
}

// Flags for Computed and Effect.
const RUNNING = 1 << 0;
const NOTIFIED = 1 << 1;
const OUTDATED = 1 << 2;
const DISPOSED = 1 << 3;
const HAS_ERROR = 1 << 4;
const TRACKING = 1 << 5;

// A linked list node used to track dependencies (sources) and dependents (targets).
// Also used to remember the source's last version number that the target saw.
type Node = {
	// A source whose value the target depends on.
	_source: Signal;

	// A target that depends on the source and should be notified when the source changes.
	_target: Computed | Effect;
	_prevTarget?: Node;
	_nextTarget?: Node;

	// The version number of the source that target has last seen. We use version numbers
	// instead of storing the source value, because source values can take arbitrary amount
	// of memory, and computeds could hang on to them forever because they're lazily evaluated.
	// Use the special value -1 to mark potentially unused but recyclable nodes.
	_version: number;

	// Used to remember & roll back the source's previous `._node` value when entering &
	// exiting a new evaluation context.
	_rollbackNode?: Node;
};

function startBatch() {
	batchDepth++;
}

function endBatch() {
	if (batchDepth > 1) {
		batchDepth--;
		return;
	}

	let error: unknown;
	let hasError = false;

	while (batchedEffect !== undefined) {
		let effect: Effect | undefined = batchedEffect;
		batchedEffect = undefined;

		batchIteration++;

		while (effect !== undefined) {
			const next: Effect | undefined = effect._nextBatchedEffect;
			effect._nextBatchedEffect = undefined;
			effect._flags &= ~NOTIFIED;

			if (!(effect._flags & DISPOSED) && needsToRecompute(effect)) {
				try {
					effect._callback();
				} catch (err) {
					if (!hasError) {
						error = err;
						hasError = true;
					}
				}
			}
			effect = next;
		}
	}
	batchIteration = 0;
	batchDepth--;

	if (hasError) {
		throw error;
	}
}

function batch<T>(callback: () => T): T {
	if (batchDepth > 0) {
		return callback();
	}
	/*@__INLINE__**/ startBatch();
	try {
		return callback();
	} finally {
		endBatch();
	}
}

// Currently evaluated computed or effect.
let evalContext: Computed | Effect | undefined = undefined;

// Effects collected into a batch.
let batchedEffect: Effect | undefined = undefined;
let batchDepth = 0;
let batchIteration = 0;

// A global version number for signals, used for fast-pathing repeated
// computed.peek()/computed.value calls when nothing has changed globally.
let globalVersion = 0;

function addDependency(signal: Signal): Node | undefined {
	if (evalContext === undefined) {
		return undefined;
	}

	/**
	 * Assume original sources: [A, B, C]
	 * Case 1:
	 * - If prevNode is undefined, then there are more sources than before:
	 *   [A, B, C    ]
	 *             ^ index points here (sources.length: 3, index: 3), we do:
	 *   [A, B, C, node]
	 *
	 * Case 2:
	 * - If prevNode is a node, and it isn't this 'node',
	 *   we push it at the end of the array and replace the slot:
	 *   [A, B, C]
	 *       ^ index points here, and 'node' is not 'B', we do:
	 *   [A, node, C, B]
	 *             ^ next index is moved +1
	 *              'B' is scheduled for clean up
	 *
	 * Case 3: Best case scenario!
	 * - If prevNode is the same as this node, do nothing!
	 *   and just move the 'index' pointer to the next slot.
	 */

	let node = signal._node;
	if (node === undefined || node._target !== evalContext) {
		// `signal` is a new dependency. Create a new node dependency node, move it
		//  to the front of the current context's dependency list.
		node = {
			_version: 0,
			_source: signal,
			_target: evalContext,
			_prevTarget: undefined,
			_nextTarget: undefined,
			_rollbackNode: node,
		};

		const index = evalContext._index;
		const sources = evalContext._sources;
		const prevNode = sources.length > index ? sources[index] : undefined;

		sources[evalContext._index++] = node;

		if (prevNode) {
			sources[sources.length] = prevNode;
		}

		signal._node = node;

		// Subscribe to change notifications from this dependency if we're in an effect
		// OR evaluating a computed signal that in turn has subscribers.
		if (evalContext._flags & TRACKING) {
			signal._subscribe(node);
		}
		return node;
	} else if (node._version === -1) {
		// `signal` is an existing dependency from a previous evaluation. Reuse it.
		node._version = 0;

		const index = evalContext._index;
		const sources = evalContext._sources;
		const prevNode = sources.length > index ? sources[index] : undefined;

		if (prevNode === undefined) {
			sources[index] = node;
		} else if (prevNode !== node) {
			sources[index] = node;
			sources[sources.length] = prevNode;
		}

		evalContext._index += 1;

		// We can assume that the currently evaluated effect / computed signal is already
		// subscribed to change notifications from `signal` if needed.
		return node;
	}
	return undefined;
}

declare class Signal<T = any> {
	/** @internal */
	_value: unknown;

	/**
	 * @internal
	 * Version numbers should always be >= 0, because the special value -1 is used
	 * by Nodes to signify potentially unused but recyclable notes.
	 */
	_version: number;

	/** @internal */
	_node?: Node;

	/** @internal */
	_targets?: Node;

	constructor(value?: T);

	/** @internal */
	_refresh(): boolean;

	/** @internal */
	_subscribe(node: Node): void;

	/** @internal */
	_unsubscribe(node: Node): void;

	subscribe(fn: (value: T) => void): () => void;

	valueOf(): T;

	toString(): string;

	peek(): T;

	get value(): T;
	set value(value: T);
}

/** @internal */
function Signal(this: Signal, value?: unknown) {
	this._value = value;
	this._version = 0;
	this._node = undefined;
	this._targets = undefined;
}

Signal.prototype._refresh = function () {
	return true;
};

Signal.prototype._subscribe = function (node) {
	if (this._targets !== node && node._prevTarget === undefined) {
		node._nextTarget = this._targets;
		if (this._targets !== undefined) {
			this._targets._prevTarget = node;
		}
		this._targets = node;
	}
};

Signal.prototype._unsubscribe = function (node) {
	const prev = node._prevTarget;
	const next = node._nextTarget;
	if (prev !== undefined) {
		prev._nextTarget = next;
		node._prevTarget = undefined;
	}
	if (next !== undefined) {
		next._prevTarget = prev;
		node._nextTarget = undefined;
	}
	if (node === this._targets) {
		this._targets = next;
	}
};

Signal.prototype.subscribe = function (fn) {
	const signal = this;
	return effect(function (this: Effect) {
		const value = signal.value;
		const flag = this._flags & TRACKING;
		this._flags &= ~TRACKING;
		try {
			fn(value);
		} finally {
			this._flags |= flag;
		}
	});
};

Signal.prototype.valueOf = function () {
	return this.value;
};

Signal.prototype.toString = function () {
	return this.value + "";
};

Signal.prototype.peek = function () {
	return this._value;
};

Object.defineProperty(Signal.prototype, "value", {
	get(this: Signal) {
		const node = addDependency(this);
		if (node !== undefined) {
			node._version = this._version;
		}
		return this._value;
	},
	set(this: Signal, value) {
		if (value !== this._value) {
			if (batchIteration > 100) {
				cycleDetected();
			}

			this._value = value;
			this._version++;
			globalVersion++;

			/**@__INLINE__*/ startBatch();
			try {
				for (
					let node = this._targets;
					node !== undefined;
					node = node._nextTarget
				) {
					node._target._notify();
				}
			} finally {
				endBatch();
			}
		}
	},
});

function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

function needsToRecompute(target: Computed | Effect): boolean {
	// Check the dependencies for changed values. The dependency list is already
	// in order of use. Therefore if multiple dependencies have changed values, only
	// the first used dependency is re-evaluated at this point.
	const size = target._sources.length;

	for (let i = 0; i < size; i++) {
		const node = target._sources[i]!;
		const source = node._source;
		// If there's a new version of the dependency before or after refreshing,
		// or the dependency has something blocking it from refreshing at all (e.g. a
		// dependency cycle), then we need to recompute.
		if (
			source._version !== node._version ||
			!source._refresh() ||
			source._version !== node._version
		) {
			return true;
		}
	}
	// If none of the dependencies have changed values since last recompute then the
	// there's no need to recompute.
	return false;
}

function prepareSources(target: Computed | Effect) {
	const size = target._sources.length;

	for (let i = 0; i < size; i++) {
		const node = target._sources[i]!;
		const back = node._source._node;

		if (back !== undefined) node._rollbackNode = back;

		node._source._node = node;
		node._version = -1;
	}

	/**
	 * If there are previous sources, e.g: [A, B, C]
	 *                                      ^ Index is here at 0
	 * As new deps/sources are added, we'll move or keep the current node at index,
	 * If sources are unchanged, the resulting array's items won't have changed,
	 * and the index will be equal to the array's sources length.
	 */
	target._index = 0;
}

function cleanupSources(target: Computed | Effect) {
	const size = target._sources.length;
	const stop = target._index;

	/**
	 * Case 1: Best case scenario - source are the same as before. Example:
	 *
	 * Prev. sources: [A, B, C, D]
	 * Next. sources: [A, B, C, D]...] (unchanged)
	 *                             ↓
	 *                          _index is length of array (no nodes to clean up)
	 *
	 * We only need to rollback to the previous node.
	 */
	for (let i = 0; i < stop; i++) {
		const node = target._sources[i]!;
		node._source._node = node._rollbackNode;
	}
	/**
	 * Case 2: Worst case, example:
	 *
	 * Prev. sources: [A, B, C, D]
	 * Next. sources: [A, B, E, F, G, D, C]
	 *                       │  │  │  ↓
	 *                       │  │  ↓  _index is here [D, C] are unused sources
	 *                       │  ↓  3) G replaced prev node C, C moved to end of array -> [A, B, E, F, G, D, C]
	 *                       ↓  2) F replaced prev node D, D pushed to end of array -> [A, B, E, F, C, D]
	 *                      1) E replaced prev node C, C moved to end of array -> [A, B, E, D, C]
	 *
	 * Unsubscribe from nodes [D, C]
	 */
	for (let i = stop; i < size; i++) {
		const node = target._sources[i]!;
		node._source._node = node._rollbackNode;
		node._source._unsubscribe(node);
	}

	/**
	 * Shrink the length to get rid of old dependencies which were pushed at the end of the array.
	 *
	 * Note: Setting '_sources.length = target._index' is 2x slower (at least in V8) when 'length === target._index'
	 * That's why we first check if the length should change or not.
	 */
	if (size !== target._index) {
		/**
		 * The JS engine has a backing store with a capacity, when the array grows, the capacity is increased in amortized constant time
		 * following this formula:
		 *
		 *           (old_capacity + 50%) + 16
		 *
		 * @see https://github.com/nodejs/node/blob/37b8a603f886634416046e337936e4c586f4ff58/deps/v8/src/objects/js-objects.h#L579-L583
		 * This means growing the array doesn't allocate new capacity for every item, and most of the time, the new capacity is enough
		 * to hold all new items. For example, if array has 2 items (capacity 2) and we add a new element, its new capacity will be 19.
		 * This gives room to add up to 19 items without allocating more capacity.
		 *
		 * Setting the length to lower than allocated capacity is fine. If the new length is at least 50% of the original capacity (in V8),
		 * then it won't shrink the capacity (small array's capacity won't shrink either).
		 * @see https://github.com/nodejs/node/blob/1930fcd7efaa837f50aef60db78aa735a65f007c/deps/v8/src/objects/elements.cc#L792-L795
		 *
		 * In other words, the capacity is the internal allocated space and the 'length' represents the _used_ capacity.
		 *
		 * This is why we re-use the same array rather than allocating a new array, because we want to take advantage of already
		 * allocated capacity. This improves performance on conditionals such as:
		 *
		 * ```js
		 * const c = computed(() => {
		 *    const cond = a.value;
		 *
		 *    if (cond === true) {
		 *      b.value;
		 *    } else {
		 *      c.value;
		 *      d.value;
		 *    }
		 * })
		 * ```
		 * In this particular example, the first time the sources are added, the array will already have enough allocated capacity to
		 * store new sources when the 'cond' becomes 'false' and the capacity will remain the same after it becomes 'true' again
		 * even though the length has changed.
		 */
		target._sources.length = target._index;
	}
}

declare class Computed<T = any> extends Signal<T> {
	_compute: () => T;
	_sources: Node[];
	_index: number;
	_globalVersion: number;
	_flags: number;

	constructor(compute: () => T);

	_notify(): void;
	get value(): T;
}

function Computed(this: Computed, compute: () => unknown) {
	Signal.call(this, undefined);

	this._compute = compute;
	this._sources = [];
	this._index = 0;
	this._globalVersion = globalVersion - 1;
	this._flags = OUTDATED;
}

Computed.prototype = new Signal() as Computed;

Computed.prototype._refresh = function () {
	this._flags &= ~NOTIFIED;

	if (this._flags & RUNNING) {
		return false;
	}

	// If this computed signal has subscribed to updates from its dependencies
	// (TRACKING flag set) and none of them have notified about changes (OUTDATED
	// flag not set), then the computed value can't have changed.
	if ((this._flags & (OUTDATED | TRACKING)) === TRACKING) {
		return true;
	}
	this._flags &= ~OUTDATED;

	if (this._globalVersion === globalVersion) {
		return true;
	}
	this._globalVersion = globalVersion;

	// Mark this computed signal running before checking the dependencies for value
	// changes, so that the RUNNING flag can be used to notice cyclical dependencies.
	this._flags |= RUNNING;
	if (this._version > 0 && !needsToRecompute(this)) {
		this._flags &= ~RUNNING;
		return true;
	}

	const prevContext = evalContext;
	try {
		prepareSources(this);
		evalContext = this;
		const value = this._compute();
		if (
			this._flags & HAS_ERROR ||
			this._value !== value ||
			this._version === 0
		) {
			this._value = value;
			this._flags &= ~HAS_ERROR;
			this._version++;
		}
	} catch (err) {
		this._value = err;
		this._flags |= HAS_ERROR;
		this._version++;
	}
	evalContext = prevContext;
	cleanupSources(this);
	this._flags &= ~RUNNING;
	return true;
};

Computed.prototype._subscribe = function (node) {
	if (this._targets === undefined) {
		const size = this._sources.length;

		this._flags |= OUTDATED | TRACKING;

		// A computed signal subscribes lazily to its dependencies when the it
		// gets its first subscriber.
		for (let i = 0; i < size; i++) {
			const node = this._sources[i]!;
			node._source._subscribe(node);
		}
	}
	Signal.prototype._subscribe.call(this, node);
};

Computed.prototype._unsubscribe = function (node) {
	Signal.prototype._unsubscribe.call(this, node);

	// Computed signal unsubscribes from its dependencies from it loses its last subscriber.
	if (this._targets === undefined) {
		const size = this._sources.length;
		this._flags &= ~TRACKING;

		for (let i = 0; i < size; i++) {
			const node = this._sources[i]!;
			node._source._unsubscribe(node);
		}
	}
};

Computed.prototype._notify = function () {
	if (!(this._flags & NOTIFIED)) {
		this._flags |= OUTDATED | NOTIFIED;

		for (
			let node = this._targets;
			node !== undefined;
			node = node._nextTarget
		) {
			node._target._notify();
		}
	}
};

Computed.prototype.peek = function () {
	if (!this._refresh()) {
		cycleDetected();
	}
	if (this._flags & HAS_ERROR) {
		throw this._value;
	}
	return this._value;
};

Object.defineProperty(Computed.prototype, "value", {
	get(this: Computed) {
		if (this._flags & RUNNING) {
			cycleDetected();
		}
		const node = addDependency(this);
		this._refresh();
		if (node !== undefined) {
			node._version = this._version;
		}
		if (this._flags & HAS_ERROR) {
			throw this._value;
		}
		return this._value;
	},
});

interface ReadonlySignal<T = any> extends Signal<T> {
	readonly value: T;
}

function computed<T>(compute: () => T): ReadonlySignal<T> {
	return new Computed(compute);
}

function cleanupEffect(effect: Effect) {
	const cleanup = effect._cleanup;
	effect._cleanup = undefined;

	if (typeof cleanup === "function") {
		/*@__INLINE__**/ startBatch();

		// Run cleanup functions always outside of any context.
		const prevContext = evalContext;
		evalContext = undefined;
		try {
			cleanup();
		} catch (err) {
			effect._flags &= ~RUNNING;
			effect._flags |= DISPOSED;
			disposeEffect(effect);
			throw err;
		} finally {
			evalContext = prevContext;
			endBatch();
		}
	}
}

function disposeEffect(effect: Effect) {
	const size = effect._sources.length;

	for (let i = 0; i < size; i++) {
		const node = effect._sources[i]!;
		node._source._unsubscribe(node);
	}

	effect._compute = undefined;
	effect._sources.length = 0;

	cleanupEffect(effect);
}

function endEffect(this: Effect, prevContext?: Computed | Effect) {
	if (evalContext !== this) {
		throw new Error("Out-of-order effect");
	}
	cleanupSources(this);
	evalContext = prevContext;

	this._flags &= ~RUNNING;
	if (this._flags & DISPOSED) {
		disposeEffect(this);
	}
	endBatch();
}

declare class Effect {
	_compute?: () => unknown;
	_cleanup?: unknown;
	_sources: Node[];
	_sourcesCleanup?: Node;
	_index: number;
	_nextBatchedEffect?: Effect;
	_flags: number;

	constructor(compute: () => void);

	_callback(): void;
	_start(): () => void;
	_notify(): void;
	_dispose(): void;
}

function Effect(this: Effect, compute: () => void) {
	this._compute = compute;
	this._cleanup = undefined;
	this._sources = [];
	this._index = 0;
	this._nextBatchedEffect = undefined;
	this._flags = TRACKING;
}

Effect.prototype._callback = function () {
	const finish = this._start();
	try {
		if (!(this._flags & DISPOSED) && this._compute !== undefined) {
			this._cleanup = this._compute();
		}
	} finally {
		finish();
	}
};

Effect.prototype._start = function () {
	if (this._flags & RUNNING) {
		cycleDetected();
	}
	this._flags |= RUNNING;
	this._flags &= ~DISPOSED;
	cleanupEffect(this);
	prepareSources(this);

	/*@__INLINE__**/ startBatch();
	const prevContext = evalContext;
	evalContext = this;
	return endEffect.bind(this, prevContext);
};

Effect.prototype._notify = function () {
	if (!(this._flags & NOTIFIED)) {
		this._flags |= NOTIFIED;
		this._nextBatchedEffect = batchedEffect;
		batchedEffect = this;
	}
};

Effect.prototype._dispose = function () {
	this._flags |= DISPOSED;

	if (!(this._flags & RUNNING)) {
		disposeEffect(this);
	}
};

function effect(compute: () => unknown): () => void {
	const effect = new Effect(compute);
	try {
		effect._callback();
	} catch (err) {
		effect._dispose();
		throw err;
	}
	// Return a bound function instead of a wrapper like `() => effect._dispose()`,
	// because bound functions seem to be just as fast and take up a lot less memory.
	return effect._dispose.bind(effect);
}

export { signal, computed, effect, batch, Signal, type ReadonlySignal };
