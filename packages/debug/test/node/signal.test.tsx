import { signal, computed, effect } from "../../../core/src/index";
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
