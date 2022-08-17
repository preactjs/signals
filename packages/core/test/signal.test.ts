import { signal, computed, observe, batch } from "@preact/signals-core";

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

			expect(d.value).to.equal("a a");
			expect(spy).to.be.calledOnce;

			a.value = "aa";
			expect(d.value).to.equal("aa aa");
			expect(spy).to.be.calledTwice;
		});

		it("should only update every signal once (diamond graph + tail)", () => {
			// "E" will be likely updated twice if our mark+sweep logic is buggy.
			//     A
			//   /   \
			//  B     C
			//   \   /
			//     D
			//     |
			//     E
			const a = signal("a");
			const b = computed(() => a.value);
			const c = computed(() => a.value);

			const d = computed(() => b.value + " " + c.value);

			const spy = sinon.spy(() => d.value);
			const e = computed(spy);

			expect(e.value).to.equal("a a");
			expect(spy).to.be.calledOnce;

			a.value = "aa";
			expect(e.value).to.equal("aa aa");
			expect(spy).to.be.calledTwice;
		});

		it("should bail out if result is the same", () => {
			// Bail out if value of "B" never changes
			// A->B->C
			const a = signal("a");
			const b = computed(() => {
				a.value;
				return "foo";
			});

			const spy = sinon.spy(() => b.value);
			const c = computed(spy);

			expect(c.value).to.equal("foo");
			expect(spy).to.be.calledOnce;

			a.value = "aa";
			expect(c.value).to.equal("foo");
			expect(spy).to.be.calledOnce;
		});

		it("should only update every signal once (jagged diamond graph + tails)", () => {
			// "F" and "G" will be likely updated twice if our mark+sweep logic is buggy.
			//     A
			//   /   \
			//  B     C
			//  |     |
			//  |     D
			//   \   /
			//     E
			//   /   \
			//  F     G
			const a = signal("a");

			const b = computed(() => a.value);
			const c = computed(() => a.value);

			const d = computed(() => c.value);

			const eSpy = sinon.spy(() => b.value + " " + d.value);
			const e = computed(eSpy);

			const fSpy = sinon.spy(() => e.value);
			const f = computed(fSpy);
			const gSpy = sinon.spy(() => e.value);
			const g = computed(gSpy);

			expect(f.value).to.equal("a a");
			expect(fSpy).to.be.calledOnce;

			expect(g.value).to.equal("a a");
			expect(gSpy).to.be.calledOnce;

			eSpy.resetHistory();
			fSpy.resetHistory();
			gSpy.resetHistory();

			a.value = "b";

			expect(e.value).to.equal("b b");
			expect(eSpy).to.be.calledOnce;

			expect(f.value).to.equal("b b");
			expect(fSpy).to.be.calledOnce;

			expect(g.value).to.equal("b b");
			expect(gSpy).to.be.calledOnce;

			eSpy.resetHistory();
			fSpy.resetHistory();
			gSpy.resetHistory();

			a.value = "c";

			expect(e.value).to.equal("c c");
			expect(eSpy).to.be.calledOnce;

			expect(f.value).to.equal("c c");
			expect(fSpy).to.be.calledOnce;

			expect(g.value).to.equal("c c");
			expect(gSpy).to.be.calledOnce;

			// top to bottom
			expect(eSpy).to.have.been.calledBefore(fSpy);
			// right to left
			expect(fSpy).to.have.been.calledBefore(gSpy);
		});
	});

	describe("error handling", () => {
		it("should keep graph consistent on errors in computeds", () => {
			const a = signal(0);
			let shouldThrow = false;
			const b = computed(() => {
				if (shouldThrow) throw new Error("fail");
				return a.value;
			});
			const c = computed(() => b.value);
			expect(c.value).to.equal(0);

			shouldThrow = true;
			let error: Error | null = null;
			try {
				a.value = 1;
			} catch (err: any) {
				error = err;
			}
			expect(error?.message).to.equal("fail");

			// Now update signal again without throwing an error. If we didn't
			// reset the subtree's PENDING counter C's value wouldn't update.
			shouldThrow = false;
			a.value = 2;
			expect(c.value).to.equal(2);
		});

		it("should revert subscriptions on errors in computeds", () => {
			const a = signal(1);
			const b = signal(1);
			const c = signal(1);
			let shouldThrow = false;
			const compute = sinon.spy(() => {
				if (shouldThrow) {
					throw new Error("fail: " + c.value);
				}
				return a.value + b.value;
			});
			const d = computed(compute);
			expect(d.value).to.equal(2);

			shouldThrow = true;
			expect(() => {
				a.value = 2;
			}).to.throw();
			expect(d.value).to.equal(2);

			// when errors occur, we intentionally over-subscribe.
			// This includes retaining subscriptions after the error:
			compute.resetHistory();
			try {
				b.value = 2;
			} catch (e) {
				// may error, but not in a way we can assert over
			}
			expect(compute).to.have.been.called;

			compute.resetHistory();
			shouldThrow = false;
			// Note: b.value=2 should probably also update the subgraph.
			// ...but its value is already 2 from the errored computation.
			// b.value = 2;
			c.value = 2;
			expect(compute).to.have.been.called;
			expect(d.value).to.equal(4);
		});
	});
});

describe("batch/transaction", () => {
	it("should delay writes", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = sinon.spy(() => a.value + " " + b.value);
		const c = computed(spy);
		spy.resetHistory();

		batch(() => {
			a.value = "aa";
			b.value = "bb";
		});

		expect(c.value).to.equal("aa bb");
		expect(spy).to.be.calledOnce;
	});

	it("should delay writes until outermost batch is complete", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = sinon.spy(() => a.value + ", " + b.value);
		const c = computed(spy);
		spy.resetHistory();

		batch(() => {
			batch(() => {
				a.value += " inner";
				b.value += " inner";
			});
			a.value += " outer";
			b.value += " outer";
		});

		expect(c.value).to.equal("a inner outer, b inner outer");
		// If the inner batch() would have flushed the update
		// this spy would've been called twice.
		expect(spy).to.be.calledOnce;
	});

	it("should read signals written to", () => {
		const a = signal("a");

		let result = "";
		batch(() => {
			a.value = "aa";
			result = a.value;
		});

		expect(result).to.equal("aa");
	});

	it("should read computed signals with updated source signals", () => {
		// A->B->C->D->E
		const a = signal("a");
		const b = computed(() => a.value);

		const spyC = sinon.spy(() => b.value);
		const c = computed(spyC);

		const spyD = sinon.spy(() => c.value);
		const d = computed(spyD);

		const spyE = sinon.spy(() => b.value);
		const e = computed(spyE);

		spyC.resetHistory();
		spyD.resetHistory();
		spyE.resetHistory();

		let result = "";
		batch(() => {
			a.value = "aa";
			result = c.value;

			// Since "D" isn't accessed during batching, we should not
			// update it, only after batching has completed
			expect(spyD).not.to.be.called;
		});

		expect(result).to.equal("aa");
		expect(d.value).to.equal("aa");
		expect(e.value).to.equal("aa");
		expect(spyC).to.be.calledOnce;
		expect(spyD).to.be.calledOnce;
		expect(spyE).to.be.calledOnce;
	});
});
