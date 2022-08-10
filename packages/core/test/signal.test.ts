import { signal, computed, observe } from "@preact/signals-core";

describe("signal", () => {
	it("should return value", () => {
		const v = [1, 2];
		const s = signal(v);
		expect(s.value).to.equal(v);
	});

	it("should support .toString()", () => {
		const s = signal(123);
		expect(s.toString()).equal(123);
	});
});

describe("observe()", () => {
	it("should update on signal change", () => {
		const s = signal(123);
		const spy = sinon.spy();
		observe(s, spy);
		expect(spy).to.have.been.calledWith(123);
	});
});

describe("computed()", () => {
	it("should return value", () => {
		const a = signal("a");
		const b = signal("b");

		const c = computed(() => a.value + b.value);

		const spy = sinon.spy();
		observe(c, spy);
		expect(spy).to.have.been.calledWith("ab");
	});

	it("should return updated value", async () => {
		const a = signal("a");
		const b = signal("b");

		const c = computed(() => a.value + b.value);
		expect(c.value).to.equal("ab");

		a.value = "aa";
		expect(c.value).to.equal("aab");
	});
});
