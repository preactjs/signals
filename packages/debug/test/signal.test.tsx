import { signal, computed, effect, batch } from "@preact/signals-core";
import { setDebugOptions } from "@preact/signals-debug";
import { SinonSpy } from "sinon";

describe("Signal Debug", () => {
	let consoleSpy: SinonSpy;
	let groupSpy: SinonSpy;
	let groupEndSpy: SinonSpy;
	let groupCollapsedSpy: SinonSpy;

	beforeEach(() => {
		consoleSpy = sinon.spy(console, "log");
		groupSpy = sinon.spy(console, "group");
		groupCollapsedSpy = sinon.spy(console, "groupCollapsed");
		groupEndSpy = sinon.spy(console, "groupEnd");
		setDebugOptions({ grouped: true, enabled: true });
	});

	afterEach(() => {
		consoleSpy.restore();
		groupSpy.restore();
		groupCollapsedSpy.restore();
		groupEndSpy.restore();
	});

	describe("Basic Signal Updates", () => {
		it("should log simple signal updates", async () => {
			const count = signal(0, "count");
			count.subscribe(() => {});
			count.value = 1;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(consoleSpy).to.be.calledWith("From:", "0");
			expect(consoleSpy).to.be.calledWith("To:", "1");
			expect(groupEndSpy).to.be.calledOnce;
		});

		it("should handle object values correctly", async () => {
			const user = signal({ name: "John" }, "user");
			user.subscribe(() => {});
			user.value = { name: "Jane" };

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: user");
			expect(consoleSpy).to.be.calledWith("From:", '{"name":"John"}');
			expect(consoleSpy).to.be.calledWith("To:", '{"name":"Jane"}');
		});

		it("should handle undefined and null values", async () => {
			const nullable = signal<string | null>(null, "nullable");
			nullable.subscribe(() => {});
			nullable.value = "test";

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: nullable");
			expect(consoleSpy).to.be.calledWith("From:", "null");
			expect(consoleSpy).to.be.calledWith("To:", "test");
		});
	});

	describe("Computed Signal Updates", () => {
		it("should show cascading updates from computed signals", async () => {
			const count = signal(0, "count");
			const doubled = computed(() => count.value * 2, "doubled");
			doubled.subscribe(() => {});

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).to.be.calledWith(
				"  ↪️ Triggered update: doubled"
			);
			expect(consoleSpy).to.be.calledWith("  Type: Computed");
		});

		it("should handle nested computed signals", async () => {
			const count = signal(0, "count");
			const doubled = computed(() => count.value * 2, "doubled");
			const message = computed(() => `Value: ${doubled.value}`, "message");
			message.subscribe(() => {});

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).to.be.calledWith(
				"  ↪️ Triggered update: doubled"
			);
			expect(groupCollapsedSpy).to.be.calledWith(
				"    ↪️ Triggered update: message"
			);
		});

		it("should handle nested computed signals", async () => {
			const count = signal(0, "count");
			const doubled = computed(() => count.value * 2, "doubled");
			const tripled = computed(() => count.value * 3, "tripled");
			tripled.subscribe(() => {});
			doubled.subscribe(() => {});

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).to.be.calledWith(
				"  ↪️ Triggered update: tripled"
			);
			expect(groupCollapsedSpy).to.be.calledWith(
				"  ↪️ Triggered update: doubled"
			);
		});

		it("should handle computeds that depend on multiple signals", async () => {
			const count = signal(0, "count");
			const count2 = signal(0, "count2");
			const sum = computed(() => count.value + count2.value, "sum");
			sum.subscribe(() => {});

			count2.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count2");
			expect(groupCollapsedSpy).to.be.calledWith("  ↪️ Triggered update: sum");
		});
	});

	describe("Batched Signal Updates", () => {
		it("should show batched signal updates", async () => {
			const count = signal(0, "count");
			const count2 = signal(0, "count2");
			const sum = computed(() => count.value + count2.value, "sum");
			sum.subscribe(() => {});

			batch(() => {
				count.value = 2;
				count2.value = 3;
			});

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).to.be.calledWith("  ↪️ Triggered update: sum");
			expect(consoleSpy).to.be.calledWith("  Type: Computed");
		});

		it("should show batched signal updates w/ independent subscribers", async () => {
			const count = signal(0, "count");
			const count2 = signal(0, "count2");
			const doubled = computed(() => count.value * 2, "doubled");
			const doubled2 = computed(() => count2.value * 2, "doubled2");
			doubled.subscribe(() => {});
			doubled2.subscribe(() => {});

			batch(() => {
				count.value = 2;
				count2.value = 3;
			});

			await new Promise(resolve => setTimeout(resolve, 0));

			// Should have two groups
			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).to.be.calledWith(
				"  ↪️ Triggered update: doubled2"
			);
			expect(consoleSpy).to.be.calledWith("  Type: Computed");
			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count2");
			expect(groupCollapsedSpy).to.be.calledWith(
				"  ↪️ Triggered update: doubled"
			);
		});
	});

	describe("Effect Updates", () => {
		it("should show effect updates", async () => {
			const count = signal(0, "count");
			effect(() => {
				count.value;
			}, "count-effect");

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).to.be.calledWith(
				"  ↪️ Triggered effect: count-effect"
			);
			expect(groupEndSpy).to.be.calledTwice;
		});

		it("should show effect deep updates", async () => {
			const count = signal(0, "count");
			const doubled = computed(() => count.value * 2, "doubled");
			effect(() => {
				doubled.value;
			}, "logger");

			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupCollapsedSpy).to.be.calledWith(
				"  ↪️ Triggered update: doubled"
			);
			expect(groupCollapsedSpy).to.be.calledWith(
				"    ↪️ Triggered effect: logger"
			);
			expect(groupEndSpy).to.be.calledThrice;
		});
	});

	describe("Debug Options", () => {
		it("should respect enabled/disabled setting", async () => {
			const count = signal(0, "count");
			count.subscribe(() => {});

			setDebugOptions({ enabled: false });
			count.value = 1;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.not.be.called;
			expect(consoleSpy).to.not.be.called;
		});

		it("should support flat logging mode", async () => {
			const count = signal(0, "count");
			const doubled = computed(() => count.value * 2, "doubled");
			doubled.subscribe(() => {});

			setDebugOptions({ grouped: false });
			count.value = 2;

			await new Promise(resolve => setTimeout(resolve, 0));

			expect(groupSpy).to.not.be.called;
			expect(consoleSpy).to.be.calledWith("🎯 count: 0 → 2");
			expect(consoleSpy).to.be.calledWith("↪️ doubled: 0 → 4");
		});
	});
});
