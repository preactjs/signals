function addTargetToAllSources(target) {
	for (let node = target._sources; node; node = node.nextSource) {
		subscribe(node.signal, node);
	}
}
function removeTargetFromAllSources(target) {
	for (let node = target._sources; node; node = node.nextSource) {
		unsubscribe(node.signal, node);
	}
}
function rollback(item) {
	for (let rollback = item; rollback; rollback = rollback.next) {
		rollback.signal._depth = rollback.depth;
	}
}
// The current evaluation depth. Sources keep track of their latest evaluation
// ._depth for quickly checking whether they've already been added to the current
// target's dependencies.
let currentDepth = 0;
// A list for rolling back source's ._depth values after a target has been evaluated.
let currentRollback = undefined;
// Currently evaluated computed or effect.
let currentTarget = undefined;
// Effects collected into a batch.
let currentBatch = undefined;
let inBatch = false;
// A global version number for signalss, used for fast-pathing repeated
// computed.peek()/computed.value calls when nothing has changed globally.
let globalVersion = 0;
function subscribe(signal, node) {
	if (!signal._targets && signal._compute) {
		signal._valid = false;
		addTargetToAllSources(signal);
	}
	if (signal._targets) {
		signal._targets.prevTarget = node;
	}
	node.nextTarget = signal._targets;
	node.prevTarget = undefined;
	signal._targets = node;
}
function unsubscribe(signal, node) {
	const prev = node.prevTarget;
	const next = node.nextTarget;
	if (prev) {
		prev.nextTarget = next;
	}
	if (next) {
		next.prevTarget = prev;
	}
	if (node === signal._targets) {
		signal._targets = next;
	}
	node.prevTarget = undefined;
	node.nextTarget = undefined;
	if (!signal._targets && signal._compute) {
		removeTargetFromAllSources(signal);
	}
}
function returnComputed(signal) {
	signal._valid = true;
	signal._globalVersion = globalVersion;
	if (signal._valueIsError) {
		throw signal._value;
	}
	return signal._value;
}
export class Signal {
	constructor(value, compute) {
		/** @internal */
		this._computing = false;
		/** @internal */
		this._valid = false;
		/** @internal */
		this._valueIsError = false;
		/** @internal */
		this._globalVersion = globalVersion - 1;
		/** @internal */
		this._sources = undefined;
		/** @internal */
		this._targets = undefined;
		/** @internal */
		this._depth = 0;
		/** @internal */
		this._version = 0;
		this._value = value;
		this._compute = compute;
		if (!compute) {
			this._invalidate = this._invalidate.bind(this);
		}
	}
	/** @internal */
	_invalidate() {
		if (!this._compute || this._valid) {
			this._valid = false;
			for (let node = this._targets; node; node = node.nextTarget) {
				node.target._invalidate();
			}
		}
	}
	toString() {
		return "" + this.value;
	}
	peek() {
		if (!this._compute) {
			return this._value;
		}
		if (this._computing) {
			throw new Error("cycle detected");
		}
		if (this._globalVersion === globalVersion) {
			return returnComputed(this);
		}
		if (this._targets && this._valid) {
			return returnComputed(this);
		}
		if (this._version > 0) {
			let ok = true;
			for (let node = this._sources; node; node = node.nextSource) {
				node.signal.peek();
				if (node.signal._version !== node.version) {
					ok = false;
					break;
				}
			}
			if (ok) {
				return returnComputed(this);
			}
		}
		let value = undefined;
		let valueIsError = false;
		const prevContext = currentTarget;
		const prevRollback = currentRollback;
		try {
			currentTarget = this;
			currentRollback = undefined;
			currentDepth++;
			removeTargetFromAllSources(this);
			this._computing = true;
			this._sources = undefined;
			value = this._compute();
		} catch (err) {
			valueIsError = true;
			value = err;
		} finally {
			if (this._targets) {
				addTargetToAllSources(this);
			}
			rollback(currentRollback);
			this._computing = false;
			currentDepth--;
			currentTarget = prevContext;
			currentRollback = prevRollback;
		}
		if (valueIsError || this._valueIsError || this._value !== value) {
			this._value = value;
			this._valueIsError = valueIsError;
			this._version++;
		}
		return returnComputed(this);
	}
	get value() {
		let node = undefined;
		if (currentTarget !== undefined && this._depth !== currentDepth) {
			node = { signal: this, target: currentTarget, version: 0 };
			currentRollback = {
				signal: this,
				depth: this._depth,
				next: currentRollback,
			};
			this._depth = currentDepth;
		}
		const value = this.peek();
		if (currentTarget && node) {
			node.nextSource = currentTarget._sources;
			node.version = node.signal._version;
			currentTarget._sources = node;
		}
		return value;
	}
	set value(value) {
		if (this._compute) {
			throw Error("Computed signals are readonly");
		} else if (value !== this._value) {
			this._value = value;
			this._version++;
			globalVersion++;
			batch(this._invalidate);
		}
	}
}
export function signal(value) {
	return new Signal(value, undefined);
}
export function computed(compute) {
	return new Signal(undefined, compute);
}
class Effect {
	constructor(_callback) {
		this._callback = _callback;
		this._sources = undefined;
		this._batched = false;
	}
	_run() {
		const prevContext = currentTarget;
		const prevRollback = currentRollback;
		try {
			currentTarget = this;
			currentRollback = undefined;
			currentDepth++;
			removeTargetFromAllSources(this);
			this._sources = undefined;
			this._callback();
		} finally {
			addTargetToAllSources(this);
			rollback(currentRollback);
			currentDepth--;
			currentTarget = prevContext;
			currentRollback = prevRollback;
		}
	}
	_invalidate() {
		if (!inBatch) {
			this._run();
		} else if (!this._batched) {
			this._batched = true;
			currentBatch = { effect: this, next: currentBatch };
		}
	}
	_dispose() {
		for (let node = this._sources; node; node = node.nextSource) {
			unsubscribe(node.signal, node);
		}
		this._sources = undefined;
	}
}
export function effect(callback) {
	const effect = new Effect(callback);
	effect._run();
	return () => effect._dispose();
}
export function _doNotUseOrYouWillBeFired_notify(signal, callback) {
	const cb = () => callback(signal);
	const notify = new Effect(cb);
	const node = { signal: signal, target: notify, version: 0 };
	notify._run = cb;
	notify._sources = node;
	subscribe(signal, node);
	return () => notify._dispose();
}
export function batch(callback) {
	if (inBatch) {
		return callback();
	}
	inBatch = true;
	try {
		return callback();
	} finally {
		inBatch = false;
		const batch = currentBatch;
		currentBatch = undefined;
		for (let item = batch; item; item = item.next) {
			const runnable = item.effect;
			runnable._batched = false;
			runnable._run();
		}
	}
}
