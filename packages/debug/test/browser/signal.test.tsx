import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	signal,
	computed,
	effect,
	batch,
	ReadonlySignal,
} from "@preact/signals-core";
import { setDebugOptions } from "@preact/signals-debug";

describe("Signal Debug", () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let groupSpy: ReturnType<typeof vi.spyOn>;
	let groupEndSpy: ReturnType<typeof vi.spyOn>;
	let groupCollapsedSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, "log");
		groupSpy = vi.spyOn(console, "group");
		groupCollapsedSpy = vi.spyOn(console, "groupCollapsed");
		groupEndSpy = vi.spyOn(console, "groupEnd");
		setDebugOptions({ grouped: true, enabled: true, spacing: 2 });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Basic Signal Updates", () => {
		it("should log simple signal updates", async () => {
			const count = signal(0, { name: "count" });
			count.subscribe(() => {});
			count.value = 1;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(consoleSpy).toHaveBeenCalledWith("From:", "0");
			expect(consoleSpy).toHaveBeenCalledWith("To:", "1");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered effect: count-subscribe"
			);
			expect(groupEndSpy).toHaveBeenCalledTimes(2);
		});

		it("should handle object values correctly", async () => {
			const user = signal({ name: "John" }, { name: "user" });
			user.subscribe(() => {});
			user.value = { name: "Jane" };

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: user");
			expect(consoleSpy).toHaveBeenCalledWith("From:", '{"name":"John"}');
			expect(consoleSpy).toHaveBeenCalledWith("To:", '{"name":"Jane"}');
		});

		it("should handle undefined and null values", async () => {
			const nullable = signal<string | null>(null, { name: "nullable" });
			nullable.subscribe(() => {});
			nullable.value = "test";

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: nullable");
			expect(consoleSpy).toHaveBeenCalledWith("From:", "null");
			expect(consoleSpy).toHaveBeenCalledWith("To:", "test");
		});
	});

	describe("Computed Signal Updates", () => {
		it("should show cascading updates from computed signals", async () => {
			const count = signal(0, { name: "count" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			doubled.subscribe(() => {});

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled"
			);
			expect(consoleSpy).toHaveBeenCalledWith("  Type: Computed");
		});

		it("should handle nested computed signals", async () => {
			const count = signal(0, { name: "count" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			const message = computed(() => `Value: ${doubled.value}`, {
				name: "message",
			});
			message.subscribe(() => {});

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled"
			);
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"    ↪️ Triggered update: message"
			);
		});

		it("should handle nested computed signals", async () => {
			const count = signal(0, { name: "count" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			const tripled = computed(() => count.value * 3, { name: "tripled" });
			tripled.subscribe(() => {});
			doubled.subscribe(() => {});

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: tripled"
			);
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled"
			);
		});

		it("should handle computeds that depend on multiple signals", async () => {
			const count = signal(0, { name: "count" });
			const count2 = signal(0, { name: "count2" });
			const sum = computed(() => count.value + count2.value, { name: "sum" });
			sum.subscribe(() => {});

			count2.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count2");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: sum"
			);
		});
	});

	describe("Batched Signal Updates", () => {
		it("should show batched signal updates", async () => {
			const count = signal(0, { name: "count" });
			const count2 = signal(0, { name: "count2" });
			const sum = computed(() => count.value + count2.value, { name: "sum" });
			sum.subscribe(() => {});

			batch(() => {
				count.value = 2;
				count2.value = 3;
			});

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: sum"
			);
			expect(consoleSpy).toHaveBeenCalledWith("  Type: Computed");
		});

		it("should show batched signal updates w/ independent subscribers", async () => {
			const count = signal(0, { name: "count" });
			const count2 = signal(0, { name: "count2" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			const doubled2 = computed(() => count2.value * 2, { name: "doubled2" });
			doubled.subscribe(() => {});
			doubled2.subscribe(() => {});

			batch(() => {
				count.value = 2;
				count2.value = 3;
			});

			await new Promise(resolve => setTimeout(resolve, 0));

			// Should have two groups
			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled2"
			);
			expect(consoleSpy).toHaveBeenCalledWith("  Type: Computed");
			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count2");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled"
			);
		});
	});

	describe("Effect Updates", () => {
		it("should show effect updates", async () => {
			const count = signal(0, { name: "count" });
			effect(
				() => {
					count.value;
				},
				{ name: "count-effect" }
			);

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered effect: count-effect"
			);
			expect(groupEndSpy).toHaveBeenCalledTimes(2);
		});

		it("should show effect deep updates", async () => {
			const count = signal(0, { name: "count" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			effect(
				() => {
					doubled.value;
				},
				{ name: "logger" }
			);

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).toHaveBeenCalledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"  ↪️ Triggered update: doubled"
			);
			expect(groupCollapsedSpy).toHaveBeenCalledWith(
				"    ↪️ Triggered effect: logger"
			);
			expect(groupEndSpy).toHaveBeenCalledTimes(3);
		});
	});

	describe("Debug Options", () => {
		it("should respect enabled/disabled setting", async () => {
			const count = signal(0, { name: "count" });
			count.subscribe(() => {});

			setDebugOptions({ enabled: false });
			count.value = 1;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).not.toHaveBeenCalled();
			expect(consoleSpy).not.toHaveBeenCalled();
		});

		it("should support flat logging mode", async () => {
			const count = signal(0, { name: "count" });
			const doubled = computed(() => count.value * 2, { name: "doubled" });
			doubled.subscribe(() => {});

			setDebugOptions({ grouped: false });
			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).not.toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalledWith("🎯 count: 0 → 2");
			expect(consoleSpy).toHaveBeenCalledWith("↪️ doubled: 0 → 4");
		});
	});

	it("should not recompute dependencies unnecessarily", () => {
		const spy = vi.fn();
		const a = signal(0);
		const b = signal(0);
		const c = computed(() => {
			b.value;
			spy();
		});
		effect(() => {
			if (a.value === 0) {
				c.value;
			}
		});
		expect(spy).toHaveBeenCalledOnce();

		batch(() => {
			b.value = 1;
			a.value = 1;
		});
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should be garbage collectable after it has lost all of its listeners", async () => {
		const s = signal(0);

		let ref: WeakRef<ReadonlySignal>;
		let dispose: () => void;
		(function () {
			const c = computed(() => s.value);
			ref = new WeakRef(c);
			dispose = effect(() => {
				c.value;
			});
		})();

		dispose();
		(gc as () => void)();
		await new Promise(resolve => setTimeout(resolve, 0));
		(gc as () => void)();
		expect(ref.deref()).to.be.undefined;
	});

	it("should only subscribe to signals listened to", () => {
		// Here both "B" and "C" are active in the beginning, but
		// "B" becomes inactive later. At that point it should
		// not receive any updates anymore.
		//    *A
		//   /   \
		// *B     D <- we don't listen to C
		//  |
		// *C
		const a = signal("a");
		const spyB = vi.fn(() => a.value);
		const b = computed(spyB);

		const spyC = vi.fn(() => b.value);
		const c = computed(spyC);

		const d = computed(() => a.value);

		let result = "";
		const unsub = effect(() => {
			result = c.value;
		});

		expect(result).to.equal("a");
		expect(d.value).to.equal("a");

		spyB.mockClear();
		spyC.mockClear();
		unsub();

		a.value = "aa";

		expect(spyB).not.toHaveBeenCalled();
		expect(spyC).not.toHaveBeenCalled();
		expect(d.value).to.equal("aa");
	});
});
