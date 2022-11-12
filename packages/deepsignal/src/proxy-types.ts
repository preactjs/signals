const handlers: ProxyHandler<object> = {
	get(target: object, key: string, receiver: ProxyConstructor): number {
		return Reflect.get(target, key, receiver);
	},
	set(target: object, key: string, value: any, receiver: ProxyConstructor) {
		return Reflect.set(target, key, value, receiver);
	},
};

const proxify = (obj: object) => {
	const proxy = new Proxy(obj, {
		get(target: object, key: string, receiver: ProxyConstructor): number {
			return Reflect.get(target, key, receiver);
		},
	});
	return proxy;
};

const proxy = proxify({ a: 1 });

proxy;
