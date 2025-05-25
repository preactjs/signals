import { signal, computed, effect, batch } from "../../../core/src/index";
import { setDebugOptions } from "../../src/index";
import { SinonSpy } from "sinon";

describe.only("Signal Debug", () => {
	let consoleSpy: SinonSpy;
	let groupSpy: SinonSpy;
	let groupEndSpy: SinonSpy;

	beforeEach(() => {
		consoleSpy = sinon.spy(console, "log");
		groupSpy = sinon.spy(console, "group");
		groupEndSpy = sinon.spy(console, "groupEnd");
		setDebugOptions({ grouped: true, enabled: true });
	});

	afterEach(() => {
		consoleSpy.restore();
		groupSpy.restore();
		groupEndSpy.restore();
	});

	describe("Basic Signal Updates", () => {
		it("should log simple signal updates", () => {
			const count = signal(0, "count");
			count.subscribe(() => {});
			count.value = 1;

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(consoleSpy).to.be.calledWith("From:", "0");
			expect(consoleSpy).to.be.calledWith("To:", "1");
			expect(groupEndSpy).to.be.calledOnce;
		});

		it("should handle object values correctly", () => {
			const user = signal({ name: "John" }, "user");
			user.subscribe(() => {});
			user.value = { name: "Jane" };

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: user");
			expect(consoleSpy).to.be.calledWith("From:", '{"name":"John"}');
			expect(consoleSpy).to.be.calledWith("To:", '{"name":"Jane"}');
		});

		it("should handle undefined and null values", () => {
			const nullable = signal<string | null>(null, "nullable");
			nullable.subscribe(() => {});
			nullable.value = "test";

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: nullable");
			expect(consoleSpy).to.be.calledWith("From:", "null");
			expect(consoleSpy).to.be.calledWith("To:", "test");
		});
	});

	describe.skip("Batched Signal Updates", () => {
		it("should show batched signal updates", () => {
			const count = signal(0, "count");
			const count2 = signal(0, "count2");
			const sum = computed(() => count.value + count2.value, "sum");
			sum.subscribe(() => {});

			batch(() => {
				count.value = 2;
				count2.value = 3;
			});

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupSpy).to.be.calledWith("  ↪️ Triggered update: sum");
			expect(consoleSpy).to.be.calledWith("  Type: Computed");
		});

		it("should show batched signal updates w/ independent subscribers", () => {
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

			// Should have two groups
			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupSpy).to.be.calledWith("  ↪️ Triggered update: sum");
			expect(consoleSpy).to.be.calledWith("  Type: Computed");
		});
	});

	describe.skip("Effect Updates", () => {
		it("should show effect updates", () => {
			const count = signal(0, "count");
			const doubled = computed(() => count.value * 2, "doubled");
			effect(() => {
				doubled.value;
			});

			count.value = 2;

			expect(groupSpy).to.be.calledWith("🎯 Effect Update: doubled");
			expect(consoleSpy).to.be.calledWith("  Type: Effect");
			expect(groupEndSpy).to.be.calledOnce;
		});
	});

	describe("Computed Signal Updates", () => {
		it("should show cascading updates from computed signals", () => {
			const count = signal(0, "count");
			const doubled = computed(() => count.value * 2, "doubled");
			doubled.subscribe(() => {});

			count.value = 2;

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupSpy).to.be.calledWith("  ↪️ Triggered update: doubled");
			expect(consoleSpy).to.be.calledWith("  Type: Computed");
		});

		it("should handle nested computed signals", () => {
			const count = signal(0, "count");
			const doubled = computed(() => count.value * 2, "doubled");
			const message = computed(() => `Value: ${doubled.value}`, "message");
			message.subscribe(() => {});

			count.value = 2;

			expect(groupSpy).to.be.calledWith("🎯 Signal Update: count");
			expect(groupSpy).to.be.calledWith("  ↪️ Triggered update: doubled");
			expect(groupSpy).to.be.calledWith("    ↪️ Triggered update: message");
		});
	});

	describe("Debug Options", () => {
		it("should respect enabled/disabled setting", () => {
			const count = signal(0, "count");
			count.subscribe(() => {});

			setDebugOptions({ enabled: false });
			count.value = 1;

			expect(groupSpy).to.not.be.called;
			expect(consoleSpy).to.not.be.called;
		});

		it("should support flat logging mode", () => {
			const count = signal(0, "count");
			const doubled = computed(() => count.value * 2, "doubled");
			doubled.subscribe(() => {});

			setDebugOptions({ grouped: false });
			count.value = 2;

			expect(groupSpy).to.not.be.called;
			expect(consoleSpy).to.be.calledWith("🎯 count: 0 → 2");
			expect(consoleSpy).to.be.calledWith("↪️ doubled: 0 → 4");
		});
	});
});
