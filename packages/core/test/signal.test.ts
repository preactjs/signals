import { signal, computed, observe, _dumpTree } from "@preact/signals-core";

describe("signal", () => {
	it("should return value", () => {
		const v = [1, 2];
		const s = signal(v);
		expect(s.value).to.equal(v);
	});

	it("should support .toString()", () => {
		const s = signal(123);
		expect(s.toString()).equal("123");
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
		observe(c, () => {});
		expect(c.value).to.equal("ab");

		a.value = "aa";
		expect(c.value).to.equal("aab");
	});

	it("should conditionally unsubscribe from signals", () => {
		const a = signal("a");
		const b = signal("b");
		const cond = signal(true);

		const spy = sinon.spy(() => {
			return cond.value ? a.value : b.value;
		});

		const c = computed(spy);
		observe(c, () => {});
		expect(c.value).to.equal("a");
		expect(spy).to.be.calledOnce;

		b.value = "bb";
		expect(c.value).to.equal("a");
		expect(spy).to.be.calledOnce;

		cond.value = false;
		expect(c.value).to.equal("bb");
		expect(spy).to.be.calledTwice;

		spy.resetHistory();

		a.value = "aaa";
		expect(c.value).to.equal("bb");
		expect(spy).not.to.be.called;
	});

	describe("graph updates", () => {
		it("should run computeds once for multiple dep changes", async () => {
			const a = signal("a");
			const b = signal("b");

			const compute = sinon.spy(() => {
				// debugger;
				return a.value + b.value;
			});
			const c = computed(compute);

			observe(c, () => {});
			expect(c.value).to.equal("ab");
			expect(compute).to.have.been.calledOnce;
			compute.resetHistory();

			a.value = "aa";
			expect(compute).to.have.been.calledOnce;
		});

		it("should drop A->B->A updates", async () => {
			const a = signal(2);

			const b = computed(() => a.value - 1);
			const c = computed(() => a.value + 1);

			const d = computed(() => a.value + b.value);

			const compute = sinon.spy(() => "d: " + d.value);
			const e = computed(compute);

			expect(compute).to.have.been.calledOnce;
			compute.resetHistory();

			a.value = 4;

			expect(compute).to.have.been.calledOnce;
		});

		it("should only update every signal once (diamond graph)", () => {
			// In this scenario "D" should only update once when "A" receives
			// an update. This is sometimes referred to as the "diamond" scenario.
			//     A
			//   /   \
			//  B     C
			//   \   /
			//     D
			const a = signal("a");
			const b = computed(() => a.value);
			const c = computed(() => a.value);

			const spy = sinon.spy(() => b.value + " " + c.value);
			const d = computed(spy);

			observe(d, () => {});
			expect(d.value).to.equal("a a");
			expect(spy).to.be.calledOnce;

			a.value = "aa";
			expect(d.value).to.equal("aa aa");
			expect(spy).to.be.calledTwice;
		});

		it.only("should only update every signal once (diamond graph + tail)", () => {
			// "E" will be likely updated twice if our mark+sweep logic is buggy.
			//     A
			//   /   \
			//  B     C
			//   \   /
			//     D
			//     |
			//     E
			const a = signal("a");
			a.displayName = "A";
			const b = computed(() => a.value);
			b.displayName = "B";
			const c = computed(() => a.value);
			c.displayName = "C";

			const d = computed(() => b.value + " " + c.value);
			d.displayName = "D";

			const spy = sinon.spy(() => d.value);
			const e = computed(spy);
			e.displayName = "E";

			observe(e, () => {});
			_dumpTree(e);

			expect(e.value).to.equal("a a");
			expect(spy).to.be.calledOnce;

			console.log("================================");
			a.value = "aa";
			expect(e.value).to.equal("aa aa");
			expect(spy).to.be.calledTwice;
		});

		it("should bail out if result is the same", () => {
			// Bail out if value of "B" never changes
			// A->B->C
			const a = signal("a");
			a.displayName = "A";
			const b = computed(() => {
				a.value;
				return "foo";
			});
			b.displayName = "B";

			const spy = sinon.spy(() => b.value);
			const c = computed(spy);
			c.displayName = "C";

			observe(c, () => {});
			console.log("================================");
			expect(c.value).to.equal("foo");
			expect(spy).to.be.calledOnce;

			a.value = "aa";
			console.log("================================");
			expect(c.value).to.equal("foo");
			expect(spy).to.be.calledOnce;
		});

		it("should not create subscriptions when nobody subscribed", () => {
			// We only listen to "C", so "D" should never be updated
			//     A
			//   /   \
			//  B     D
			//  |
			//  C*
			const a = signal("a");
			a.displayName = "A";
			const b = computed(() => a.value);
			b.displayName = "B";
			const c = computed(() => b.value);
			c.displayName = "C";

			const spy = sinon.spy(() => a.value);
			const d = computed(spy);
			d.displayName = "D";

			observe(c, () => {});
			expect(c.value).to.equal("a");
			expect(spy).not.to.be.called;

			a.value = "aa";
			expect(spy).not.to.be.called;
		});
	});
});
