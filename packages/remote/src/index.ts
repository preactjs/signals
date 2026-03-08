import {
	signal,
	type ReadonlySignal,
	type Signal,
	type SignalOptions,
} from "@preact/signals-core";

export type RemoteSignalStatus =
	| "connecting"
	| "ready"
	| "error"
	| "unpublished"
	| "disposed";

export type RemoteSignalMessage =
	| {
			type: "subscribe";
			key: string;
	  }
	| {
			type: "unsubscribe";
			key: string;
	  }
	| {
			type: "snapshot";
			key: string;
			value: unknown;
			version: number;
	  }
	| {
			type: "update";
			key: string;
			value: unknown;
			version: number;
	  }
	| {
			type: "error";
			key: string;
			message: string;
	  }
	| {
			type: "unpublished";
			key: string;
	  };

export interface RemoteSignalTransport {
	send(message: RemoteSignalMessage): void;
	subscribe(listener: (message: RemoteSignalMessage) => void): () => void;
}

export interface RemoteSignalOptions<T> {
	initialValue?: T;
}

export interface RemoteSignal<T> extends ReadonlySignal<T | undefined> {
	readonly key: string;
	readonly ready: ReadonlySignal<boolean>;
	readonly status: ReadonlySignal<RemoteSignalStatus>;
	readonly error: ReadonlySignal<Error | undefined>;
	dispose(): void;
}

export interface RemoteSignalClient {
	signal<T>(key: string, options?: RemoteSignalOptions<T>): RemoteSignal<T>;
	dispose(): void;
}

export interface RemoteSignalServer {
	createSignal<T>(
		key: string,
		initialValue: T,
		options?: SignalOptions<T>
	): Signal<T>;
	publish<T>(key: string, source: ReadonlySignal<T>): () => void;
	unpublish(key: string): void;
	attach(transport: RemoteSignalTransport): () => void;
}

type RemoteSignalRecord<T> = {
	remote: RemoteSignal<T>;
	value: Signal<T | undefined>;
	ready: Signal<boolean>;
	status: Signal<RemoteSignalStatus>;
	error: Signal<Error | undefined>;
	version: number;
};

function createRemoteSignalRecord<T>(
	key: string,
	onDispose: () => void,
	options?: RemoteSignalOptions<T>
): RemoteSignalRecord<T> {
	const value = signal<T | undefined>(options?.initialValue);
	const ready = signal(false);
	const status = signal<RemoteSignalStatus>("connecting");
	const error = signal<Error | undefined>(undefined);

	const remote = Object.assign(value, {
		key,
		ready,
		status,
		error,
		dispose: onDispose,
	}) as RemoteSignal<T>;

	return {
		remote,
		value,
		ready,
		status,
		error,
		version: -1,
	};
}

export function createRemoteSignalClient(
	transport: RemoteSignalTransport
): RemoteSignalClient {
	const remotes = new Map<string, RemoteSignalRecord<unknown>>();

	const stop = transport.subscribe(message => {
		const record = remotes.get(message.key);
		if (record === undefined) {
			return;
		}

		if (message.type === "snapshot" || message.type === "update") {
			if (message.version < record.version) {
				return;
			}

			record.version = message.version;
			record.value.value = message.value;
			record.ready.value = true;
			record.error.value = undefined;
			record.status.value = "ready";
			return;
		}

		if (message.type === "error") {
			record.ready.value = false;
			record.error.value = new Error(message.message);
			record.status.value = "error";
			return;
		}

		if (message.type === "unpublished") {
			record.ready.value = false;
			record.error.value = undefined;
			record.status.value = "unpublished";
		}
	});

	function disposeRemote(key: string) {
		const record = remotes.get(key);
		if (record === undefined) {
			return;
		}

		remotes.delete(key);
		record.ready.value = false;
		record.error.value = undefined;
		record.status.value = "disposed";
		transport.send({ type: "unsubscribe", key });
	}

	return {
		signal<T>(key: string, options?: RemoteSignalOptions<T>): RemoteSignal<T> {
			const existing = remotes.get(key);
			if (existing !== undefined) {
				return existing.remote as RemoteSignal<T>;
			}

			const record = createRemoteSignalRecord(
				key,
				() => {
					disposeRemote(key);
				},
				options
			);

			remotes.set(key, record as RemoteSignalRecord<unknown>);
			transport.send({ type: "subscribe", key });
			return record.remote;
		},
		dispose() {
			stop();

			for (const key of Array.from(remotes.keys())) {
				disposeRemote(key);
			}
		},
	};
}

type ConnectionSubscription = {
	dispose: () => void;
};

type ServerConnection = {
	handleUnpublished(key: string): void;
	dispose(): void;
};

export function createRemoteSignalServer(): RemoteSignalServer {
	const published = new Map<string, ReadonlySignal<unknown>>();
	const connections = new Set<ServerConnection>();

	function unpublish(key: string) {
		if (!published.delete(key)) {
			return;
		}

		for (const connection of connections) {
			connection.handleUnpublished(key);
		}
	}

	function publish<T>(key: string, source: ReadonlySignal<T>) {
		if (published.has(key)) {
			throw new Error(`A remote signal named '${key}' is already published.`);
		}

		published.set(key, source as ReadonlySignal<unknown>);

		return () => {
			unpublish(key);
		};
	}

	function attach(transport: RemoteSignalTransport) {
		const subscriptions = new Map<string, ConnectionSubscription>();

		function unsubscribe(key: string) {
			const subscription = subscriptions.get(key);
			if (subscription === undefined) {
				return;
			}

			subscription.dispose();
			subscriptions.delete(key);
		}

		function subscribe(key: string) {
			if (subscriptions.has(key)) {
				return;
			}

			const source = published.get(key);
			if (source === undefined) {
				transport.send({
					type: "error",
					key,
					message: `Unknown remote signal: ${key}`,
				});
				return;
			}

			let version = 0;
			let sentSnapshot = false;
			const dispose = source.subscribe(value => {
				transport.send({
					type: sentSnapshot ? "update" : "snapshot",
					key,
					value,
					version,
				});
				sentSnapshot = true;
				version++;
			});

			subscriptions.set(key, { dispose });
		}

		const stop = transport.subscribe(message => {
			if (message.type === "subscribe") {
				subscribe(message.key);
				return;
			}

			if (message.type === "unsubscribe") {
				unsubscribe(message.key);
			}
		});

		const connection: ServerConnection = {
			handleUnpublished(key: string) {
				unsubscribe(key);
				transport.send({ type: "unpublished", key });
			},
			dispose() {
				stop();

				for (const key of Array.from(subscriptions.keys())) {
					unsubscribe(key);
				}

				connections.delete(connection);
			},
		};

		connections.add(connection);

		return () => {
			connection.dispose();
		};
	}

	return {
		createSignal<T>(key: string, initialValue: T, options?: SignalOptions<T>) {
			const value = signal(initialValue, options);
			publish(key, value);
			return value;
		},
		publish,
		unpublish,
		attach,
	};
}

function createTransportEndpoint(
	listeners: Set<(message: RemoteSignalMessage) => void>,
	peerListeners: Set<(message: RemoteSignalMessage) => void>
): RemoteSignalTransport {
	return {
		send(message) {
			queueMicrotask(() => {
				for (const listener of peerListeners) {
					listener(message);
				}
			});
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export function createRemoteTransportPair(): {
	server: RemoteSignalTransport;
	client: RemoteSignalTransport;
} {
	const serverListeners = new Set<(message: RemoteSignalMessage) => void>();
	const clientListeners = new Set<(message: RemoteSignalMessage) => void>();

	return {
		server: createTransportEndpoint(serverListeners, clientListeners),
		client: createTransportEndpoint(clientListeners, serverListeners),
	};
}
