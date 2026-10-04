import { describe, it, expect } from "vitest";
import {
	asyncComputed,
	computed,
	createModel,
	effect,
	signal,
} from "@preact/signals-core";

function defer<T = void>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function track<T>(dependency: unknown, value: T): T {
	void dependency;
	return value;
}

describe("asyncComputed", () => {
	it("settles synchronous results and tracks dependencies", () => {
		const source = signal(2);
		const result = asyncComputed(() => source.value * 2);

		expect(result.value).to.equal(4);
		expect(result.pending.value).to.equal(false);
		expect(result.error.value).to.equal(undefined);

		source.value = 3;
		expect(result.value).to.equal(6);
	});

	it("exposes pending state until an asynchronous result settles", async () => {
		const deferred = defer<string>();
		const result = asyncComputed(() => deferred.promise);

		expect(result.value).to.equal(undefined);
		expect(result.pending.value).to.equal(true);
		expect(result.settled.value).to.equal(false);
		const settlement = result.settlement;
		expect(settlement).to.be.instanceOf(Promise);

		deferred.resolve("done");
		await settlement;
		expect(result.value).to.equal("done");
		expect(result.pending.value).to.equal(false);
		expect(result.settled.value).to.equal(true);
		expect(result.settlement).to.equal(undefined);
	});

	it("only tracks dependencies read before the first await", async () => {
		const before = signal(1);
		const after = signal(10);
		let deferred = defer();
		let runs = 0;
		const result = asyncComputed(async () => {
			runs++;
			const first = before.value;
			await deferred.promise;
			return first + after.value;
		});

		deferred.resolve();
		await tick();
		expect(result.value).to.equal(11);

		after.value = 20;
		await tick();
		expect(runs).to.equal(1);
		expect(result.value).to.equal(11);

		deferred = defer();
		before.value = 2;
		expect(runs).to.equal(2);
		deferred.resolve();
		await tick();
		expect(result.value).to.equal(22);
	});

	it("ignores stale resolutions when a dependency changes", async () => {
		const source = signal(0);
		const deferreds: ReturnType<typeof defer<number>>[] = [];
		const result = asyncComputed(() => {
			const deferred = defer<number>();
			deferreds.push(deferred);
			return track(source.value, deferred.promise);
		});

		source.value = 1;
		expect(deferreds).to.have.length(2);

		deferreds[1].resolve(200);
		await tick();
		expect(result.value).to.equal(200);
		expect(result.pending.value).to.equal(false);

		deferreds[0].resolve(100);
		await tick();
		expect(result.value).to.equal(200);
	});

	it("retains the last value while revalidating and after errors", async () => {
		const source = signal(1);
		let deferred = defer<number>();
		const result = asyncComputed(() => track(source.value, deferred.promise));

		deferred.resolve(10);
		await tick();
		expect(result.value).to.equal(10);

		deferred = defer();
		source.value = 2;
		expect(result.value).to.equal(10);
		expect(result.pending.value).to.equal(true);

		const error = new Error("boom");
		deferred.reject(error);
		await tick();
		expect(result.value).to.equal(10);
		expect(result.error.value).to.equal(error);
		expect(result.pending.value).to.equal(false);

		deferred = defer();
		source.value = 3;
		deferred.resolve(30);
		await tick();
		expect(result.value).to.equal(30);
		expect(result.error.value).to.equal(undefined);
	});

	it("captures synchronous errors and recovers", () => {
		const shouldThrow = signal(true);
		const error = new Error("boom");
		const result = asyncComputed(() => {
			if (shouldThrow.value) throw error;
			return 42;
		});

		expect(result.error.value).to.equal(error);
		expect(result.value).to.equal(undefined);

		shouldThrow.value = false;
		expect(result.value).to.equal(42);
		expect(result.error.value).to.equal(undefined);
	});

	it("supports undefined as a successful result", async () => {
		const result = asyncComputed(async () => undefined);
		expect(result.pending.value).to.equal(true);
		await tick();
		expect(result.value).to.equal(undefined);
		expect(result.error.value).to.equal(undefined);
		expect(result.pending.value).to.equal(false);
	});

	it("distinguishes an undefined rejection from success", async () => {
		const result = asyncComputed(() => Promise.reject(undefined));
		await result.settlement;
		expect(result.settled.value).to.equal(true);
		expect(result.failed.value).to.equal(true);
		expect(result.error.value).to.equal(undefined);
	});

	it("composes with computeds and effects", async () => {
		const deferred = defer<number>();
		const result = asyncComputed(() => deferred.promise);
		const doubled = computed(() => (result.value ?? 0) * 2);
		const seen: number[] = [];
		const dispose = effect(() => {
			seen.push(doubled.value);
		});

		deferred.resolve(4);
		await tick();
		expect(seen).to.deep.equal([0, 8]);
		dispose();
	});

	it("stops reacting and ignores in-flight results after dispose", async () => {
		const source = signal(1);
		const deferred = defer<number>();
		let runs = 0;
		const result = asyncComputed(() => {
			runs++;
			return track(source.value, deferred.promise);
		});

		const settlement = result.settlement;
		result.dispose();
		expect(result.pending.value).to.equal(false);
		await settlement;
		deferred.resolve(10);
		source.value = 2;
		await tick();
		expect(runs).to.equal(1);
		expect(result.value).to.equal(undefined);
	});

	it("is automatically disposed with its model", async () => {
		const source = signal(1);
		const deferred = defer<number>();
		let runs = 0;
		const AsyncModel = createModel(() => ({
			result: asyncComputed(() => {
				runs++;
				return track(source.value, deferred.promise);
			}),
		}));
		const model = new AsyncModel();

		model[Symbol.dispose]();
		expect(model.result.pending.value).to.equal(false);
		deferred.resolve(10);
		source.value = 2;
		await tick();
		expect(runs).to.equal(1);
		expect(model.result.value).to.equal(undefined);
	});
});
