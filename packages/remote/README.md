# @preact/signals-remote

Prototype helpers for mirroring `@preact/signals-core` values across a transport boundary.

The package is transport-agnostic: the server publishes a signal, the client requests it by key, and the client-side mirror updates whenever the server-side signal changes.

## Installation

```bash
pnpm add @preact/signals-core @preact/signals-remote
```

## Usage

```ts
import { effect } from "@preact/signals-core";
import {
	createRemoteSignalClient,
	createRemoteSignalServer,
	createRemoteTransportPair,
} from "@preact/signals-remote";

const server = createRemoteSignalServer();
const count = server.createSignal("count", 0);

const { server: serverTransport, client: clientTransport } =
	createRemoteTransportPair();

server.attach(serverTransport);

const client = createRemoteSignalClient(clientTransport);
const remoteCount = client.signal<number>("count");

effect(() => {
	if (remoteCount.ready.value) {
		console.log("remote count", remoteCount.value);
	}
});

count.value = 1;
count.value = 2;
```

## API

### `createRemoteSignalServer()`

Creates a server registry that can publish existing signals or create new ones directly.

- `createSignal(key, initialValue, options?)`
- `publish(key, source)`
- `unpublish(key)`
- `attach(transport)`

### `createRemoteSignalClient(transport)`

Creates a client registry that lazily subscribes to published signals.

- `signal(key, options?)`
- `dispose()`

Each remote signal exposes:

- `value`
- `ready`
- `status`
- `error`
- `dispose()`

### `createRemoteTransportPair()`

Creates an in-memory transport pair for tests, demos, and local prototyping.

## Adapting a WebSocket

You can wrap an existing socket by translating JSON messages into the package's transport interface:

```ts
import type {
	RemoteSignalMessage,
	RemoteSignalTransport,
} from "@preact/signals-remote";

function createWebSocketTransport(socket: WebSocket): RemoteSignalTransport {
	return {
		send(message) {
			socket.send(JSON.stringify(message));
		},
		subscribe(listener) {
			const handleMessage = (event: MessageEvent<string>) => {
				listener(JSON.parse(event.data) as RemoteSignalMessage);
			};

			socket.addEventListener("message", handleMessage);

			return () => {
				socket.removeEventListener("message", handleMessage);
			};
		},
	};
}
```
