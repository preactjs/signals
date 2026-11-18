export interface DomBinding {
	readonly id: number;
	readonly effect: object;
	readonly signal: object;
	readonly target: Node;
	readonly kind: "text" | "property";
	readonly property?: string;
	/** Actual direct DOM writes, not component renders or signal notifications. */
	readonly updates: number;
}

export interface DomBindingSource {
	getSnapshot(maxBindings?: number): {
		bindings: DomBinding[];
		truncated: boolean;
	};
	/** Coalesced invalidation. Read getSnapshot() for initial discovery/replay. */
	subscribe(callback: () => void): () => void;
	dispose(): void;
}

export interface BindingHandle {
	set(signal: object, target: Node): void;
	wrote(): void;
	dispose(): void;
}

let active: ReturnType<typeof createRegistry> | undefined;
const sources = new WeakMap<object, object>();

/** Internal: preserve the original signal behind SignalValue's getter facade. */
export function rememberBindingSignal(facade: object, signal: object) {
	if (active) sources.set(facade, signal);
}
export function originalBindingSignal(facade: object) {
	return sources.get(facade);
}
export function isBindingTrackingEnabled() {
	return active !== undefined;
}
export function trackDomBinding(
	effect: object,
	signal: object,
	target: Node,
	kind: DomBinding["kind"],
	property?: string
): BindingHandle | undefined {
	return active?.attach(effect, signal, target, kind, property);
}

function createRegistry() {
	const bindings = new Map<number, DomBinding>();
	const listeners = new Set<() => void>();
	let nextId = 0;
	let scheduled = false;
	let disposed = false;
	function changed() {
		if (scheduled || listeners.size === 0 || disposed) return;
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			if (disposed) return;
			for (const callback of Array.from(listeners)) {
				if (!listeners.has(callback)) continue;
				try {
					callback();
				} catch (error) {
					// eslint-disable-next-line no-console
					console.error("[signals] DOM binding observer failed", error);
				}
			}
		});
	}
	function dispose() {
		disposed = true;
		bindings.clear();
		listeners.clear();
		if (active?.dispose === dispose) active = undefined;
	}
	return {
		attach(
			effect: object,
			signal: object,
			target: Node,
			kind: DomBinding["kind"],
			property?: string
		): BindingHandle {
			const id = ++nextId;
			bindings.set(
				id,
				Object.freeze({
					id,
					effect,
					signal,
					target,
					kind,
					property,
					updates: 0,
				})
			);
			changed();
			return {
				set(signal, target) {
					const prev = bindings.get(id);
					if (!prev || (prev.signal === signal && prev.target === target))
						return;
					bindings.set(id, Object.freeze({ ...prev, signal, target }));
					changed();
				},
				wrote() {
					const prev = bindings.get(id);
					if (!prev) return;
					bindings.set(
						id,
						Object.freeze({ ...prev, updates: prev.updates + 1 })
					);
					changed();
				},
				dispose() {
					if (bindings.delete(id)) changed();
				},
			};
		},
		getSnapshot(maxBindings = 1000) {
			if (
				!Number.isInteger(maxBindings) ||
				maxBindings < 0 ||
				maxBindings > 10000
			)
				throw new RangeError("maxBindings must be 0–10000");
			const out: DomBinding[] = [];
			for (const binding of bindings.values()) {
				if (out.length === maxBindings) break;
				out.push(binding);
			}
			return { bindings: out, truncated: out.length < bindings.size };
		},
		subscribe(callback: () => void) {
			if (disposed) throw new Error("DOM binding tracking is disposed");
			// Independent registrations, including duplicate callbacks.
			const listener = () => callback();
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		dispose,
	};
}

/**
 * Experimental in-page metadata hook. Enable BEFORE creating/rendering app VNodes.
 * One tracking owner, multiple subscribers; dispose releases all registry refs.
 * This does not enable signals-debug, read values, or add reactive subscriptions.
 */
export function unstable_startDomBindingTracking(): DomBindingSource {
	if (active) throw new Error("DOM binding tracking is already enabled");
	active = createRegistry();
	return active;
}
