import { signal, Signal } from "@preact/signals-core";

const proxyToSignals = new WeakMap();
const objToProxy = new WeakMap();
const rg = /^\$/;

type DeepSignalObject<T extends object> = {
	[P in keyof T & string as `$${P}`]?: Signal<T[P]>;
} & {
	[P in keyof T]: T[P] extends Array<unknown>
		? DeepSignalArray<T[P]>
		: T[P] extends object
		? DeepSignalObject<T[P]>
		: T[P];
};

type ArrayType<T> = T extends Array<infer Item> ? Item : T;
type DeepSignalArray<T> = Array<ArrayType<T>> & {
	[key: number]: DeepSignal<ArrayType<T>>;
	[key: `$${number}`]: Signal<ArrayType<T>>;
	length: number;
	$length?: Signal<number>;
};

type DeepSignal<T> = T extends Array<unknown>
	? DeepSignalArray<T>
	: T extends object
	? DeepSignalObject<T>
	: T;

export const deepSignal = <T extends object>(obj: T): DeepSignal<T> => {
	return new Proxy(obj, handlers) as DeepSignal<T>;
};

const handlers = {
	get(target: object, originalKey: string, receiver: object) {
		const returnSignal = originalKey[0] === "$";
		const key = returnSignal ? originalKey.replace(rg, "") : originalKey;
		let value = Reflect.get(target, key, receiver);
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
		return returnSignal ? signals.get(key) : signals.get(key).value;
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
