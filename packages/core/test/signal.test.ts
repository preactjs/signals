import { signal, computed, observe, reactive } from "@preact/signals-core";

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

describe("reactive()", () => {
	it("should track property access", () => {
		const s = reactive({ foo: 1, bar: 2 });
		const r = computed(() => s.foo);
		expect(r.value).to.equal(1);

		s.foo++;
		expect(r.value).to.equal(2);
	});

	it("should track nested property access", () => {
		const s = reactive({ foo: { bar: 1 } });
		const r = computed(() => s.foo.bar);
		expect(r.value).to.equal(1);

		s.foo.bar++;
		expect(r.value).to.equal(2);
	});

	it("should dynamically create reactives", () => {
		const s = reactive({ foo: { bar: 1 } });
		const r = computed(() => s.foo.bar);
		expect(r.value).to.equal(1);

		s.foo = { bar: 2 };
		expect(r.value).to.equal(2);

		// Check if it's really reactive
		s.foo.bar++;
		expect(r.value).to.equal(3);
	});

	describe("Array", () => {
		it("should track item mutation", () => {
			const s = reactive([1]);
			const r = computed(() => s[0]);
			expect(r.value).to.equal(1);

			s[0] = 2;
			expect(r.value).to.equal(2);
		});

		it("should track .length", () => {
			const s = reactive([1]);
			const r = computed(() => s.length);
			expect(r.value).to.equal(1);

			s.push(2);
			expect(r.value).to.equal(2);
		});

		it("should track destructuring", () => {
			const s = reactive([1, 2, 3]);
			const r = computed(() => [...s]);
			expect(r.value).to.deep.equal([1, 2, 3]);

			s.push(4);
			expect(r.value).to.deep.equal([1, 2, 3, 4]);
		});

		describe("methods", () => {
			it("should track .at()", () => {
				const arr = reactive([1, 2]);
				const a = computed(() => arr.at(0));

				const spy = sinon.spy(() => a.value);
				const res = computed(spy);
				expect(res.value).to.equal(1);
				spy.resetHistory();

				arr[1] = 42;
				expect(res.value).to.equal(1);
				expect(spy).not.to.be.called;

				arr[0] = 10;
				expect(res.value).to.equal(10);
				expect(spy).to.be.calledOnce;
			});

			it("should track .concat()", () => {
				const arr = reactive([1, 2]);
				const arr2 = reactive([3, 4]);
				const r = computed(() => arr.concat(arr2));

				expect(r.value).to.deep.equal([1, 2, 3, 4]);

				arr2[0] = 42;
				expect(r.value).to.deep.equal([1, 2, 42, 4]);

				arr2.push(10);
				expect(r.value).to.deep.equal([1, 2, 42, 4, 10]);
			});

			it("should track .copyWithin()", () => {
				const arr = reactive([1, 2, 3, 4, 5]);
				const r = computed(() => arr);

				expect(r.value).to.deep.equal([1, 2, 3, 4, 5]);

				arr.copyWithin(0, 2, 4);
				expect(r.value).to.deep.equal([3, 4, 3, 4, 5]);
			});

			it("should track .entries()", () => {
				const arr = reactive([1, 2]);
				const r = computed(() => Array.from(arr.entries()));

				expect(r.value).to.deep.equal([
					[0, 1],
					[1, 2],
				]);

				arr.push(3);
				arr[1] = 10;
				expect(r.value).to.deep.equal([
					[0, 1],
					[1, 10],
					[2, 3],
				]);
			});

			it("should track .every()", () => {
				const arr = reactive([1, 2]);
				const r = computed(() => arr.every(x => x > 1));

				expect(r.value).to.equal(false);

				arr[0] = 10;
				expect(r.value).to.equal(true);
			});

			it("should track .fill()", () => {
				const arr = reactive([1, 2, 3, 4]);
				const r = computed(() => arr);

				expect(r.value).to.deep.equal([1, 2, 3, 4]);

				arr.fill(0, 2, 4);
				expect(r.value).to.deep.equal([1, 2, 0, 0]);
			});

			it("should track .filter()", () => {
				const s = reactive([1, 2, 3]);
				const r = computed(() => s.filter(x => x > 2));
				expect(r.value).to.deep.equal([3]);

				s.push(4);
				expect(r.value).to.deep.equal([3, 4]);
			});

			it("should track .filter() on mutation", () => {
				const s = reactive([1, 2, 3]);
				const r = computed(() => s.filter(x => x > 2));
				expect(r.value).to.deep.equal([3]);

				s[0] = 42;
				expect(r.value).to.deep.equal([42, 3]);
			});

			it("should track .find()", () => {
				const arr = reactive([1, 2, 3, 4]);
				const r = computed(() => arr.find(x => x > 1));

				expect(r.value).to.equal(2);

				arr[0] = 10;
				expect(r.value).to.equal(10);
			});

			it("should track .findIndex()", () => {
				const arr = reactive([1, 2, 3, 4]);
				const r = computed(() => arr.findIndex(x => x === 2));

				expect(r.value).to.equal(1);

				arr[0] = 2;
				expect(r.value).to.equal(0);
			});

			it("should track .map()", () => {
				const s = reactive([1, 2, 3]);
				const r = computed(() => s.map(x => "" + x));
				expect(r.value).to.deep.equal(["1", "2", "3"]);
				s[0] = 42;
				expect(r.value).to.deep.equal(["42", "2", "3"]);
			});

			it("should track .pop()", () => {
				const arr = reactive([1, 2]);
				const r = computed(() => arr);

				expect(r.value).to.deep.equal([1, 2]);

				arr.pop();
				expect(r.value).to.deep.equal([1]);
			});

			it("should track .shift()", () => {
				const arr = reactive([1, 2]);
				const r = computed(() => arr);

				expect(r.value).to.deep.equal([1, 2]);

				arr.shift();
				expect(r.value).to.deep.equal([2]);
			});

			it("should track .unshift()", () => {
				const arr = reactive([1, 2]);
				const r = computed(() => arr);

				expect(r.value).to.deep.equal([1, 2]);

				arr.unshift(10);
				expect(r.value).to.deep.equal([10, 1, 2]);
			});
		});
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
});
