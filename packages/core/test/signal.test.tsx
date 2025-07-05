import { describe, it, vi, expect } from "vitest";
import {
	signal,
	computed,
	effect,
	batch,
	Signal,
	untracked,
	ReadonlySignal,
} from "@preact/signals-core";

describe("signal", () => {
	it("should return value", () => {
		const v = [1, 2];
		const s = signal(v);
		expect(s.value).to.equal(v);
	});

	it("should inherit from Signal", () => {
		expect(signal(0)).to.be.instanceOf(Signal);
	});

	it("should support .toString()", () => {
		const s = signal(123);
		expect(s.toString()).equal("123");
	});

	it("should support .toJSON()", () => {
		const s = signal(123);
		expect(s.toJSON()).equal(123);
	});

	it("should support JSON.Stringify()", () => {
		const s = signal(123);
		expect(JSON.stringify({ s })).equal(JSON.stringify({ s: 123 }));
	});

	it("should support .valueOf()", () => {
		const s = signal(123);
		expect(s).to.have.property("valueOf");
		expect(s.valueOf).to.be.a("function");
		expect(s.valueOf()).equal(123);
		expect(+s).equal(123);

		const a = signal(1);
		const b = signal(2);
		// @ts-ignore-next-line
		expect(a + b).to.equal(3);
	});

	it("should notify other listeners of changes after one listener is disposed", () => {
		const s = signal(0);
		const spy1 = vi.fn(() => {
			s.value;
		});
		const spy2 = vi.fn(() => {
			s.value;
		});
		const spy3 = vi.fn(() => {
			s.value;
		});

		effect(spy1);
		const dispose = effect(spy2);
		effect(spy3);

		expect(spy1).toHaveBeenCalledOnce();
		expect(spy2).toHaveBeenCalledOnce();
		expect(spy3).toHaveBeenCalledOnce();

		dispose();

		s.value = 1;
		expect(spy1).toHaveBeenCalledTimes(2);
		expect(spy2).toHaveBeenCalledOnce();
		expect(spy3).toHaveBeenCalledTimes(2);
	});

	describe(".peek()", () => {
		it("should get value", () => {
			const s = signal(1);
			expect(s.peek()).equal(1);
		});

		it("should get the updated value after a value change", () => {
			const s = signal(1);
			s.value = 2;
			expect(s.peek()).equal(2);
		});

		it("should not make surrounding effect depend on the signal", () => {
			const s = signal(1);
			const spy = vi.fn(() => {
				s.peek();
			});

			effect(spy);
			expect(spy).toHaveBeenCalledOnce();

			s.value = 2;
			expect(spy).toHaveBeenCalledOnce();
		});

		it("should not make surrounding computed depend on the signal", () => {
			const s = signal(1);
			const spy = vi.fn(() => {
				s.peek();
			});
			const d = computed(spy);

			d.value;
			expect(spy).toHaveBeenCalledOnce();

			s.value = 2;
			d.value;
			expect(spy).toHaveBeenCalledOnce();
		});
	});

	describe(".subscribe()", () => {
		it("should subscribe to a signal", () => {
			const spy = vi.fn();
			const a = signal(1);

			a.subscribe(spy);
			expect(spy).toHaveBeenCalledWith(1);
		});

		it("should run the callback when the signal value changes", () => {
			const spy = vi.fn();
			const a = signal(1);

			a.subscribe(spy);

			a.value = 2;
			expect(spy).toHaveBeenCalledWith(2);
		});

		it("should unsubscribe from a signal", () => {
			const spy = vi.fn();
			const a = signal(1);

			const dispose = a.subscribe(spy);
			dispose();
			spy.mockClear();

			a.value = 2;
			expect(spy).not.toHaveBeenCalled();
		});

		it("should not start triggering on when a signal accessed in the callback changes", () => {
			const spy = vi.fn();
			const a = signal(0);
			const b = signal(0);

			a.subscribe(() => {
				b.value;
				spy();
			});
			expect(spy).toHaveBeenCalledOnce();
			spy.mockClear();

			b.value++;
			expect(spy).not.toHaveBeenCalled();
		});

		it("should not cause surrounding effect to subscribe to changes to a signal accessed in the callback", () => {
			const spy = vi.fn();
			const a = signal(0);
			const b = signal(0);

			effect(() => {
				a.subscribe(() => {
					b.value;
				});
				spy();
			});
			expect(spy).toHaveBeenCalledOnce();
			spy.mockClear();

			b.value++;
			expect(spy).not.toHaveBeenCalled();
		});
	});

	describe(".(un)watched()", () => {
		it("should call watched when first subscription occurs", () => {
			const watched = vi.fn();
			const unwatched = vi.fn();
			const s = signal(1, { watched, unwatched });
			expect(watched).not.toHaveBeenCalled();
			const unsubscribe = s.subscribe(() => {});
			expect(watched).toHaveBeenCalledOnce();
			const unsubscribe2 = s.subscribe(() => {});
			expect(watched).toHaveBeenCalledOnce();
			unsubscribe();
			unsubscribe2();
			expect(unwatched).toHaveBeenCalledOnce();
		});

		it("should allow updating the signal from watched", async () => {
			const calls: number[] = [];
			const watched = vi.fn(() => {
				setTimeout(() => {
					s.value = 2;
				});
			});
			const unwatched = vi.fn();
			const s = signal(1, { watched, unwatched });
			expect(watched).not.toHaveBeenCalled();
			const unsubscribe = s.subscribe(() => {
				calls.push(s.value);
			});
			expect(watched).toHaveBeenCalledOnce();
			const unsubscribe2 = s.subscribe(() => {});
			expect(watched).toHaveBeenCalledOnce();
			await new Promise(resolve => setTimeout(resolve));
			unsubscribe();
			unsubscribe2();
			expect(unwatched).toHaveBeenCalledOnce();
			expect(calls).to.deep.equal([1, 2]);
		});
	});

	it("signals should be identified with a symbol", () => {
		const a = signal(0);
		expect(a.brand).to.equal(Symbol.for("preact-signals"));
	});

	it("should be identified with a symbol", () => {
		const a = computed(() => {});
		expect(a.brand).to.equal(Symbol.for("preact-signals"));
	});
});

describe("effect()", () => {
	it("should run the callback immediately", () => {
		const s = signal(123);
		const spy = vi.fn(() => {
			s.value;
		});
		effect(spy);
		expect(spy).toHaveBeenCalled();
	});

	it("should subscribe to signals", () => {
		const s = signal(123);
		const spy = vi.fn(() => {
			s.value;
		});
		effect(spy);
		spy.mockClear();

		s.value = 42;
		expect(spy).toHaveBeenCalled();
	});

	it("should subscribe to multiple signals", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = vi.fn(() => {
			a.value;
			b.value;
		});
		effect(spy);
		spy.mockClear();

		a.value = "aa";
		b.value = "bb";
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("should dispose of subscriptions", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = vi.fn(() => {
			a.value + " " + b.value;
		});
		const dispose = effect(spy);
		spy.mockClear();

		dispose();
		expect(spy).not.toHaveBeenCalled();

		a.value = "aa";
		b.value = "bb";
		expect(spy).not.toHaveBeenCalled();
	});

	it("should dispose of subscriptions", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = vi.fn(() => {
			a.value + " " + b.value;
		});
		effect(function () {
			spy();
			if (a.value === "aa") {
				this.dispose();
			}
		});

		expect(spy).toHaveBeenCalled();

		a.value = "aa";
		expect(spy).toHaveBeenCalledTimes(2);

		a.value = "aaa";
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("should dispose of subscriptions immediately", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = vi.fn(() => {
			a.value + " " + b.value;
		});
		effect(function () {
			spy();
			this.dispose();
		});

		expect(spy).toHaveBeenCalledOnce();

		a.value = "aa";
		expect(spy).toHaveBeenCalledOnce();

		a.value = "aaa";
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should dispose of subscriptions when called twice", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = vi.fn(() => {
			a.value + " " + b.value;
		});
		const dispose = effect(function () {
			spy();
			if (a.value === "aa") {
				this.dispose();
			}
		});

		expect(spy).toHaveBeenCalled();

		a.value = "aa";
		expect(spy).toHaveBeenCalledTimes(2);
		dispose();

		a.value = "aaa";
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("should dispose of subscriptions immediately and signals are read after disposing", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = vi.fn(() => {
			a.value + " " + b.value;
		});
		effect(function () {
			this.dispose();
			spy();
		});

		expect(spy).toHaveBeenCalledOnce();

		a.value = "aa";
		expect(spy).toHaveBeenCalledOnce();

		a.value = "aaa";
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should dispose of subscriptions immediately when called twice (deferred)", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = vi.fn(() => {
			a.value + " " + b.value;
		});
		const dispose = effect(function () {
			spy();
			this.dispose();
		});

		expect(spy).toHaveBeenCalledOnce();

		a.value = "aa";
		expect(spy).toHaveBeenCalledOnce();
		dispose();

		a.value = "aaa";
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should unsubscribe from signal", () => {
		const s = signal(123);
		const spy = vi.fn(() => {
			s.value;
		});
		const unsub = effect(spy);
		spy.mockClear();

		unsub();
		s.value = 42;
		expect(spy).not.toHaveBeenCalled();
	});

	it("should conditionally unsubscribe from signals", () => {
		const a = signal("a");
		const b = signal("b");
		const cond = signal(true);

		const spy = vi.fn(() => {
			cond.value ? a.value : b.value;
		});

		effect(spy);
		expect(spy).toHaveBeenCalledOnce();

		b.value = "bb";
		expect(spy).toHaveBeenCalledOnce();

		cond.value = false;
		expect(spy).toHaveBeenCalledTimes(2);

		spy.mockClear();

		a.value = "aaa";
		expect(spy).not.toHaveBeenCalled();
	});

	it("should batch writes", () => {
		const a = signal("a");
		const spy = vi.fn(() => {
			a.value;
		});
		effect(spy);
		spy.mockClear();

		effect(() => {
			a.value = "aa";
			a.value = "aaa";
		});

		expect(spy).toHaveBeenCalledOnce();
	});

	it("should call the cleanup callback before the next run", () => {
		const a = signal(0);
		const spy = vi.fn();

		effect(() => {
			a.value;
			return spy;
		});
		expect(spy).not.toHaveBeenCalled();
		a.value = 1;
		expect(spy).toHaveBeenCalledOnce();
		a.value = 2;
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("should call only the callback from the previous run", () => {
		const spy1 = vi.fn();
		const spy2 = vi.fn();
		const spy3 = vi.fn();
		const a = signal(spy1);

		effect(() => {
			return a.value;
		});

		expect(spy1).not.toHaveBeenCalled();
		expect(spy2).not.toHaveBeenCalled();
		expect(spy3).not.toHaveBeenCalled();

		a.value = spy2;
		expect(spy1).toHaveBeenCalledOnce();
		expect(spy2).not.toHaveBeenCalled();
		expect(spy3).not.toHaveBeenCalled();

		a.value = spy3;
		expect(spy1).toHaveBeenCalledOnce();
		expect(spy2).toHaveBeenCalledOnce();
		expect(spy3).not.toHaveBeenCalled();
	});

	it("should call the cleanup callback function when disposed", () => {
		const spy = vi.fn();

		const dispose = effect(() => {
			return spy;
		});
		expect(spy).not.toHaveBeenCalled();
		dispose();
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should not recompute if the effect has been notified about changes, but no direct dependency has actually changed", () => {
		const s = signal(0);
		const c = computed(() => {
			s.value;
			return 0;
		});
		const spy = vi.fn(() => {
			c.value;
		});
		effect(spy);
		expect(spy).toHaveBeenCalledOnce();
		spy.mockClear();

		s.value = 1;
		expect(spy).not.toHaveBeenCalled();
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

	it("should not recompute dependencies out of order", () => {
		const a = signal(1);
		const b = signal(1);
		const c = signal(1);

		const spy = vi.fn(() => c.value);
		const d = computed(spy);

		effect(() => {
			if (a.value > 0) {
				b.value;
				d.value;
			} else {
				b.value;
			}
		});
		spy.mockClear();

		batch(() => {
			a.value = 2;
			b.value = 2;
			c.value = 2;
		});
		expect(spy).toHaveBeenCalledOnce();
		spy.mockClear();

		batch(() => {
			a.value = -1;
			b.value = -1;
			c.value = -1;
		});
		expect(spy).not.toHaveBeenCalled();
		spy.mockClear();
	});

	it("should recompute if a dependency changes during computation after becoming a dependency", () => {
		const a = signal(0);
		const spy = vi.fn(() => {
			if (a.value === 0) {
				a.value++;
			}
		});
		effect(spy);
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("should run the cleanup in an implicit batch", () => {
		const a = signal(0);
		const b = signal("a");
		const c = signal("b");
		const spy = vi.fn();

		effect(() => {
			b.value;
			c.value;
			spy(b.value + c.value);
		});

		effect(() => {
			a.value;
			return () => {
				b.value = "x";
				c.value = "y";
			};
		});

		expect(spy).toHaveBeenCalledOnce();
		spy.mockClear();

		a.value = 1;
		expect(spy).toHaveBeenCalledOnce();
		expect(spy).toHaveBeenCalledWith("xy");
	});

	it("should not retrigger the effect if the cleanup modifies one of the dependencies", () => {
		const a = signal(0);
		const spy = vi.fn();

		effect(() => {
			spy(a.value);
			return () => {
				a.value = 2;
			};
		});
		expect(spy).toHaveBeenCalledOnce();
		spy.mockClear();

		a.value = 1;
		expect(spy).toHaveBeenCalledOnce();
		expect(spy).toHaveBeenCalledWith(2);
	});

	it("should run the cleanup if the effect disposes itself", () => {
		const a = signal(0);
		const spy = vi.fn();

		const dispose = effect(() => {
			if (a.value > 0) {
				dispose();
				return spy;
			}
		});
		expect(spy).not.toHaveBeenCalled();
		a.value = 1;
		expect(spy).toHaveBeenCalledOnce();
		a.value = 2;
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should not run the effect if the cleanup function disposes it", () => {
		const a = signal(0);
		const spy = vi.fn();

		const dispose = effect(() => {
			a.value;
			spy();
			return () => {
				dispose();
			};
		});
		expect(spy).toHaveBeenCalledOnce();
		a.value = 1;
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should not subscribe to anything if first run throws", () => {
		const s = signal(0);
		const spy = vi.fn(() => {
			s.value;
			throw new Error("test");
		});
		expect(() => effect(spy)).to.throw("test");
		expect(spy).toHaveBeenCalledOnce();

		s.value++;
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should reset the cleanup if the effect throws", () => {
		const a = signal(0);
		const spy = vi.fn();

		effect(() => {
			if (a.value === 0) {
				return spy;
			} else {
				throw new Error("hello");
			}
		});
		expect(spy).not.toHaveBeenCalled();
		expect(() => (a.value = 1)).to.throw("hello");
		expect(spy).toHaveBeenCalledOnce();
		a.value = 0;
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should dispose the effect if the cleanup callback throws", () => {
		const a = signal(0);
		const spy = vi.fn();

		effect(() => {
			if (a.value === 0) {
				return () => {
					throw new Error("hello");
				};
			} else {
				spy();
			}
		});
		expect(spy).not.toHaveBeenCalled();
		expect(() => a.value++).to.throw("hello");
		expect(spy).not.toHaveBeenCalled();
		a.value++;
		expect(spy).not.toHaveBeenCalled();
	});

	it("should run cleanups outside any evaluation context", () => {
		const spy = vi.fn();
		const a = signal(0);
		const b = signal(0);
		const c = computed(() => {
			if (a.value === 0) {
				effect(() => {
					return () => {
						b.value;
					};
				});
			}
			return a.value;
		});

		effect(() => {
			spy();
			c.value;
		});
		expect(spy).toHaveBeenCalledOnce();
		spy.mockClear();

		a.value = 1;
		expect(spy).toHaveBeenCalledOnce();
		spy.mockClear();

		b.value = 1;
		expect(spy).not.toHaveBeenCalled();
	});

	it("should throw on cycles", () => {
		const a = signal(0);
		let i = 0;

		const fn = () =>
			effect(() => {
				// Prevent test suite from spinning if limit is not hit
				if (i++ > 200) {
					throw new Error("test failed");
				}
				a.value;
				a.value = NaN;
			});

		expect(fn).to.throw(/Cycle detected/);
	});

	it("should throw on indirect cycles", () => {
		const a = signal(0);
		let i = 0;

		const c = computed(() => {
			a.value;
			a.value = NaN;
			return NaN;
		});

		const fn = () =>
			effect(() => {
				// Prevent test suite from spinning if limit is not hit
				if (i++ > 200) {
					throw new Error("test failed");
				}
				c.value;
			});

		expect(fn).to.throw(/Cycle detected/);
	});

	it("should allow disposing the effect multiple times", () => {
		const dispose = effect(() => undefined);
		dispose();
		expect(() => dispose()).not.to.throw();
	});

	it("should support resource management disposal", () => {
		const a = signal(0);
		const spy = vi.fn();
		{
			using _dispose = effect(() => {
				a.value;
				return spy;
			});
		}
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should allow disposing a running effect", () => {
		const a = signal(0);
		const spy = vi.fn();
		const dispose = effect(() => {
			if (a.value === 1) {
				dispose();
				spy();
			}
		});
		expect(spy).not.toHaveBeenCalled();
		a.value = 1;
		expect(spy).toHaveBeenCalledOnce();
		a.value = 2;
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should not run if it's first been triggered and then disposed in a batch", () => {
		const a = signal(0);
		const spy = vi.fn(() => {
			a.value;
		});
		const dispose = effect(spy);
		spy.mockClear();

		batch(() => {
			a.value = 1;
			dispose();
		});

		expect(spy).not.toHaveBeenCalled();
	});

	it("should not run if it's been triggered, disposed and then triggered again in a batch", () => {
		const a = signal(0);
		const spy = vi.fn(() => {
			a.value;
		});
		const dispose = effect(spy);
		spy.mockClear();

		batch(() => {
			a.value = 1;
			dispose();
			a.value = 2;
		});

		expect(spy).not.toHaveBeenCalled();
	});

	it("should not rerun parent effect if a nested child effect's signal's value changes", () => {
		const parentSignal = signal(0);
		const childSignal = signal(0);

		const parentEffect = vi.fn(() => {
			parentSignal.value;
		});
		const childEffect = vi.fn(() => {
			childSignal.value;
		});

		effect(() => {
			parentEffect();
			effect(childEffect);
		});

		expect(parentEffect).toHaveBeenCalledOnce();
		expect(childEffect).toHaveBeenCalledOnce();

		childSignal.value = 1;

		expect(parentEffect).toHaveBeenCalledOnce();
		expect(childEffect).toHaveBeenCalledTimes(2);

		parentSignal.value = 1;

		expect(parentEffect).toHaveBeenCalledTimes(2);
		expect(childEffect).toHaveBeenCalledTimes(3);
	});

	// Test internal behavior depended on by Preact & React integrations
	describe("internals", () => {
		it("should pass in the effect instance in callback's `this`", () => {
			let e: any;
			effect(function (this: any) {
				e = this;
			});
			expect(typeof e._start).to.equal("function");
			expect(typeof e._dispose).to.equal("function");
		});

		it("should allow setting _callback that replaces the default functionality", () => {
			const a = signal(0);
			const oldSpy = vi.fn();
			const newSpy = vi.fn();

			let e: any;
			effect(function (this: any) {
				e = this;
				a.value;
				oldSpy();
			});
			oldSpy.mockClear();

			e._callback = newSpy;
			a.value = 1;

			expect(oldSpy).not.toHaveBeenCalled();
			expect(newSpy).toHaveBeenCalled();
		});

		it("should return a function for closing the effect scope from _start", () => {
			const s = signal(0);

			let e: any;
			effect(function (this: any) {
				e = this;
			});

			const spy = vi.fn();
			e._callback = spy;

			const done1 = e._start();
			s.value;
			done1();
			expect(spy).not.toHaveBeenCalled();

			s.value = 2;
			expect(spy).toHaveBeenCalled();
			spy.mockClear();

			const done2 = e._start();
			done2();

			s.value = 3;
			expect(spy).not.toHaveBeenCalled();
		});

		it("should throw on out-of-order start1-start2-end1 sequences", () => {
			let e1: any;
			effect(function (this: any) {
				e1 = this;
			});

			let e2: any;
			effect(function (this: any) {
				e2 = this;
			});

			const done1 = e1._start();
			const done2 = e2._start();
			try {
				expect(() => done1()).to.throw(/Out-of-order/);
			} finally {
				done2();
				done1();
			}
		});

		it("should throw a cycle detection error when _start is called while the effect is running", () => {
			let e: any;
			effect(function (this: any) {
				e = this;
			});

			const done = e._start();
			try {
				expect(() => e._start()).to.throw(/Cycle detected/);
			} finally {
				done();
			}
		});

		it("should dispose the effect on _dispose", () => {
			const s = signal(0);

			let e: any;
			effect(function (this: any) {
				e = this;
			});

			const spy = vi.fn();
			e._callback = spy;

			const done = e._start();
			try {
				s.value;
			} finally {
				done();
			}
			expect(spy).not.toHaveBeenCalled();

			s.value = 2;
			expect(spy).toHaveBeenCalled();
			spy.mockClear();

			e._dispose();
			s.value = 3;
			expect(spy).not.toHaveBeenCalled();
		});

		it("should allow reusing the effect after disposing it", () => {
			const s = signal(0);

			let e: any;
			effect(function (this: any) {
				e = this;
			});

			const spy = vi.fn();
			e._callback = spy;
			e._dispose();

			const done = e._start();
			try {
				s.value;
			} finally {
				done();
			}
			s.value = 2;
			expect(spy).toHaveBeenCalled();
		});

		it("should have property _sources that is undefined when and only when the effect has no sources", () => {
			const s = signal(0);

			let e: any;
			effect(function (this: any) {
				e = this;
			});
			expect(e._sources).to.be.undefined;

			const done1 = e._start();
			try {
				s.value;
			} finally {
				done1();
			}
			expect(e._sources).not.to.be.undefined;

			const done2 = e._start();
			done2();
			expect(e._sources).to.be.undefined;

			const done3 = e._start();
			try {
				s.value;
			} finally {
				done3();
			}
			expect(e._sources).not.to.be.undefined;

			e._dispose();
			expect(e._sources).to.be.undefined;
		});
	});
});

describe("computed()", () => {
	it("should return value", () => {
		const a = signal("a");
		const b = signal("b");

		const c = computed(() => a.value + b.value);
		expect(c.value).to.equal("ab");
	});

	it("should inherit from Signal", () => {
		expect(computed(() => 0)).to.be.instanceOf(Signal);
	});

	it("should return updated value", () => {
		const a = signal("a");
		const b = signal("b");

		const c = computed(() => a.value + b.value);
		expect(c.value).to.equal("ab");

		a.value = "aa";
		expect(c.value).to.equal("aab");
	});

	it("should be lazily computed on demand", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = vi.fn(() => a.value + b.value);
		const c = computed(spy);
		expect(spy).not.toHaveBeenCalled();
		c.value;
		expect(spy).toHaveBeenCalledOnce();
		a.value = "x";
		b.value = "y";
		expect(spy).toHaveBeenCalledOnce();
		c.value;
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("should be computed only when a dependency has changed at some point", () => {
		const a = signal("a");
		const spy = vi.fn(() => {
			return a.value;
		});
		const c = computed(spy);
		c.value;
		expect(spy).toHaveBeenCalledOnce();
		a.value = "a";
		c.value;
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should recompute if a dependency changes during computation after becoming a dependency", () => {
		const a = signal(0);
		const spy = vi.fn(() => {
			a.value++;
		});
		const c = computed(spy);
		c.value;
		expect(spy).toHaveBeenCalledOnce();
		c.value;
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("should detect simple dependency cycles", () => {
		const a: ReadonlySignal = computed(() => a.value);
		expect(() => a.value).to.throw(/Cycle detected/);
	});

	it("should detect deep dependency cycles", () => {
		const a: ReadonlySignal = computed(() => b.value);
		const b: ReadonlySignal = computed(() => c.value);
		const c: ReadonlySignal = computed(() => d.value);
		const d: ReadonlySignal = computed(() => a.value);
		expect(() => a.value).to.throw(/Cycle detected/);
	});

	it("should not allow a computed signal to become a direct dependency of itself", () => {
		const spy = vi.fn(() => {
			try {
				a.value;
			} catch {
				// pass
			}
		});
		const a = computed(spy);
		a.value;
		expect(() => effect(() => a.value)).to.not.throw();
	});

	it("should store thrown errors and recompute only after a dependency changes", () => {
		const a = signal(0);
		const spy = vi.fn(() => {
			a.value;
			throw new Error();
		});
		const c = computed(spy);
		expect(() => c.value).to.throw();
		expect(() => c.value).to.throw();
		expect(spy).toHaveBeenCalledOnce();
		a.value = 1;
		expect(() => c.value).to.throw();
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("should store thrown non-errors and recompute only after a dependency changes", () => {
		const a = signal(0);
		const spy = vi.fn();
		const c = computed(() => {
			a.value;
			spy();
			throw undefined;
		});

		try {
			c.value;
			expect.fail();
		} catch (err) {
			expect(err).to.be.undefined;
		}
		try {
			c.value;
			expect.fail();
		} catch (err) {
			expect(err).to.be.undefined;
		}
		expect(spy).toHaveBeenCalledOnce();

		a.value = 1;
		try {
			c.value;
			expect.fail();
		} catch (err) {
			expect(err).to.be.undefined;
		}
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("should conditionally unsubscribe from signals", () => {
		const a = signal("a");
		const b = signal("b");
		const cond = signal(true);

		const spy = vi.fn(() => {
			return cond.value ? a.value : b.value;
		});

		const c = computed(spy);
		expect(c.value).to.equal("a");
		expect(spy).toHaveBeenCalledOnce();

		b.value = "bb";
		expect(c.value).to.equal("a");
		expect(spy).toHaveBeenCalledOnce();

		cond.value = false;
		expect(c.value).to.equal("bb");
		expect(spy).toHaveBeenCalledTimes(2);

		spy.mockClear();

		a.value = "aaa";
		expect(c.value).to.equal("bb");
		expect(spy).not.toHaveBeenCalled();
	});

	describe(".(un)watched()", () => {
		it("should call watched when first subscription occurs", () => {
			const watched = vi.fn();
			const unwatched = vi.fn();
			const s = computed(() => 1, { watched, unwatched });
			expect(watched).not.toHaveBeenCalled();
			const unsubscribe = s.subscribe(() => {});
			expect(watched).toHaveBeenCalledOnce();
			const unsubscribe2 = s.subscribe(() => {});
			expect(watched).toHaveBeenCalledOnce();
			unsubscribe();
			unsubscribe2();
			expect(unwatched).toHaveBeenCalledOnce();
		});

		it("should call watched when first subscription occurs w/ nested signal", () => {
			const watched = vi.fn();
			const unwatched = vi.fn();
			const s = signal(1, { watched, unwatched });
			const c = computed(() => s.value + 1, { watched, unwatched });
			expect(watched).not.toHaveBeenCalled();
			const unsubscribe = c.subscribe(() => {});
			expect(watched).toHaveBeenCalledTimes(2);
			const unsubscribe2 = s.subscribe(() => {});
			expect(watched).toHaveBeenCalledTimes(2);
			unsubscribe2();
			unsubscribe();
			expect(unwatched).toHaveBeenCalledTimes(2);
		});
	});

	it("should consider undefined value separate from uninitialized value", () => {
		const a = signal(0);
		const spy = vi.fn(() => undefined);
		const c = computed(spy);

		expect(c.value).to.be.undefined;
		a.value = 1;
		expect(c.value).to.be.undefined;
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should not leak errors raised by dependencies", () => {
		const a = signal(0);
		const b = computed(() => {
			a.value;
			throw new Error("error");
		});
		const c = computed(() => {
			try {
				b.value;
			} catch {
				return "ok";
			}
		});
		expect(c.value).to.equal("ok");
		a.value = 1;
		expect(c.value).to.equal("ok");
	});

	it("should propagate notifications even right after first subscription", () => {
		const a = signal(0);
		const b = computed(() => a.value);
		const c = computed(() => b.value);
		c.value;

		const spy = vi.fn(() => {
			c.value;
		});

		effect(spy);
		expect(spy).toHaveBeenCalledOnce();
		spy.mockClear();

		a.value = 1;
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should get marked as outdated right after first subscription", () => {
		const s = signal(0);
		const c = computed(() => s.value);
		c.value;

		s.value = 1;
		effect(() => {
			c.value;
		});
		expect(c.value).to.equal(1);
	});

	it("should propagate notification to other listeners after one listener is disposed", () => {
		const s = signal(0);
		const c = computed(() => s.value);

		const spy1 = vi.fn(() => {
			c.value;
		});
		const spy2 = vi.fn(() => {
			c.value;
		});
		const spy3 = vi.fn(() => {
			c.value;
		});

		effect(spy1);
		const dispose = effect(spy2);
		effect(spy3);

		expect(spy1).toHaveBeenCalledOnce();
		expect(spy2).toHaveBeenCalledOnce();
		expect(spy3).toHaveBeenCalledOnce();

		dispose();

		s.value = 1;
		expect(spy1).toHaveBeenCalledTimes(2);
		expect(spy2).toHaveBeenCalledOnce();
		expect(spy3).toHaveBeenCalledTimes(2);
	});

	it("should not recompute dependencies out of order", () => {
		const a = signal(1);
		const b = signal(1);
		const c = signal(1);

		const spy = vi.fn(() => c.value);
		const d = computed(spy);

		const e = computed(() => {
			if (a.value > 0) {
				b.value;
				d.value;
			} else {
				b.value;
			}
		});

		e.value;
		spy.mockClear();

		a.value = 2;
		b.value = 2;
		c.value = 2;
		e.value;
		expect(spy).toHaveBeenCalledOnce();
		spy.mockClear();

		a.value = -1;
		b.value = -1;
		c.value = -1;
		e.value;
		expect(spy).not.toHaveBeenCalled();
		spy.mockClear();
	});

	it("should not recompute dependencies unnecessarily", () => {
		const spy = vi.fn();
		const a = signal(0);
		const b = signal(0);
		const c = computed(() => {
			b.value;
			spy();
		});
		const d = computed(() => {
			if (a.value === 0) {
				c.value;
			}
		});
		d.value;
		expect(spy).toHaveBeenCalledOnce();

		batch(() => {
			b.value = 1;
			a.value = 1;
		});
		d.value;
		expect(spy).toHaveBeenCalledOnce();
	});

	describe(".peek()", () => {
		it("should get value", () => {
			const s = signal(1);
			const c = computed(() => s.value);
			expect(c.peek()).equal(1);
		});

		it("should throw when evaluation throws", () => {
			const c = computed(() => {
				throw Error("test");
			});
			expect(() => c.peek()).to.throw("test");
		});

		it("should throw when previous evaluation threw and dependencies haven't changed", () => {
			const c = computed(() => {
				throw Error("test");
			});
			expect(() => c.value).to.throw("test");
			expect(() => c.peek()).to.throw("test");
		});

		it("should refresh value if stale", () => {
			const a = signal(1);
			const b = computed(() => a.value);
			expect(b.peek()).to.equal(1);

			a.value = 2;
			expect(b.peek()).to.equal(2);
		});

		it("should detect simple dependency cycles", () => {
			const a: ReadonlySignal = computed(() => a.peek());
			expect(() => a.peek()).to.throw(/Cycle detected/);
		});

		it("should detect deep dependency cycles", () => {
			const a: ReadonlySignal = computed(() => b.value);
			const b: ReadonlySignal = computed(() => c.value);
			const c: ReadonlySignal = computed(() => d.value);
			const d: ReadonlySignal = computed(() => a.peek());
			expect(() => a.peek()).to.throw(/Cycle detected/);
		});

		it("should not make surrounding effect depend on the computed", () => {
			const s = signal(1);
			const c = computed(() => s.value);
			const spy = vi.fn(() => {
				c.peek();
			});

			effect(spy);
			expect(spy).toHaveBeenCalledOnce();

			s.value = 2;
			expect(spy).toHaveBeenCalledOnce();
		});

		it("should not make surrounding computed depend on the computed", () => {
			const s = signal(1);
			const c = computed(() => s.value);

			const spy = vi.fn(() => {
				c.peek();
			});

			const d = computed(spy);
			d.value;
			expect(spy).toHaveBeenCalledOnce();

			s.value = 2;
			d.value;
			expect(spy).toHaveBeenCalledOnce();
		});

		it("should not make surrounding effect depend on the peeked computed's dependencies", () => {
			const a = signal(1);
			const b = computed(() => a.value);
			const spy = vi.fn();
			effect(() => {
				spy();
				b.peek();
			});
			expect(spy).toHaveBeenCalledOnce();
			spy.mockClear();

			a.value = 1;
			expect(spy).not.toHaveBeenCalled();
		});

		it("should not make surrounding computed depend on peeked computed's dependencies", () => {
			const a = signal(1);
			const b = computed(() => a.value);
			const spy = vi.fn();
			const d = computed(() => {
				spy();
				b.peek();
			});
			d.value;
			expect(spy).toHaveBeenCalledOnce();
			spy.mockClear();

			a.value = 1;
			d.value;
			expect(spy).not.toHaveBeenCalled();
		});
	});

	describe.runIf(typeof gc !== "undefined")("garbage collection", function () {
		it("should be garbage collectable if nothing is listening to its changes", async () => {
			const s = signal(0);
			const ref = new WeakRef(computed(() => s.value));

			(gc as () => void)();
			await new Promise(resolve => setTimeout(resolve, 0));
			(gc as () => void)();
			expect(ref.deref()).to.be.undefined;
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
	});

	describe("graph updates", () => {
		it("should run computeds once for multiple dep changes", async () => {
			const a = signal("a");
			const b = signal("b");

			const compute = vi.fn(() => {
				// debugger;
				return a.value + b.value;
			});
			const c = computed(compute);

			expect(c.value).to.equal("ab");
			expect(compute).toHaveBeenCalledOnce();
			compute.mockClear();

			a.value = "aa";
			b.value = "bb";
			c.value;
			expect(compute).toHaveBeenCalledOnce();
		});

		it("should drop A->B->A updates", async () => {
			//     A
			//   / |
			//  B  | <- Looks like a flag doesn't it? :D
			//   \ |
			//     C
			//     |
			//     D
			const a = signal(2);

			const b = computed(() => a.value - 1);
			const c = computed(() => a.value + b.value);

			const compute = vi.fn(() => "d: " + c.value);
			const d = computed(compute);

			// Trigger read
			expect(d.value).to.equal("d: 3");
			expect(compute).toHaveBeenCalledOnce();
			compute.mockClear();

			a.value = 4;
			d.value;
			expect(compute).toHaveBeenCalledOnce();
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

			const spy = vi.fn(() => b.value + " " + c.value);
			const d = computed(spy);

			expect(d.value).to.equal("a a");
			expect(spy).toHaveBeenCalledOnce();

			a.value = "aa";
			expect(d.value).to.equal("aa aa");
			expect(spy).toHaveBeenCalledTimes(2);
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

			const spy = vi.fn(() => d.value);
			const e = computed(spy);

			expect(e.value).to.equal("a a");
			expect(spy).toHaveBeenCalledOnce();

			a.value = "aa";
			expect(e.value).to.equal("aa aa");
			expect(spy).toHaveBeenCalledTimes(2);
		});

		it("should bail out if result is the same", () => {
			// Bail out if value of "B" never changes
			// A->B->C
			const a = signal("a");
			const b = computed(() => {
				a.value;
				return "foo";
			});

			const spy = vi.fn(() => b.value);
			const c = computed(spy);

			expect(c.value).to.equal("foo");
			expect(spy).toHaveBeenCalledOnce();

			a.value = "aa";
			expect(c.value).to.equal("foo");
			expect(spy).toHaveBeenCalledOnce();
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

			const eSpy = vi.fn(() => b.value + " " + d.value);
			const e = computed(eSpy);

			const fSpy = vi.fn(() => e.value);
			const f = computed(fSpy);
			const gSpy = vi.fn(() => e.value);
			const g = computed(gSpy);

			expect(f.value).to.equal("a a");
			expect(fSpy).toHaveBeenCalledOnce();

			expect(g.value).to.equal("a a");
			expect(gSpy).toHaveBeenCalledOnce();

			eSpy.mockClear();
			fSpy.mockClear();
			gSpy.mockClear();

			a.value = "b";

			expect(e.value).to.equal("b b");
			expect(eSpy).toHaveBeenCalledOnce();

			expect(f.value).to.equal("b b");
			expect(fSpy).toHaveBeenCalledOnce();

			expect(g.value).to.equal("b b");
			expect(gSpy).toHaveBeenCalledOnce();

			eSpy.mockClear();
			fSpy.mockClear();
			gSpy.mockClear();

			a.value = "c";

			expect(e.value).to.equal("c c");
			expect(eSpy).toHaveBeenCalledOnce();

			expect(f.value).to.equal("c c");
			expect(fSpy).toHaveBeenCalledOnce();

			expect(g.value).to.equal("c c");
			expect(gSpy).toHaveBeenCalledOnce();

			// top to bottom
			expect(eSpy).toHaveBeenCalledBefore(fSpy);
			// left to right
			expect(fSpy).toHaveBeenCalledBefore(gSpy);
		});

		it("should only subscribe to signals listened to", () => {
			//    *A
			//   /   \
			// *B     C <- we don't listen to C
			const a = signal("a");

			const b = computed(() => a.value);
			const spy = vi.fn(() => a.value);
			computed(spy);

			expect(b.value).to.equal("a");
			expect(spy).not.toHaveBeenCalled();

			a.value = "aa";
			expect(b.value).to.equal("aa");
			expect(spy).not.toHaveBeenCalled();
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
			const spy = vi.fn(() => b.value + " " + c.value);
			const d = computed(spy);
			expect(d.value).to.equal("a c");
			spy.mockClear();

			a.value = "aa";
			d.value;
			expect(spy).toReturnWith("aa c");
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
			const spy = vi.fn(() => b.value + " " + c.value + " " + d.value);
			const e = computed(spy);
			expect(e.value).to.equal("a c d");
			spy.mockClear();

			a.value = "aa";
			e.value;
			expect(spy).toReturnWith("aa c d");
		});
	});

	describe("error handling", () => {
		it("should throw when writing to computeds", () => {
			const a = signal("a");
			const b = computed(() => a.value);
			const fn = () => ((b as Signal).value = "aa");
			expect(fn).to.throw(/Cannot set property value/);
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
			const b = computed(() => {
				if (a.value === 1) throw new Error("fail");
				return a.value;
			});
			const c = computed(() => b.value);
			expect(c.value).to.equal(0);

			a.value = 1;
			expect(() => b.value).to.throw("fail");

			a.value = 2;
			expect(c.value).to.equal(2);
		});

		it("should support lazy branches", () => {
			const a = signal(0);
			const b = computed(() => a.value);
			const c = computed(() => (a.value > 0 ? a.value : b.value));

			expect(c.value).to.equal(0);
			a.value = 1;
			expect(c.value).to.equal(1);

			a.value = 0;
			expect(c.value).to.equal(0);
		});

		it("should not update a sub if all deps unmark it", () => {
			// In this scenario "B" and "C" always return the same value. When "A"
			// changes, "D" should not update.
			//     A
			//   /   \
			// *B     *C
			//   \   /
			//     D
			const a = signal("a");
			const b = computed(() => {
				a.value;
				return "b";
			});
			const c = computed(() => {
				a.value;
				return "c";
			});
			const spy = vi.fn(() => b.value + " " + c.value);
			const d = computed(spy);
			expect(d.value).to.equal("b c");
			spy.mockClear();

			a.value = "aa";
			expect(spy).not.toHaveBeenCalled();
		});
	});
});

describe("batch/transaction", () => {
	it("should return the value from the callback", () => {
		expect(batch(() => 1)).to.equal(1);
	});

	it("should throw errors thrown from the callback", () => {
		expect(() =>
			batch(() => {
				throw Error("hello");
			})
		).to.throw("hello");
	});

	it("should throw non-errors thrown from the callback", () => {
		try {
			batch(() => {
				throw undefined;
			});
			expect.fail();
		} catch (err) {
			expect(err).to.be.undefined;
		}
	});

	it("should delay writes", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = vi.fn(() => {
			a.value + " " + b.value;
		});
		effect(spy);
		spy.mockClear();

		batch(() => {
			a.value = "aa";
			b.value = "bb";
		});

		expect(spy).toHaveBeenCalledOnce();
	});

	it("should delay writes until outermost batch is complete", () => {
		const a = signal("a");
		const b = signal("b");
		const spy = vi.fn(() => {
			a.value + ", " + b.value;
		});
		effect(spy);
		spy.mockClear();

		batch(() => {
			batch(() => {
				a.value += " inner";
				b.value += " inner";
			});
			a.value += " outer";
			b.value += " outer";
		});

		// If the inner batch() would have flushed the update
		// this spy would've been called twice.
		expect(spy).toHaveBeenCalledOnce();
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

		const spyC = vi.fn(() => b.value);
		const c = computed(spyC);

		const spyD = vi.fn(() => c.value);
		const d = computed(spyD);

		const spyE = vi.fn(() => d.value);
		const e = computed(spyE);

		spyC.mockClear();
		spyD.mockClear();
		spyE.mockClear();

		let result = "";
		batch(() => {
			a.value = "aa";
			result = c.value;

			// Since "D" isn't accessed during batching, we should not
			// update it, only after batching has completed
			expect(spyD).not.toHaveBeenCalled();
		});

		expect(result).to.equal("aa");
		expect(d.value).to.equal("aa");
		expect(e.value).to.equal("aa");
		expect(spyC).toHaveBeenCalledOnce();
		expect(spyD).toHaveBeenCalledOnce();
		expect(spyE).toHaveBeenCalledOnce();
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
		effect(() => {
			result = d.value;
		});

		batch(() => {
			a.value = "aa";
			b.value = "bb";
		});
		c.value = "cc";
		expect(result).to.equal("aa bb cc");
	});

	it("should not lead to stale signals with .value in batch", () => {
		const invokes: number[][] = [];
		const counter = signal(0);
		const double = computed(() => counter.value * 2);
		const triple = computed(() => counter.value * 3);

		effect(() => {
			invokes.push([double.value, triple.value]);
		});

		expect(invokes).to.deep.equal([[0, 0]]);

		batch(() => {
			counter.value = 1;
			expect(double.value).to.equal(2);
		});

		expect(invokes[1]).to.deep.equal([2, 3]);
	});

	it("should not lead to stale signals with peek() in batch", () => {
		const invokes: number[][] = [];
		const counter = signal(0);
		const double = computed(() => counter.value * 2);
		const triple = computed(() => counter.value * 3);

		effect(() => {
			invokes.push([double.value, triple.value]);
		});

		expect(invokes).to.deep.equal([[0, 0]]);

		batch(() => {
			counter.value = 1;
			expect(double.peek()).to.equal(2);
		});

		expect(invokes[1]).to.deep.equal([2, 3]);
	});

	it("should run pending effects even if the callback throws", () => {
		const a = signal(0);
		const b = signal(1);
		const spy1 = vi.fn(() => {
			a.value;
		});
		const spy2 = vi.fn(() => {
			b.value;
		});
		effect(spy1);
		effect(spy2);
		spy1.mockClear();
		spy2.mockClear();

		expect(() =>
			batch(() => {
				a.value++;
				b.value++;
				throw Error("hello");
			})
		).to.throw("hello");

		expect(spy1).toHaveBeenCalledOnce();
		expect(spy2).toHaveBeenCalledOnce();
	});

	it("should run pending effects even if some effects throw", () => {
		const a = signal(0);
		const spy1 = vi.fn(() => {
			a.value;
		});
		const spy2 = vi.fn(() => {
			a.value;
		});
		effect(() => {
			if (a.value === 1) {
				throw new Error("hello");
			}
		});
		effect(spy1);
		effect(() => {
			if (a.value === 1) {
				throw new Error("hello");
			}
		});
		effect(spy2);
		effect(() => {
			if (a.value === 1) {
				throw new Error("hello");
			}
		});
		spy1.mockClear();
		spy2.mockClear();

		expect(() =>
			batch(() => {
				a.value++;
			})
		).to.throw("hello");

		expect(spy1).toHaveBeenCalledOnce();
		expect(spy2).toHaveBeenCalledOnce();
	});

	it("should run effect's first run immediately even inside a batch", () => {
		let callCount = 0;
		const spy = vi.fn();
		batch(() => {
			effect(spy);
			callCount = spy.mock.calls.length;
		});
		expect(callCount).to.equal(1);
	});
});

describe("untracked", () => {
	it("should block tracking inside effects", () => {
		const a = signal(1);
		const b = signal(2);
		const spy = vi.fn(() => {
			a.value + b.value;
		});
		effect(() => untracked(spy));
		expect(spy).toHaveBeenCalledOnce();

		a.value = 10;
		b.value = 20;
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should block tracking even when run inside effect run inside untracked", () => {
		const s = signal(1);
		const spy = vi.fn(() => s.value);

		untracked(() =>
			effect(() => {
				untracked(spy);
			})
		);
		expect(spy).toHaveBeenCalledOnce();

		s.value = 2;
		expect(spy).toHaveBeenCalledOnce();
	});

	it("should not cause signal assignments throw", () => {
		const a = signal(1);
		const aChangedTime = signal(0);

		const dispose = effect(() => {
			a.value;
			untracked(() => {
				aChangedTime.value = aChangedTime.value + 1;
			});
		});

		expect(() => (a.value = 2)).not.to.throw();
		expect(aChangedTime.value).to.equal(2);
		a.value = 3;
		expect(aChangedTime.value).to.equal(3);

		dispose();
	});

	it("should block tracking inside computed signals", () => {
		const a = signal(1);
		const b = signal(2);
		const spy = vi.fn(() => a.value + b.value);
		const c = computed(() => untracked(spy));

		expect(spy).not.toHaveBeenCalled();
		expect(c.value).to.equal(3);
		a.value = 10;
		c.value;
		b.value = 20;
		c.value;
		expect(spy).toHaveBeenCalledOnce();
		expect(c.value).to.equal(3);
	});
});
