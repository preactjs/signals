import { describe, expect, it } from "vitest";

import { computed, createModel, effect, signal } from "@preact/signals-core";
import {
	createRemoteSignalClient,
	createRemoteSignalServer,
	createRemoteTransportPair,
	defineRemoteModel,
} from "@preact/signals-remote";

async function flushTransport() {
	await Promise.resolve();
	await Promise.resolve();
}

describe("signals-remote", () => {
	it("mirrors snapshots and updates from the server", async () => {
		const server = createRemoteSignalServer();
		const count = server.createSignal("count", 0);
		const { server: serverTransport, client: clientTransport } =
			createRemoteTransportPair();

		server.attach(serverTransport);

		const client = createRemoteSignalClient(clientTransport);
		const remoteCount = client.signal<number>("count");

		expect(remoteCount.status.value).to.equal("connecting");

		await flushTransport();

		expect(remoteCount.status.value).to.equal("ready");
		expect(remoteCount.value).to.equal(0);

		count.value = 1;
		await flushTransport();

		expect(remoteCount.value).to.equal(1);
		expect(remoteCount.status.value).to.equal("ready");
	});

	it("notifies reactive client effects when the server signal changes", async () => {
		const server = createRemoteSignalServer();
		const count = server.createSignal("count", 1);
		const { server: serverTransport, client: clientTransport } =
			createRemoteTransportPair();

		server.attach(serverTransport);

		const client = createRemoteSignalClient(clientTransport);
		const remoteCount = client.signal<number>("count");
		const observed: Array<number | undefined> = [];

		effect(() => {
			observed.push(remoteCount.value);
		});

		await flushTransport();
		count.value = 2;
		await flushTransport();

		expect(observed).to.deep.equal([undefined, 1, 2]);
	});

	it("stops forwarding updates after the client disposes the remote signal", async () => {
		const server = createRemoteSignalServer();
		const count = server.createSignal("count", 0);
		const { server: serverTransport, client: clientTransport } =
			createRemoteTransportPair();

		server.attach(serverTransport);

		const client = createRemoteSignalClient(clientTransport);
		const remoteCount = client.signal<number>("count");

		await flushTransport();
		remoteCount.dispose();

		count.value = 1;
		await flushTransport();

		expect(remoteCount.status.value).to.equal("disposed");
		expect(remoteCount.value).to.equal(0);
	});

	it("surfaces missing signals as client errors", async () => {
		const server = createRemoteSignalServer();
		const { server: serverTransport, client: clientTransport } =
			createRemoteTransportPair();

		server.attach(serverTransport);

		const client = createRemoteSignalClient(clientTransport);
		const remoteCount = client.signal<number>("missing");

		await flushTransport();

		expect(remoteCount.status.value).to.equal("error");
		expect(remoteCount.error.value?.message).to.equal(
			"Unknown remote signal: missing"
		);
	});

	it("marks a mirrored signal as unpublished when the server removes it", async () => {
		const server = createRemoteSignalServer();
		server.createSignal("count", 0);
		const { server: serverTransport, client: clientTransport } =
			createRemoteTransportPair();

		server.attach(serverTransport);

		const client = createRemoteSignalClient(clientTransport);
		const remoteCount = client.signal<number>("count");

		await flushTransport();
		server.unpublish("count");
		await flushTransport();

		expect(remoteCount.status.value).to.equal("unpublished");
	});

	describe("models", () => {
		it("mirrors a flat model snapshot and updates", async () => {
			const server = createRemoteSignalServer();
			const count = signal(0);
			const updatedAt = signal("never");
			const status = computed(() => `count:${count.value}@${updatedAt.value}`);

			server.publishModel("counter", {
				count,
				updatedAt,
				status,
			});

			const { server: serverTransport, client: clientTransport } =
				createRemoteTransportPair();
			server.attach(serverTransport);

			const client = createRemoteSignalClient(clientTransport);
			const remoteCounter = client.model<{
				count: typeof count;
				updatedAt: typeof updatedAt;
				status: typeof status;
			}>("counter");

			expect(remoteCounter.status.value).to.equal("connecting");
			expect(remoteCounter.state).to.equal(undefined);

			await flushTransport();

			expect(remoteCounter.status.value).to.equal("ready");
			expect(remoteCounter.state?.count.value).to.equal(0);
			expect(remoteCounter.state?.updatedAt.value).to.equal("never");
			expect(remoteCounter.state?.status.value).to.equal("count:0@never");

			count.value = 2;
			updatedAt.value = "now";
			await flushTransport();

			expect(remoteCounter.state?.count.value).to.equal(2);
			expect(remoteCounter.state?.updatedAt.value).to.equal("now");
			expect(remoteCounter.state?.status.value).to.equal("count:2@now");
		});

		it("uses defineRemoteModel contracts for publish and subscribe", async () => {
			const server = createRemoteSignalServer();
			const CounterModel = createModel(() => {
				const count = signal(0);
				return {
					count,
					increment() {
						count.value += 1;
						return count.value;
					},
				};
			});
			const counterRemote = defineRemoteModel("counter", CounterModel);
			const model = new CounterModel();

			server.publishModel(counterRemote, model);

			const { server: serverTransport, client: clientTransport } =
				createRemoteTransportPair();
			server.attach(serverTransport);

			const client = createRemoteSignalClient(clientTransport);
			const remoteCounter = client.model<typeof counterRemote>(counterRemote);

			await flushTransport();

			expect(remoteCounter.status.value).to.equal("ready");
			expect(remoteCounter.state?.count.value).to.equal(0);

			const result = await remoteCounter.actions.increment();
			await flushTransport();

			expect(result).to.equal(1);
			expect(remoteCounter.state?.count.value).to.equal(1);
		});

		it("derives remote actions from model functions and resolves return values", async () => {
			const server = createRemoteSignalServer();
			const CounterModel = createModel(() => {
				const count = signal(0);
				return {
					count,
					add(amount: number) {
						count.value += amount;
						return count.value;
					},
				};
			});
			const model = new CounterModel();

			server.publishModel("counter", model);

			const { server: serverTransport, client: clientTransport } =
				createRemoteTransportPair();
			server.attach(serverTransport);

			const client = createRemoteSignalClient(clientTransport);
			const remoteCounter = client.model<typeof model>("counter");

			await flushTransport();

			const result = await remoteCounter.actions.add(5);
			await flushTransport();

			expect(result).to.equal(5);
			expect(remoteCounter.state?.count.value).to.equal(5);
		});

		it("batches multi-signal model patches into one client reaction", async () => {
			const server = createRemoteSignalServer();
			const CounterModel = createModel(() => {
				const count = signal(0);
				const label = signal("count:0");
				return {
					count,
					label,
					increment() {
						count.value += 1;
						label.value = `count:${count.value}`;
					},
				};
			});
			const model = new CounterModel();

			server.publishModel("counter", model);

			const { server: serverTransport, client: clientTransport } =
				createRemoteTransportPair();
			server.attach(serverTransport);

			const client = createRemoteSignalClient(clientTransport);
			const remoteCounter = client.model<typeof model>("counter");

			const observed: string[] = [];
			effect(() => {
				if (
					remoteCounter.status.value !== "ready" ||
					remoteCounter.state === undefined
				) {
					return;
				}

				observed.push(
					`${remoteCounter.state.count.value}:${remoteCounter.state.label.value}`
				);
			});

			await flushTransport();
			await remoteCounter.actions.increment();
			await flushTransport();

			expect(observed).to.deep.equal(["0:count:0", "1:count:1"]);
		});

		it("rejects remote action failures and surfaces them on the model", async () => {
			const server = createRemoteSignalServer();
			const CounterModel = createModel(() => {
				const count = signal(0);
				return {
					count,
					fail() {
						throw new Error("boom");
					},
				};
			});
			const model = new CounterModel();

			server.publishModel("counter", model);

			const { server: serverTransport, client: clientTransport } =
				createRemoteTransportPair();
			server.attach(serverTransport);

			const client = createRemoteSignalClient(clientTransport);
			const remoteCounter = client.model<typeof model>("counter");

			await flushTransport();

			await expect(remoteCounter.actions.fail()).rejects.toThrow("boom");
			await flushTransport();

			expect(remoteCounter.error.value?.message).to.equal("boom");
			expect(remoteCounter.status.value).to.equal("ready");
		});

		it("marks a mirrored model as unpublished when the server removes it", async () => {
			const server = createRemoteSignalServer();
			const count = signal(0);
			server.publishModel("counter", { count });

			const { server: serverTransport, client: clientTransport } =
				createRemoteTransportPair();
			server.attach(serverTransport);

			const client = createRemoteSignalClient(clientTransport);
			const remoteCounter = client.model<{ count: typeof count }>("counter");

			await flushTransport();
			server.unpublishModel("counter");
			await flushTransport();

			expect(remoteCounter.status.value).to.equal("unpublished");
		});

		it("surfaces missing models as client errors", async () => {
			const server = createRemoteSignalServer();
			const { server: serverTransport, client: clientTransport } =
				createRemoteTransportPair();
			server.attach(serverTransport);

			const client = createRemoteSignalClient(clientTransport);
			const remoteCounter = client.model<{
				count: ReturnType<typeof signal<number>>;
			}>("missing");

			await flushTransport();

			expect(remoteCounter.status.value).to.equal("error");
			expect(remoteCounter.error.value?.message).to.equal(
				"Unknown remote model: missing"
			);
		});

		it("throws when publishing a nested model shape", () => {
			const server = createRemoteSignalServer();

			expect(() => {
				server.publishModel("counter", {
					count: signal(0),
					meta: { updatedAt: signal("now") },
				});
			}).toThrow(/flat objects of signals and functions/);
		});
	});
});
