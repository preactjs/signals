import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import {
	createRemoteSignalClient,
	type RemoteContractActions,
	type RemoteContractModel,
	type RemoteModel,
	type RemoteSignalMessage,
	type RemoteSignalTransport,
} from "@preact/signals-remote";

import type { workerCounterRemote } from "./contract";
import "./style.css";

type WorkerCounterRemote = RemoteModel<
	RemoteContractModel<typeof workerCounterRemote>,
	RemoteContractActions<typeof workerCounterRemote>
>;

type DemoSession = {
	counter: WorkerCounterRemote;
	runAction(
		action: keyof RemoteContractActions<typeof workerCounterRemote>
	): Promise<void>;
	dispose(): void;
};

function formatEntryList(entries: Array<{ key: string; value: unknown }>) {
	return entries
		.map(entry => `${entry.key}=${JSON.stringify(entry.value)}`)
		.join(", ");
}

function formatRemoteMessage(
	direction: "main->worker" | "worker->main",
	message: RemoteSignalMessage
) {
	switch (message.type) {
		case "subscribe":
		case "unsubscribe":
			return `${direction} ${message.type}(${message.key})`;
		case "snapshot":
		case "update":
			return `${direction} ${message.type}(${message.key}) = ${JSON.stringify(message.value)}`;
		case "error":
			return `${direction} error(${message.key}) ${message.message}`;
		case "unpublished":
			return `${direction} unpublished(${message.key})`;
		case "subscribe-model":
		case "unsubscribe-model":
			return `${direction} ${message.type}(${message.key})`;
		case "model-snapshot":
			return `${direction} model-snapshot(${message.key}) ${formatEntryList(message.entries)}`;
		case "model-patch":
			return `${direction} model-patch(${message.key}) ${formatEntryList(message.updates)}`;
		case "model-error":
			return `${direction} model-error(${message.key}) ${message.message}`;
		case "model-unpublished":
			return `${direction} model-unpublished(${message.key})`;
		case "call-model-action":
			return `${direction} action ${message.key}.${message.action}(${message.args.map(arg => JSON.stringify(arg)).join(", ")})`;
		case "model-action-result":
			return `${direction} action-result(${message.key}#${message.callId}) ${JSON.stringify(message.value)}`;
		case "model-action-error":
			return `${direction} action-error(${message.key}#${message.callId}) ${message.message}`;
	}
}

function createWorkerTransport(
	worker: Worker,
	onTraffic: (line: string) => void
): RemoteSignalTransport {
	return {
		send(message) {
			onTraffic(formatRemoteMessage("main->worker", message));
			worker.postMessage(message);
		},
		subscribe(listener) {
			const handleMessage = (event: MessageEvent<RemoteSignalMessage>) => {
				onTraffic(formatRemoteMessage("worker->main", event.data));
				listener(event.data);
			};

			worker.addEventListener("message", handleMessage as EventListener);

			return () => {
				worker.removeEventListener("message", handleMessage as EventListener);
			};
		},
	};
}

function createSession(onTraffic: (line: string) => void): DemoSession {
	const worker = new Worker(new URL("./worker.ts", import.meta.url), {
		type: "module",
	});
	const transport = createWorkerTransport(worker, onTraffic);
	const client = createRemoteSignalClient(transport);
	const counter = client.model<typeof workerCounterRemote>("worker-counter");

	return {
		counter,
		async runAction(action) {
			onTraffic(`ui invoke ${action}()`);
			try {
				await counter.actions[action]();
			} catch (error) {
				onTraffic(`ui action-error ${action}(): ${String(error)}`);
			}
		},
		dispose() {
			client.dispose();
			worker.terminate();
		},
	};
}

export default function WorkerRemote() {
	const session = useSignal<DemoSession | undefined>(undefined);
	const traffic = useSignal<string[]>([]);

	useEffect(() => {
		const pushTraffic = (line: string) => {
			traffic.value = [line, ...traffic.peek()].slice(0, 12);
		};

		pushTraffic("main: booting worker");
		const nextSession = createSession(pushTraffic);
		session.value = nextSession;

		return () => {
			nextSession.dispose();
			session.value = undefined;
			traffic.value = [];
		};
	}, []);

	const current = session.value;

	if (current === undefined) {
		return <p class="info">Starting the worker-backed signal demo...</p>;
	}

	const state = current.counter.state;
	const ready = current.counter.status.value === "ready" && state !== undefined;

	return (
		<div class="worker-remote">
			<p class="info">
				This demo keeps the source model inside a <code>Web Worker</code>. The
				worker uses <code>createModel()</code> to define a flat object of
				signals and actions, then publishes a typed remote contract. The main
				thread only imports that contract as a type and mirrors the worker state
				over
				<code>postMessage()</code>.
			</p>

			<div class="worker-remote-grid">
				<section class="worker-remote-card">
					<h4>Remote Count</h4>
					<div class="worker-remote-value">
						{ready ? state.count.value : "..."}
					</div>
					<p class="worker-remote-meta">
						Model status: <strong>{current.counter.status.value}</strong>
					</p>
					<p class="worker-remote-meta">
						Action RPC: <strong>{ready ? "ready" : "waiting"}</strong>
					</p>
				</section>

				<section class="worker-remote-card">
					<h4>Worker Status</h4>
					<p class="worker-remote-meta">
						{ready
							? state.status.value
							: "Waiting for the first worker model snapshot..."}
					</p>
					<p class="worker-remote-meta">
						Last worker update:{" "}
						<strong>{ready ? state.updatedAt.value : "--"}</strong>
					</p>
					<p class="worker-remote-meta">
						Timer running:{" "}
						<strong>{ready && state.ticking.value ? "yes" : "no"}</strong>
					</p>
					{current.counter.error.value && (
						<p class="worker-remote-meta">
							Last action error:{" "}
							<strong>{current.counter.error.value.message}</strong>
						</p>
					)}
				</section>
			</div>

			<div class="worker-remote-controls">
				<button onClick={() => void current.runAction("decrement")}>-1</button>
				<button onClick={() => void current.runAction("increment")}>+1</button>
				<button onClick={() => void current.runAction("randomize")}>
					Randomize
				</button>
				<button
					onClick={() =>
						void current.runAction(
							ready && state.ticking.value ? "stop" : "start"
						)
					}
				>
					{ready && state.ticking.value ? "Stop timer" : "Start timer"}
				</button>
				<button onClick={() => void current.runAction("reset")}>Reset</button>
			</div>

			<section class="worker-remote-log">
				<h4>postMessage Traffic</h4>
				<ul>
					{traffic.value.map((line, index) => (
						<li key={`${index}:${line}`}>{line}</li>
					))}
				</ul>
			</section>
		</div>
	);
}
