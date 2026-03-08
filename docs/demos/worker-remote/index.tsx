import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import {
	createRemoteSignalClient,
	type RemoteSignal,
	type RemoteSignalMessage,
	type RemoteSignalTransport,
} from "@preact/signals-remote";

import type { WorkerCommand, WorkerEnvelope } from "./shared";
import "./style.css";

type DemoSession = {
	count: RemoteSignal<number>;
	status: RemoteSignal<string>;
	ticking: RemoteSignal<boolean>;
	updatedAt: RemoteSignal<string>;
	send(command: WorkerCommand): void;
	dispose(): void;
};

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
	}
}

function createWorkerTransport(
	worker: Worker,
	onTraffic: (line: string) => void
): RemoteSignalTransport {
	return {
		send(message) {
			onTraffic(formatRemoteMessage("main->worker", message));
			worker.postMessage({ kind: "remote", message } satisfies WorkerEnvelope);
		},
		subscribe(listener) {
			const handleMessage = (event: MessageEvent<WorkerEnvelope>) => {
				if (event.data?.kind !== "remote") {
					return;
				}

				onTraffic(formatRemoteMessage("worker->main", event.data.message));
				listener(event.data.message);
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

	const count = client.signal<number>("count");
	const status = client.signal<string>("status");
	const ticking = client.signal<boolean>("ticking");
	const updatedAt = client.signal<string>("updatedAt");

	return {
		count,
		status,
		ticking,
		updatedAt,
		send(command) {
			onTraffic(`main->worker command.${command.type}`);
			worker.postMessage({ kind: "command", command } satisfies WorkerEnvelope);
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
			traffic.value = [line, ...traffic.peek()].slice(0, 10);
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

	const ready =
		current.count.ready.value &&
		current.status.ready.value &&
		current.ticking.ready.value &&
		current.updatedAt.ready.value;

	return (
		<div class="worker-remote">
			<p class="info">
				This demo keeps the source signals inside a <code>Web Worker</code>. The
				main thread mirrors them with <code>@preact/signals-remote</code> over
				the worker&apos;s <code>postMessage()</code> boundary.
			</p>

			<div class="worker-remote-grid">
				<section class="worker-remote-card">
					<h4>Remote Count</h4>
					<div class="worker-remote-value">
						{ready ? current.count.value : "..."}
					</div>
					<p class="worker-remote-meta">
						Main thread subscription state:{" "}
						<strong>{current.count.status}</strong>
					</p>
				</section>

				<section class="worker-remote-card">
					<h4>Worker Status</h4>
					<p class="worker-remote-meta">
						{ready
							? current.status.value
							: "Waiting for the first worker snapshot..."}
					</p>
					<p class="worker-remote-meta">
						Last worker update:{" "}
						<strong>{ready ? current.updatedAt.value : "--"}</strong>
					</p>
					<p class="worker-remote-meta">
						Timer running:{" "}
						<strong>{current.ticking.value ? "yes" : "no"}</strong>
					</p>
				</section>
			</div>

			<div class="worker-remote-controls">
				<button onClick={() => current.send({ type: "decrement" })}>-1</button>
				<button onClick={() => current.send({ type: "increment" })}>+1</button>
				<button onClick={() => current.send({ type: "randomize" })}>
					Randomize
				</button>
				<button
					onClick={() =>
						current.send({ type: current.ticking.value ? "stop" : "start" })
					}
				>
					{current.ticking.value ? "Stop timer" : "Start timer"}
				</button>
				<button onClick={() => current.send({ type: "reset" })}>Reset</button>
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
