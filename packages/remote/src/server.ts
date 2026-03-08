import {
	signal,
	type ReadonlySignal,
	type SignalOptions,
} from "@preact/signals-core";

import {
	collectPublishedModelActions,
	collectPublishedModelLeaves,
	errorMessage,
	type PublishedModel,
} from "./internal";
import type {
	RemoteSignalMessage,
	RemoteSignalServer,
	RemoteSignalTransport,
} from "./types";

type ConnectionSignalSubscription = {
	dispose: () => void;
};

type ConnectionModelSubscription = {
	dispose: () => void;
};

type ServerConnection = {
	handleSignalUnpublished(key: string): void;
	handleModelUnpublished(key: string): void;
	dispose(): void;
};

export function createRemoteSignalServer(): RemoteSignalServer {
	const publishedSignals = new Map<string, ReadonlySignal<unknown>>();
	const publishedModels = new Map<string, PublishedModel>();
	const connections = new Set<ServerConnection>();

	function assertKeyAvailable(key: string) {
		if (publishedSignals.has(key) || publishedModels.has(key)) {
			throw new Error(`A remote resource named '${key}' is already published.`);
		}
	}

	function unpublish(key: string) {
		if (!publishedSignals.delete(key)) {
			return;
		}

		for (const connection of connections) {
			connection.handleSignalUnpublished(key);
		}
	}

	function unpublishModel(key: string) {
		if (!publishedModels.delete(key)) {
			return;
		}

		for (const connection of connections) {
			connection.handleModelUnpublished(key);
		}
	}

	function publish<T>(key: string, source: ReadonlySignal<T>) {
		assertKeyAvailable(key);
		publishedSignals.set(key, source as ReadonlySignal<unknown>);

		return () => {
			unpublish(key);
		};
	}

	function publishModel<TModel extends object>(key: string, model: TModel) {
		assertKeyAvailable(key);

		publishedModels.set(key, {
			leaves: collectPublishedModelLeaves(key, model),
			actions: collectPublishedModelActions(model),
		});

		return () => {
			unpublishModel(key);
		};
	}

	function attach(transport: RemoteSignalTransport) {
		const signalSubscriptions = new Map<string, ConnectionSignalSubscription>();
		const modelSubscriptions = new Map<string, ConnectionModelSubscription>();

		function unsubscribeSignal(key: string) {
			const subscription = signalSubscriptions.get(key);
			if (subscription === undefined) {
				return;
			}

			subscription.dispose();
			signalSubscriptions.delete(key);
		}

		function unsubscribeModel(key: string) {
			const subscription = modelSubscriptions.get(key);
			if (subscription === undefined) {
				return;
			}

			subscription.dispose();
			modelSubscriptions.delete(key);
		}

		function subscribeSignal(key: string) {
			if (signalSubscriptions.has(key)) {
				return;
			}

			const source = publishedSignals.get(key);
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

			signalSubscriptions.set(key, { dispose });
		}

		function subscribeModel(key: string) {
			if (modelSubscriptions.has(key)) {
				return;
			}

			const publishedModel = publishedModels.get(key);
			if (publishedModel === undefined) {
				transport.send({
					type: "model-error",
					key,
					message: `Unknown remote model: ${key}`,
				});
				return;
			}

			let version = 0;
			const pending = new Map<string, { key: string; value: unknown }>();
			let queued = false;
			let active = true;

			transport.send({
				type: "model-snapshot",
				key,
				version,
				entries: publishedModel.leaves.map(leaf => ({
					key: leaf.key,
					value: leaf.source.value,
				})),
			});
			version++;

			const disposers = publishedModel.leaves.map(leaf => {
				let initialized = false;
				return leaf.source.subscribe(value => {
					if (!initialized) {
						initialized = true;
						return;
					}

					pending.set(leaf.key, {
						key: leaf.key,
						value,
					});

					if (queued) {
						return;
					}

					queued = true;
					queueMicrotask(() => {
						if (!active) {
							queued = false;
							pending.clear();
							return;
						}

						queued = false;
						if (pending.size === 0) {
							return;
						}

						transport.send({
							type: "model-patch",
							key,
							version,
							updates: Array.from(pending.values()),
						});
						pending.clear();
						version++;
					});
				});
			});

			modelSubscriptions.set(key, {
				dispose() {
					active = false;
					pending.clear();
					for (const dispose of disposers) {
						dispose();
					}
				},
			});
		}

		function callModelAction(
			message: Extract<RemoteSignalMessage, { type: "call-model-action" }>
		) {
			const publishedModel = publishedModels.get(message.key);
			if (publishedModel === undefined) {
				transport.send({
					type: "model-action-error",
					key: message.key,
					callId: message.callId,
					message: `Unknown remote model: ${message.key}`,
				});
				return;
			}

			const action = publishedModel.actions[message.action];
			if (typeof action !== "function") {
				transport.send({
					type: "model-action-error",
					key: message.key,
					callId: message.callId,
					message: `Unknown remote action '${message.action}' on model '${message.key}'.`,
				});
				return;
			}

			Promise.resolve()
				.then(() => action(...message.args))
				.then(value => {
					transport.send({
						type: "model-action-result",
						key: message.key,
						callId: message.callId,
						value,
					});
				})
				.catch(error => {
					transport.send({
						type: "model-action-error",
						key: message.key,
						callId: message.callId,
						message: errorMessage(error),
					});
				});
		}

		const stop = transport.subscribe(message => {
			if (message.type === "subscribe") {
				subscribeSignal(message.key);
				return;
			}

			if (message.type === "unsubscribe") {
				unsubscribeSignal(message.key);
				return;
			}

			if (message.type === "subscribe-model") {
				subscribeModel(message.key);
				return;
			}

			if (message.type === "unsubscribe-model") {
				unsubscribeModel(message.key);
				return;
			}

			if (message.type === "call-model-action") {
				callModelAction(message);
			}
		});

		const connection: ServerConnection = {
			handleSignalUnpublished(key: string) {
				unsubscribeSignal(key);
				transport.send({ type: "unpublished", key });
			},
			handleModelUnpublished(key: string) {
				unsubscribeModel(key);
				transport.send({ type: "model-unpublished", key });
			},
			dispose() {
				stop();

				for (const key of Array.from(signalSubscriptions.keys())) {
					unsubscribeSignal(key);
				}

				for (const key of Array.from(modelSubscriptions.keys())) {
					unsubscribeModel(key);
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
		publishModel,
		unpublishModel,
		attach,
	};
}
