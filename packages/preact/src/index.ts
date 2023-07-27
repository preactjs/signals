import { options, Component, isValidElement } from "preact";
import { useRef, useMemo, useEffect } from "preact/hooks";
import {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
	untracked,
} from "@preact/signals-core";
import {
	VNode,
	OptionsTypes,
	HookFn,
	Effect,
	PropertyUpdater,
	AugmentedComponent,
	AugmentedElement as Element,
} from "./internal";

export {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
	untracked,
};

const HAS_PENDING_UPDATE = 1 << 0;
const HAS_HOOK_STATE = 1 << 1;
const HAS_COMPUTEDS = 1 << 2;

// Install a Preact options hook
function hook<T extends OptionsTypes>(hookName: T, hookFn: HookFn<T>) {
	// @ts-ignore-next-line private options hooks usage
	options[hookName] = hookFn.bind(null, options[hookName] || (() => {}));
}

let currentComponent: AugmentedComponent | undefined;
let finishUpdate: (() => void) | undefined;

function setCurrentUpdater(updater?: Effect) {
	// end tracking for the current update:
	if (finishUpdate) finishUpdate();
	// start tracking the new update:
	finishUpdate = updater && updater._start();
}

function createUpdater(update: () => void) {
	let updater!: Effect;
	effect(function (this: Effect) {
		updater = this;
	});
	updater._callback = update;
	return updater;
}

/** @todo This may be needed for complex prop value detection. */
// function isSignalValue(value: any): value is Signal {
// 	if (typeof value !== "object" || value == null) return false;
// 	if (value instanceof Signal) return true;
// 	// @TODO: uncomment this when we land Reactive (ideally behind a brand check)
// 	// for (let i in value) if (value[i] instanceof Signal) return true;
// 	return false;
// }

/**
 * A wrapper component that renders a Signal directly as a Text node.
 * @todo: in Preact 11, just decorate Signal with `type:null`
 */
function SignalValue(this: AugmentedComponent, { data }: { data: Signal }) {
	// hasComputeds.add(this);

	// Store the props.data signal in another signal so that
	// passing a new signal reference re-runs the text computed:
	const currentSignal = useSignal(data);
	currentSignal.value = data;

	const s = useMemo(() => {
		// mark the parent component as having computeds so it gets optimized
		let v = this.__v;
		while ((v = v.__!)) {
			if (v.__c) {
				v.__c._updateFlags |= HAS_COMPUTEDS;
				break;
			}
		}

		this._updater!._callback = () => {
			if (isValidElement(s.peek()) || this.base?.nodeType !== 3) {
				this._updateFlags |= HAS_PENDING_UPDATE;
				this.setState({});
				return;
			}

			(this.base as Text).data = s.peek();
		};

		return computed(() => {
			let data = currentSignal.value;
			let s = data.value;
			return s === 0 ? 0 : s === true ? "" : s || "";
		});
	}, []);

	return s.value;
}
SignalValue.displayName = "_st";

Object.defineProperties(Signal.prototype, {
	constructor: { configurable: true, value: undefined },
	type: { configurable: true, value: SignalValue },
	props: {
		configurable: true,
		get() {
			return { data: this };
		},
	},
	// Setting a VNode's _depth to 1 forces Preact to clone it before modifying:
	// https://github.com/preactjs/preact/blob/d7a433ee8463a7dc23a05111bb47de9ec729ad4d/src/diff/children.js#L77
	// @todo remove this for Preact 11
	__b: { configurable: true, value: 1 },
});

/** Inject low-level property/attribute bindings for Signals into Preact's diff */
hook(OptionsTypes.DIFF, (old, vnode) => {
	if (typeof vnode.type === "string") {
		let signalProps: Record<string, any> | undefined;

		let props = vnode.props;
		for (let i in props) {
			if (i === "children") continue;

			let value = props[i];
			if (value instanceof Signal) {
				if (!signalProps) vnode.__np = signalProps = {};
				signalProps[i] = value;
				props[i] = value.peek();
			}
		}
	}

	old(vnode);
});

/** Set up Updater before rendering a component */
hook(OptionsTypes.RENDER, (old, vnode) => {
	setCurrentUpdater();

	let updater;

	let component = vnode.__c;
	if (component) {
		component._updateFlags &= ~HAS_PENDING_UPDATE;

		updater = component._updater;
		if (updater === undefined) {
			component._updater = updater = createUpdater(() => {
				component._updateFlags |= HAS_PENDING_UPDATE;
				component.setState({});
			});
		}
	}

	currentComponent = component;
	setCurrentUpdater(updater);
	old(vnode);
});

/** Finish current updater if a component errors */
hook(OptionsTypes.CATCH_ERROR, (old, error, vnode, oldVNode) => {
	setCurrentUpdater();
	currentComponent = undefined;
	old(error, vnode, oldVNode);
});

/** Finish current updater after rendering any VNode */
hook(OptionsTypes.DIFFED, (old, vnode) => {
	setCurrentUpdater();
	currentComponent = undefined;

	let dom: Element;

	// vnode._dom is undefined during string rendering,
	// so we use this to skip prop subscriptions during SSR.
	if (typeof vnode.type === "string" && (dom = vnode.__e as Element)) {
		let props = vnode.__np;
		let renderedProps = vnode.props;
		if (props) {
			let updaters = dom._updaters;
			if (updaters) {
				for (let prop in updaters) {
					let updater = updaters[prop];
					if (updater !== undefined && !(prop in props)) {
						updater._dispose();
						// @todo we could just always invoke _dispose() here
						updaters[prop] = undefined;
					}
				}
			} else {
				updaters = {};
				dom._updaters = updaters;
			}
			for (let prop in props) {
				let updater = updaters[prop];
				let signal = props[prop];
				if (updater === undefined) {
					updater = createPropUpdater(dom, prop, signal, renderedProps);
					updaters[prop] = updater;
				} else {
					updater._update(signal, renderedProps);
				}
			}
		}
	}
	old(vnode);
});

function createPropUpdater(
	dom: Element,
	prop: string,
	propSignal: Signal,
	props: Record<string, any>
): PropertyUpdater {
	const setAsProperty =
		prop in dom &&
		// SVG elements need to go through `setAttribute` because they
		// expect things like SVGAnimatedTransformList instead of strings.
		// @ts-ignore
		dom.ownerSVGElement === undefined;

	const changeSignal = signal(propSignal);
	return {
		_update: (newSignal: Signal, newProps: typeof props) => {
			changeSignal.value = newSignal;
			props = newProps;
		},
		_dispose: effect(() => {
			const value = changeSignal.value.value;
			// If Preact just rendered this value, don't render it again:
			if (props[prop] === value) return;
			props[prop] = value;
			if (setAsProperty) {
				// @ts-ignore-next-line silly
				dom[prop] = value;
			} else if (value) {
				dom.setAttribute(prop, value);
			} else {
				dom.removeAttribute(prop);
			}
		}),
	};
}

/** Unsubscribe from Signals when unmounting components/vnodes */
hook(OptionsTypes.UNMOUNT, (old, vnode: VNode) => {
	if (typeof vnode.type === "string") {
		let dom = vnode.__e as Element | undefined;
		// vnode._dom is undefined during string rendering
		if (dom) {
			const updaters = dom._updaters;
			if (updaters) {
				dom._updaters = undefined;
				for (let prop in updaters) {
					let updater = updaters[prop];
					if (updater) updater._dispose();
				}
			}
		}
	} else {
		let component = vnode.__c;
		if (component) {
			const updater = component._updater;
			if (updater) {
				component._updater = undefined;
				updater._dispose();
			}
		}
	}
	old(vnode);
});

/** Mark components that use hook state so we can skip sCU optimization. */
hook(OptionsTypes.HOOK, (old, component, index, type) => {
	if (type < 3 || type === 9)
		(component as AugmentedComponent)._updateFlags |= HAS_HOOK_STATE;
	old(component, index, type);
});

/**
 * Auto-memoize components that use Signals/Computeds.
 * Note: Does _not_ optimize components that use hook/class state.
 */
Component.prototype.shouldComponentUpdate = function (
	this: AugmentedComponent,
	props,
	state
) {
	// @todo: Once preactjs/preact#3671 lands, this could just use `currentUpdater`:
	const updater = this._updater;
	const hasSignals = updater && updater._sources !== undefined;

	// let reason;
	// if (!hasSignals && !hasComputeds.has(this)) {
	// 	reason = "no signals or computeds";
	// } else if (hasPendingUpdate.has(this)) {
	// 	reason = "has pending update";
	// } else if (hasHookState.has(this)) {
	// 	reason = "has hook state";
	// }
	// if (reason) {
	// 	if (!this) reason += " (`this` bug)";
	// 	console.log("not optimizing", this?.constructor?.name, ": ", reason, {
	// 		details: {
	// 			hasSignals,
	// 			hasComputeds: hasComputeds.has(this),
	// 			hasPendingUpdate: hasPendingUpdate.has(this),
	// 			hasHookState: hasHookState.has(this),
	// 			deps: Array.from(updater._deps),
	// 			updater,
	// 		},
	// 	});
	// }

	// if this component used no signals or computeds, update:
	if (!hasSignals && !(this._updateFlags & HAS_COMPUTEDS)) return true;

	// if there is a pending re-render triggered from Signals,
	// or if there is hook or class state, update:
	if (this._updateFlags & (HAS_PENDING_UPDATE | HAS_HOOK_STATE)) return true;

	// @ts-ignore
	for (let i in state) return true;

	// if any non-Signal props changed, update:
	for (let i in props) {
		if (i !== "__source" && props[i] !== this.props[i]) return true;
	}
	for (let i in this.props) if (!(i in props)) return true;

	// this is a purely Signal-driven component, don't update:
	return false;
};

export function useSignal<T>(value: T) {
	return useMemo(() => signal<T>(value), []);
}

export function useComputed<T>(compute: () => T) {
	const $compute = useRef(compute);
	$compute.current = compute;
	(currentComponent as AugmentedComponent)._updateFlags |= HAS_COMPUTEDS;
	return useMemo(() => computed<T>(() => $compute.current()), []);
}

export function useSignalEffect(cb: () => void | (() => void)) {
	const callback = useRef(cb);
	callback.current = cb;

	useEffect(() => {
		return effect(() => callback.current());
	}, []);
}

/**
 * @todo Determine which Reactive implementation we'll be using.
 * @internal
 */
// export function useReactive<T extends object>(value: T): Reactive<T> {
// 	return useMemo(() => reactive<T>(value), []);
// }

/**
 * @internal
 * Update a Reactive's using the properties of an object or other Reactive.
 * Also works for Signals.
 * @example
 *   // Update a Reactive with Object.assign()-like syntax:
 *   const r = reactive({ name: "Alice" });
 *   update(r, { name: "Bob" });
 *   update(r, { age: 42 }); // property 'age' does not exist in type '{ name?: string }'
 *   update(r, 2); // '2' has no properties in common with '{ name?: string }'
 *   console.log(r.name.value); // "Bob"
 *
 * @example
 *   // Update a Reactive with the properties of another Reactive:
 *   const A = reactive({ name: "Alice" });
 *   const B = reactive({ name: "Bob", age: 42 });
 *   update(A, B);
 *   console.log(`${A.name} is ${A.age}`); // "Bob is 42"
 *
 * @example
 *   // Update a signal with assign()-like syntax:
 *   const s = signal(42);
 *   update(s, "hi"); // Argument type 'string' not assignable to type 'number'
 *   update(s, {}); // Argument type '{}' not assignable to type 'number'
 *   update(s, 43);
 *   console.log(s.value); // 43
 *
 * @param obj The Reactive or Signal to be updated
 * @param update The value, Signal, object or Reactive to update `obj` to match
 * @param overwrite If `true`, any properties `obj` missing from `update` are set to `undefined`
 */
/*
export function update<T extends SignalOrReactive>(
	obj: T,
	update: Partial<Unwrap<T>>,
	overwrite = false
) {
	if (obj instanceof Signal) {
		obj.value = peekValue(update);
	} else {
		for (let i in update) {
			if (i in obj) {
				obj[i].value = peekValue(update[i]);
			} else {
				let sig = signal(peekValue(update[i]));
				sig[KEY] = i;
				obj[i] = sig;
			}
		}
		if (overwrite) {
			for (let i in obj) {
				if (!(i in update)) {
					obj[i].value = undefined;
				}
			}
		}
	}
}
*/
