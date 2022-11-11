import { signal, Signal } from "@preact/signals-core";

const proxyToSignals = new WeakMap();
const objToProxy = new WeakMap();
const rg = /^\$\$?/;

// type IsFunction<T extends object> = {
// 	[P in keyof T]: T[P] extends Function ? never : P;
// }[keyof T];

// interface SignalArray<T> extends Array<T> {
// 	$length: Signal<number>;
// 	$$length: number;
// 	$0: Signal<T>;
// 	$$0: T;
// }

// type DeepSignalArray<T> = {
// 	[P in keyof T]: T[P] extends Array<unknown>
// 		? DeepSignalArray<T[P]>
// 		: T[P] extends object
// 		? DeepSignal<T[P]>
// 		: T[P];
// };

// const l: DeepSignalArray<number | object> = [1, { a: 1 }];

// export type DeepSignal<T extends object> = {
// 	[P in IsFunction<T> & string as `$${P}`]: Signal<T[P]>;
// } & T;

export type DeepSignal<T extends object> = {
	[P in keyof T & string as `$${P}`]: T[P] extends object
		? Signal<DeepSignal<T[P]>>
		: Signal<T[P]>;
} & {
	[P in keyof T & string as `$$${P}`]: T[P];
} & {
	[P in keyof T]: T[P] extends object ? DeepSignal<T[P]> : T[P];
};

// & {
// 	[P in keyof T & string as `$$${P}`]: T[P];
// }

export const deepSignal = <T extends object>(obj: T): DeepSignal<T> => {
	return new Proxy(obj, handlers) as DeepSignal<T>;
};

const d = deepSignal({ a: 1, b: "2", c: () => {}, d: [], e: { f: 1 } });

d.a;

const handlers = {
	get(target: object, originalKey: string, receiver: object) {
		const retSignal = originalKey[0] === "$";
		const key = retSignal ? originalKey.replace(rg, "") : originalKey;
		let value = Reflect.get(target, key, receiver);
		if (originalKey[1] === "$") return value;
		if (!proxyToSignals.has(receiver)) proxyToSignals.set(receiver, new Map());
		const signals = proxyToSignals.get(receiver);
		if (!signals.has(key)) {
			if (typeof value === "object" && value !== null) {
				if (!objToProxy.has(value))
					objToProxy.set(value, new Proxy(value, handlers));
				value = objToProxy.get(value);
			}
			signals.set(key, signal(value));
		}
		return retSignal ? signals.get(key) : signals.get(key).value;
	},

	set(target: object, key: string, val: any, receiver: object) {
		let internal = val;
		if (typeof val === "object" && val !== null) {
			if (!objToProxy.has(val)) objToProxy.set(val, new Proxy(val, handlers));
			internal = objToProxy.get(val);
		}
		if (!proxyToSignals.has(receiver)) proxyToSignals.set(receiver, new Map());
		const signals = proxyToSignals.get(receiver);
		if (!signals.has(key)) signals.set(key, signal(internal));
		else signals.get(key).value = internal;
		const result = Reflect.set(target, key, val, receiver);
		if (Array.isArray(target) && signals.has("length"))
			signals.get("length").value = target.length;
		return result;
	},
};
