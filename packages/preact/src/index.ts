import { options, Component, createElement } from "preact";
import { useRef, useMemo } from "preact/hooks";
import {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
} from "@preact/signals-core";
import {
	VNode,
	ComponentType,
	OptionsTypes,
	HookFn,
	Updater,
	ElementUpdater,
} from "./internal";

export { signal, computed, batch, effect, Signal, type ReadonlySignal };

// Components that have a pending Signal update: (used to bypass default sCU:false)
const hasPendingUpdate = new WeakSet<Component>();

// Components that have useState()/useReducer() hooks:
const hasHookState = new WeakSet<Component>();

// Components that have useComputed():
const hasComputeds = new WeakSet<Component>();

// Install a Preact options hook
function hook<T extends OptionsTypes>(hookName: T, hookFn: HookFn<T>) {
	// @ts-ignore-next-line private options hooks usage
	options[hookName] = hookFn.bind(null, options[hookName] || (() => {}));
}

let currentComponent: Component | undefined;
let currentUpdater: Updater | undefined;
let finishUpdate: ReturnType<Updater["_setCurrent"]> | undefined;
const updaterForComponent = new WeakMap<Component | VNode, Updater>();

function setCurrentUpdater(updater?: Updater) {
	// end tracking for the current update:
	if (finishUpdate) finishUpdate(true, true);
	// start tracking the new update:
	currentUpdater = updater;
	finishUpdate = updater && updater._setCurrent();
}

function createUpdater(updater: () => void) {
	const s = signal(undefined) as Updater;
	s._updater = updater;
	return s;
}

// Get a (cached) Signal property updater for an element VNode
function getElementUpdater(vnode: VNode) {
	let updater = updaterForComponent.get(vnode) as ElementUpdater;
	if (!updater) {
		let signalProps: Array<{ _key: string; _signal: Signal }> = [];
		updater = createUpdater(() => {
			let dom = vnode.__e as Element;

			for (let i = 0; i < signalProps.length; i++) {
				let { _key: prop, _signal: signal } = signalProps[i];
				let value = signal._value;
				if (!dom) return;
				if (prop in dom) {
					// @ts-ignore-next-line silly
					dom[prop] = value;
				} else if (value) {
					dom.setAttribute(prop, value);
				} else {
					dom.removeAttribute(prop);
				}
			}
		}) as ElementUpdater;
		updater._props = signalProps;
		updaterForComponent.set(vnode, updater);
	} else {
		updater._props.length = 0;
	}
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

/** Convert Signals within (nested) props.children into Text components */
function childToSignal<T>(child: any, i: keyof T, arr: T) {
	if (typeof child !== "object" || child == null) {
		// can't be a signal
	} else if (Array.isArray(child)) {
		child.forEach(childToSignal);
	} else if (child instanceof Signal) {
		// @ts-ignore-next-line yes, arr can accept VNodes:
		arr[i] = createElement(Text, { data: child });
	}
}

/**
 * A wrapper component that renders a Signal directly as a Text node.
 * @todo: in Preact 11, just decorate Signal with `type:null`
 */
function Text(this: ComponentType, { data }: { data: Signal }) {
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
				hasComputeds.add(v.__c);
				break;
			}
		}

		// Replace this component's vdom updater with a direct text one:
		currentUpdater!._updater = () => {
			(this.base as Text).data = s._value;
		};

		return computed(() => {
			let data = currentSignal.value;
			let s = data.value;
			return s === 0 ? 0 : s === true ? "" : s || "";
		});
	}, []);

	return s.value;
}
Text.displayName = "_st";

/** Inject low-level property/attribute bindings for Signals into Preact's diff */
hook(OptionsTypes.DIFF, (old, vnode) => {
	if (typeof vnode.type === "string") {
		// let orig = vnode.__o || vnode;
		let props = vnode.props;
		let updater;

		for (let i in props) {
			let value = props[i];
			if (i === "children") {
				childToSignal(value, "children", props);
			} else if (value instanceof Signal) {
				// first Signal prop triggers creation/cleanup of the updater:
				if (!updater) updater = getElementUpdater(vnode);
				// track which props are Signals for precise updates:
				updater._props.push({ _key: i, _signal: value });
				let newUpdater = updater._updater;
				if (value._updater) {
					let oldUpdater = value._updater;
					value._updater = () => {
						newUpdater();
						oldUpdater();
					};
				} else {
					value._updater = newUpdater;
				}
				props[i] = value.peek();
			}
		}

		setCurrentUpdater(updater);
	}

	old(vnode);
});

/** Set up Updater before rendering a component */
hook(OptionsTypes.RENDER, (old, vnode) => {
	let updater;

	let component = vnode.__c;
	if (component) {
		hasPendingUpdate.delete(component);

		updater = updaterForComponent.get(component);
		if (updater === undefined) {
			updater = createUpdater(() => {
				hasPendingUpdate.add(component);
				component.setState({});
			});
			updaterForComponent.set(component, updater);
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
	old(vnode);
});

/** Unsubscribe from Signals when unmounting components/vnodes */
hook(OptionsTypes.UNMOUNT, (old, vnode: VNode) => {
	let thing = vnode.__c || vnode;
	const updater = updaterForComponent.get(thing);
	if (updater) {
		updaterForComponent.delete(thing);
		const signals = updater._deps;
		if (signals) {
			signals.forEach((_, signal) => signal._subs.delete(updater));
			signals.clear();
		}
	}
	old(vnode);
});

/** Mark components that use hook state so we can skip sCU optimization. */
hook(OptionsTypes.HOOK, (old, component, index, type) => {
	if (type < 3) hasHookState.add(component);
	old(component, index, type);
});

/**
 * Auto-memoize components that use Signals/Computeds.
 * Note: Does _not_ optimize components that use hook/class state.
 */
Component.prototype.shouldComponentUpdate = function (props, state) {
	// @todo: Once preactjs/preact#3671 lands, this could just use `currentUpdater`:
	const updater = updaterForComponent.get(this);

	const hasSignals = updater && updater._deps?.size !== 0;

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
	if (!hasSignals && !hasComputeds.has(this)) return true;

	// if there is a pending re-render triggered from Signals, update:
	if (hasPendingUpdate.has(this)) return true;

	// if there is hook or class state, update:
	if (hasHookState.has(this)) return true;
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
	hasComputeds.add(currentComponent!);
	return useMemo(() => computed<T>(() => $compute.current()), []);
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
