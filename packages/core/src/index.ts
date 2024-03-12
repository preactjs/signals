function cycleDetected(): never {
	throw new Error("Cycle detected");
}
function mutationDetected(): never {
	throw new Error("Computed cannot have side-effects");
}

const BRAND_SYMBOL = Symbol.for("preact-signals");

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
	_prevSource?: Node;
	_nextSource?: Node;

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

function untracked<T>(callback: () => T): T {
	const prevContext = evalContext;
	evalContext = undefined;
	try {
		return callback();
	} finally {
		evalContext = prevContext;
	}
}

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

	let node = signal._node;
	if (node === undefined || node._target !== evalContext) {
		/**
		 * `signal` is a new dependency. Create a new dependency node, and set it
		 * as the tail of the current context's dependency list. e.g:
		 *
		 * { A <-> B       }
		 *         ↑     ↑
		 *        tail  node (new)
		 *               ↓
		 * { A <-> B <-> C }
		 *               ↑
		 *              tail (evalContext._sources)
		 */
		node = {
			_version: 0,
			_source: signal,
			_prevSource: evalContext._sources,
			_nextSource: undefined,
			_target: evalContext,
			_prevTarget: undefined,
			_nextTarget: undefined,
			_rollbackNode: node,
		};

		if (evalContext._sources !== undefined) {
			evalContext._sources._nextSource = node;
		}
		evalContext._sources = node;
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

		/**
		 * If `node` is not already the current tail of the dependency list (i.e.
		 * there is a next node in the list), then make the `node` the new tail. e.g:
		 *
		 * { A <-> B <-> C <-> D }
		 *         ↑           ↑
		 *        node   ┌─── tail (evalContext._sources)
		 *         └─────│─────┐
		 *               ↓     ↓
		 * { A <-> C <-> D <-> B }
		 *                     ↑
		 *                    tail (evalContext._sources)
		 */
		if (node._nextSource !== undefined) {
			node._nextSource._prevSource = node._prevSource;

			if (node._prevSource !== undefined) {
				node._prevSource._nextSource = node._nextSource;
			}

			node._prevSource = evalContext._sources;
			node._nextSource = undefined;

			evalContext._sources!._nextSource = node;
			evalContext._sources = node;
		}

		// We can assume that the currently evaluated effect / computed signal is already
		// subscribed to change notifications from `signal` if needed.
		return node;
	}
	return undefined;
}

class Signal<T = any> {
	/**
	 * @internal
	 * Note: Use the `declare` keyword for properties that we explicitly set in
	 * constructors or by modifying prototypes. Otherwise the transpilation phase
	 * will add redundant property assignments for these properties inside the constructors.
	 */
	declare _value: unknown;

	// Explicitly set later with Signal.prototype.brand = ...
	declare brand: typeof BRAND_SYMBOL;

	/**
	 * @internal
	 * Version numbers should always be >= 0, because the special value -1 is used
	 * by Nodes to signify potentially unused but recyclable nodes.
	 */
	_version = 0;

	/** @internal */
	_node?: Node;

	/** @internal */
	_targets?: Node;

	constructor(value?: T) {
		this._value = value;
	}

	/** @internal */
	_refresh(): boolean {
		return true;
	}

	/** @internal */
	_subscribe(node: Node): void {
		if (this._targets !== node && node._prevTarget === undefined) {
			node._nextTarget = this._targets;
			if (this._targets !== undefined) {
				this._targets._prevTarget = node;
			}
			this._targets = node;
		}
	}

	/** @internal */
	_unsubscribe(node: Node): void {
		// Only run the unsubscribe step if the signal has any subscribers to begin with.
		if (this._targets !== undefined) {
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
		}
	}

	subscribe(fn: (value: T) => void): () => void {
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
	}

	valueOf(): T {
		return this.value;
	}

	toString(): string {
		return this.value + "";
	}

	toJSON(): T {
		return this.value;
	}

	peek(): T {
		return this._value as T;
	}

	get value(): T {
		const node = addDependency(this);
		if (node !== undefined) {
			node._version = this._version;
		}
		return this._value as T;
	}

	set value(value: T) {
		if (evalContext instanceof Computed) {
			mutationDetected();
		}

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
	}
}

Signal.prototype.brand = BRAND_SYMBOL;

function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

function needsToRecompute(target: Computed | Effect): boolean {
	// Check the dependencies for changed values. The dependency list is already
	// in order of use. Therefore if multiple dependencies have changed values, only
	// the first used dependency is re-evaluated at this point.
	for (
		let node = target._sources;
		node !== undefined;
		node = node._nextSource
	) {
		// If there's a new version of the dependency before or after refreshing,
		// or the dependency has something blocking it from refreshing at all (e.g. a
		// dependency cycle), then we need to recompute.
		if (
			node._source._version !== node._version ||
			!node._source._refresh() ||
			node._source._version !== node._version
		) {
			return true;
		}
	}
	// If none of the dependencies have changed values since last recompute then
	// there's no need to recompute.
	return false;
}

function prepareSources(target: Computed | Effect) {
	/**
	 * 1. Mark all current sources as re-usable nodes (version: -1)
	 * 2. Set a rollback node if the current node is being used in a different context
	 * 3. Point 'target._sources' to the tail of the doubly-linked list, e.g:
	 *
	 *    { undefined <- A <-> B <-> C -> undefined }
	 *                   ↑           ↑
	 *                   │           └──────┐
	 * target._sources = A; (node is head)  │
	 *                   ↓                  │
	 * target._sources = C; (node is tail) ─┘
	 */
	for (
		let node = target._sources;
		node !== undefined;
		node = node._nextSource
	) {
		const rollbackNode = node._source._node;
		if (rollbackNode !== undefined) {
			node._rollbackNode = rollbackNode;
		}
		node._source._node = node;
		node._version = -1;

		if (node._nextSource === undefined) {
			target._sources = node;
			break;
		}
	}
}

function cleanupSources(target: Computed | Effect) {
	let node = target._sources;
	let head = undefined;

	/**
	 * At this point 'target._sources' points to the tail of the doubly-linked list.
	 * It contains all existing sources + new sources in order of use.
	 * Iterate backwards until we find the head node while dropping old dependencies.
	 */
	while (node !== undefined) {
		const prev = node._prevSource;

		/**
		 * The node was not re-used, unsubscribe from its change notifications and remove itself
		 * from the doubly-linked list. e.g:
		 *
		 * { A <-> B <-> C }
		 *         ↓
		 *    { A <-> C }
		 */
		if (node._version === -1) {
			node._source._unsubscribe(node);

			if (prev !== undefined) {
				prev._nextSource = node._nextSource;
			}
			if (node._nextSource !== undefined) {
				node._nextSource._prevSource = prev;
			}
		} else {
			/**
			 * The new head is the last node seen which wasn't removed/unsubscribed
			 * from the doubly-linked list. e.g:
			 *
			 * { A <-> B <-> C }
			 *   ↑     ↑     ↑
			 *   │     │     └ head = node
			 *   │     └ head = node
			 *   └ head = node
			 */
			head = node;
		}

		node._source._node = node._rollbackNode;
		if (node._rollbackNode !== undefined) {
			node._rollbackNode = undefined;
		}

		node = prev;
	}

	target._sources = head;
}

class Computed<T = any> extends Signal<T> {
	declare _compute: () => T;

	_sources?: Node;
	_globalVersion = globalVersion - 1;
	_flags = OUTDATED;

	constructor(compute: () => T) {
		super(undefined);
		this._compute = compute;
	}

	_refresh(): boolean {
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
	}

	_subscribe(node: Node): void {
		if (this._targets === undefined) {
			this._flags |= OUTDATED | TRACKING;

			// A computed signal subscribes lazily to its dependencies when the it
			// gets its first subscriber.
			for (
				let node = this._sources;
				node !== undefined;
				node = node._nextSource
			) {
				node._source._subscribe(node);
			}
		}
		super._subscribe(node);
	}

	_unsubscribe(node: Node): void {
		// Only run the unsubscribe step if the computed signal has any subscribers.
		if (this._targets !== undefined) {
			super._unsubscribe(node);

			// Computed signal unsubscribes from its dependencies when it loses its last subscriber.
			// This makes it possible for unreferences subgraphs of computed signals to get garbage collected.
			if (this._targets === undefined) {
				this._flags &= ~TRACKING;

				for (
					let node = this._sources;
					node !== undefined;
					node = node._nextSource
				) {
					node._source._unsubscribe(node);
				}
			}
		}
	}

	_notify(): void {
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
	}

	peek(): T {
		if (!this._refresh()) {
			cycleDetected();
		}
		if (this._flags & HAS_ERROR) {
			throw this._value;
		}
		return this._value as T;
	}

	get value(): T {
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
		return this._value as T;
	}
}

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
	for (
		let node = effect._sources;
		node !== undefined;
		node = node._nextSource
	) {
		node._source._unsubscribe(node);
	}
	effect._compute = undefined;
	effect._sources = undefined;

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

type EffectCleanup = () => unknown;

class Effect {
	declare _compute?: () => unknown | EffectCleanup;

	_cleanup?: () => unknown;
	_sources?: Node;
	_nextBatchedEffect?: Effect;
	_flags = TRACKING;

	constructor(compute: () => unknown | EffectCleanup) {
		this._compute = compute;
	}

	_callback(): void {
		const finish = this._start();
		try {
			if (this._flags & DISPOSED) return;
			if (this._compute === undefined) return;

			const cleanup = this._compute();
			if (typeof cleanup === "function") {
				this._cleanup = cleanup as EffectCleanup;
			}
		} finally {
			finish();
		}
	}

	_start(): () => void {
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
	}

	_notify(): void {
		if (!(this._flags & NOTIFIED)) {
			this._flags |= NOTIFIED;
			this._nextBatchedEffect = batchedEffect;
			batchedEffect = this;
		}
	}

	_dispose(): void {
		this._flags |= DISPOSED;

		if (!(this._flags & RUNNING)) {
			disposeEffect(this);
		}
	}
}

function effect(compute: () => unknown | EffectCleanup): () => void {
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

export { signal, computed, effect, batch, Signal, ReadonlySignal, untracked };
