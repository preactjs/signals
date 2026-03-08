# @preact/signals-remote

Prototype helpers for mirroring `@preact/signals-core` state across a transport boundary.

The package is transport-agnostic:

- publish individual signals
- publish flat models made of signals and actions
- invoke model actions through Promise-based RPC
- derive client types from a shared remote model definition

## Installation

```bash
pnpm add @preact/signals-core @preact/signals-remote
```

## Signal Usage

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
	if (remoteCount.status.value === "ready") {
		console.log("remote count", remoteCount.value);
	}
});

count.value = 1;
count.value = 2;
```

## Model Usage

```ts
import { createModel, signal } from "@preact/signals-core";
import {
	createRemoteSignalClient,
	createRemoteSignalServer,
	createRemoteTransportPair,
	defineRemoteModel,
} from "@preact/signals-remote";

const CounterModel = createModel(() => {
	const count = signal(0);

	return {
		count,
		add(amount: number) {
			count.value += amount;
			return count.value;
		},
		reset() {
			count.value = 0;
		},
	};
});

const counterRemote = defineRemoteModel("counter", CounterModel);

const server = createRemoteSignalServer();
server.publishModel(counterRemote, new CounterModel());

const { server: serverTransport, client: clientTransport } =
	createRemoteTransportPair();

server.attach(serverTransport);

const client = createRemoteSignalClient(clientTransport);
const remoteCounter = client.model<typeof counterRemote>(counterRemote);

await remoteCounter.actions.add(2);

if (remoteCounter.status.value === "ready" && remoteCounter.state) {
	console.log(remoteCounter.state.count.value);
}
```

## Type-only Contracts

If the server and client should not share runtime values across realms, export the remote definition and import it with `import type` on the client:

```ts
// counter.remote.ts
import { defineRemoteModel } from "@preact/signals-remote";
import { CounterModel } from "./counter.model";

export const counterRemote = defineRemoteModel("counter", CounterModel);
```

```ts
// server
import { counterRemote } from "./counter.remote";
import { CounterModel } from "./counter.model";

server.publishModel(counterRemote, new CounterModel());
```

```ts
// client
import type { counterRemote } from "./counter.remote";

const remoteCounter = client.model<typeof counterRemote>("counter");
```

This keeps the runtime boundary to the string key while still deriving state and action types from the model definition.

## API

### `defineRemoteModel(key, model?)`

Creates a typed remote model definition. You can pass a `createModel()` constructor to infer the model shape automatically.

### `createRemoteSignalServer()`

Creates a server registry that can publish signals and flat models.

- `createSignal(key, initialValue, options?)`
- `publish(key, source)`
- `unpublish(key)`
- `publishModel(keyOrDefinition, model)`
- `unpublishModel(key)`
- `attach(transport)`

### `createRemoteSignalClient(transport)`

Creates a client registry that lazily subscribes to published remote state.

- `signal(key, options?)`
- `model(keyOrDefinition)`
- `dispose()`

Each remote signal exposes:

- `value`
- `status`
- `error`
- `dispose()`

Each remote model exposes:

- `state`
- `status`
- `error`
- `actions` derived from the model's functions
- `dispose()`

## Adapting a WebSocket

You can wrap an existing socket by translating JSON messages into the package transport interface:

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
