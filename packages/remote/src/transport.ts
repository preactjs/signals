import type { RemoteSignalMessage, RemoteSignalTransport } from "./types";

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
