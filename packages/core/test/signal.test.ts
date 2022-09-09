import { signal, computed, effect, batch } from "@preact/signals-core";

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

	describe(".peek()", () => {
		it("should get value", () => {
			const s = signal(1);
			expect(s.peek()).equal(1);
		});

		it("should not trigger a read", () => {
			const s = signal(1);

			const spy = sinon.spy(() => {
				// When we trigger a read this would cause an infinite loop
				s.peek();
			});

			effect(spy);

			s.value = 2;

			expect(spy).to.be.calledOnce;
		});

		it("should refresh value if stale", () => {
			const a = signal(1);
			const b = computed(() => a.value);

			const dispose = effect(() => {
				b.value;
			});

			dispose();
			a.value = 2;

			expect(b.peek()).to.equal(2);
		});
	});
});

describe("effect()", () => {
	it("should init with value", () => {
		const s = signal(123);
		const spy = sinon.spy(() => s.value);
		effect(spy);

		expect(spy).to.be.called;
		expect(spy).to.returned(123);
	});

	it("should subscribe to signals", () => {
		const s = signal(123);
		const spy = sinon.spy(() => s.value);
		effect(spy);
		spy.resetHistory();

		s.value = 42;
		expect(spy).to.be.called;
		expect(spy).to.returned(42);
	});

	it("should subscribe to multiple signals", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = sinon.spy(() => a.value + " " + b.value);
		effect(spy);
		spy.resetHistory();

		a.value = "aa";
		b.value = "bb";
		expect(spy).to.returned("aa bb");
	});

	it("should dispose of subscriptions", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = sinon.spy(() => a.value + " " + b.value);
		const dispose = effect(spy);
		spy.resetHistory();

		dispose();
		expect(spy).not.to.be.called;

		a.value = "aa";
		b.value = "bb";
		expect(spy).not.to.be.called;
	});

	it("should unsubscribe from signal", () => {
		const s = signal(123);
		const spy = sinon.spy(() => s.value);
		const unsub = effect(spy);
		spy.resetHistory();

		unsub();
		s.value = 42;
		expect(spy).not.to.be.called;
	});

	it("should batch writes", () => {
		const a = signal("a");
		const spy = sinon.spy(() => a.value);
		effect(spy);
		spy.resetHistory();

		effect(() => {
			a.value = "aa";
			a.value = "aaa";
		});

		expect(spy).to.be.calledOnce;
	});

	it("should throw on cycles", () => {
		const a = signal(0);
		let i = 0;

		const fn = () =>
			effect(() => {
				// Prevent test suite from spinning if limit is not hit
				if (i++ > 10) {
					throw new Error("test failed");
				}
				a.value;
				a.value = NaN;
			});

		expect(fn).to.throw(/Cycle detected/);
	});
});

describe("computed()", () => {
	it("should return value", () => {
		const a = signal("a");
		const b = signal("b");

		const c = computed(() => a.value + b.value);
		expect(c.value).to.equal("ab");
	});

	it("should return updated value", () => {
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
			expect(c.value).to.equal("aab");
			expect(compute).to.have.been.calledOnce;
		});

		it("should drop A->B->A updates", async () => {
			const a = signal(2);

			const b = computed(() => a.value - 1);
			const c = computed(() => a.value + 1);

			const d = computed(() => a.value + b.value);

			const compute = sinon.spy(() => "d: " + d.value);
			const e = computed(compute);

			// Trigger read
			e.value;
			expect(compute).to.have.been.calledOnce;
			compute.resetHistory();

			a.value = 4;
			e.value;
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

		it("should only subscribe to signals listened to", () => {
			//    *A
			//   /   \
			// *B     C <- we don't listen to C
			const a = signal("a");

			const b = computed(() => a.value);
			const spy = sinon.spy(() => a.value);
			computed(spy);

			expect(b.value).to.equal("a");
			expect(spy).not.to.be.called;

			a.value = "aa";
			expect(b.value).to.equal("aa");
			expect(spy).not.to.be.called;
		});

		it("should only subscribe to signals listened to", () => {
			// Here both "B" and "C" are active in the beginnning, but
			// "B" becomes inactive later. At that point it should
			// not receive any updates anymore.
			//    *A
			//   /   \
			// *B     D <- we don't listen to C
			//  |
			// *C
			const a = signal("a");
			const spyB = sinon.spy(() => a.value);
			const b = computed(spyB);

			const spyC = sinon.spy(() => b.value);
			const c = computed(spyC);

			const d = computed(() => a.value);

			let result = "";
			const unsub = effect(() => (result = c.value));

			expect(result).to.equal("a");
			expect(d.value).to.equal("a");

			spyB.resetHistory();
			spyC.resetHistory();
			unsub();

			a.value = "aa";

			expect(spyB).not.to.be.called;
			expect(spyC).not.to.be.called;
			expect(d.value).to.equal("aa");
		});

		it("should ensure subs update even if one dep unmarks it", () => {
			// In this scenario "C" always returns the same value. When "A"
			// changes, "B" will update, then "C" at which point its update
			// to "D" will be unmarked. But "D" must still update because
			// "B" marked it. If "D" isn't updated, then we have a bug.
			//     A
			//   /   \
			//  B     *C <- returns same value every time
			//   \   /
			//     D
			const a = signal("a");
			const b = computed(() => a.value);
			const c = computed(() => {
				a.value;
				return "c";
			});
			const spy = sinon.spy(() => b.value + " " + c.value);
			const d = computed(spy);
			expect(d.value).to.equal("a c");
			spy.resetHistory();

			a.value = "aa";
			d.value;
			expect(spy).to.returned("aa c");
		});

		it("should ensure subs update even if two deps unmark it", () => {
			// In this scenario both "C" and "D" always return the same
			// value. But "E" must still update because "A"  marked it.
			// If "E" isn't updated, then we have a bug.
			//     A
			//   / | \
			//  B *C *D
			//   \ | /
			//     E
			const a = signal("a");
			const b = computed(() => a.value);
			const c = computed(() => {
				a.value;
				return "c";
			});
			const d = computed(() => {
				a.value;
				return "d";
			});
			const spy = sinon.spy(() => b.value + " " + c.value + " " + d.value);
			const e = computed(spy);
			expect(e.value).to.equal("a c d");
			spy.resetHistory();

			a.value = "aa";
			e.value;
			expect(spy).to.returned("aa c d");
		});
	});

	describe("error handling", () => {
		it("should throw when writing to computeds", () => {
			const a = signal("a");
			const b = computed(() => a.value);
			const fn = () => ((b as any).value = "aa");
			expect(fn).to.throw(/readonly/);
		});

		it("should keep graph consistent on errors during activation", () => {
			const a = signal(0);
			const b = computed(() => {
				throw new Error("fail");
			});
			const c = computed(() => a.value);
			expect(() => b.value).to.throw("fail");

			a.value = 1;
			expect(c.value).to.equal(1);
		});

		it("should keep graph consistent on errors in computeds", () => {
			const a = signal(0);
			const shouldThrow = signal(false);

			const b = computed(() => {
				if (shouldThrow.value) throw new Error("fail");
				return a.value;
			});

			const c = computed(() => b.value);
			expect(c.value).to.equal(0);

			// Update it so that c will now throw
			batch(() => {
				shouldThrow.value = true;
				a.value = 1;
			});

			// Verify that c throws
			let error: Error | null = null;
			try {
				c.value;
			} catch (err: any) {
				error = err;
			}
			expect(error?.message).to.equal("fail");

			// Make sure that c always rethrows whenever accessing its value
			error = null;
			try {
				c.value;
			} catch (err: any) {
				error = err;
			}
			expect(error?.message).to.equal("fail");

			// Update it so that c no longer throws
			batch(() => {
				shouldThrow.value = false;
				a.value = 2;
			});

			expect(c.value).to.equal(2);
		});

		it("should revert subscriptions on errors in computeds", () => {
			const a = signal(1);
			const b = signal(1);
			const c = signal(1);
			const shouldThrow = signal(false);

			const compute = sinon.spy(() => {
				if (shouldThrow.value) {
					throw new Error("fail: " + c.value);
				}
				return a.value + b.value;
			});
			const d = computed(compute);
			expect(d.value).to.equal(2);

			batch(() => {
				shouldThrow.value = true;
				a.value = 2;
			});

			expect(() => {
				d.value;
			}).to.throw();

			expect(compute).to.have.been.called;

			compute.resetHistory();

			expect(() => {
				b.value = 2;
				d.value;
			}).to.throw();

			expect(compute).to.have.not.been.called;

			compute.resetHistory();

			batch(() => {
				shouldThrow.value = false;
				c.value = 2;
			});
			expect(d.value).to.equal(4);
			expect(compute).to.have.been.called;
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

	it("should not block writes after batching completed", () => {
		// If no further writes after batch() are possible, than we
		// didn't restore state properly. Most likely "pending" still
		// holds elements that are already processed.
		const a = signal("a");
		const b = signal("b");
		const c = signal("c");
		const d = computed(() => a.value + " " + b.value + " " + c.value);

		let result;
		effect(() => (result = d.value));

		batch(() => {
			a.value = "aa";
			b.value = "bb";
		});
		c.value = "cc";
		expect(result).to.equal("aa bb cc");
	});
});
