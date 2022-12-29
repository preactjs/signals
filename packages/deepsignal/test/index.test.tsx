import { deepSignal } from "deepsignal";
import { Signal, effect, signal } from "@preact/signals-core";
import { createElement, render } from "preact";
import { setupRerender, act } from "preact/test-utils";

const sleep = (ms?: number) => new Promise(r => setTimeout(r, ms));

describe("deepsignal", () => {
	let scratch: HTMLDivElement;
	let rerender: () => void;

	beforeEach(() => {
		scratch = document.createElement("div");
		rerender = setupRerender();
	});

	afterEach(() => {
		render(null, scratch);
	});

	it("should return signal value by default", () => {
		const nested = { b: 2 };
		const array = [3, nested];
		const v = { a: 1, nested, array };
		const s = deepSignal(v);
		const a = deepSignal(["a"]);
		a.$length;
		a.length;
		expect(s.a).to.equal(1);
		expect(s.nested).to.have.property("b", 2);
		expect(s.nested.b).to.equal(2);
		expect(s.array[0]).to.equal(3);
		expect(s.array[1]).to.have.property("b", 2);
		expect(s.array[1].b).to.equal(2);
		expect(s.array.length).to.equal(2);
	});

	it("should return signal instance when using $", () => {
		const nested = { b: 2 };
		const array = [3, nested];
		const v = { a: 1, nested, array };
		const s = deepSignal(v);
		expect(s.$a).to.be.instanceOf(Signal);
		expect(s.$a!.value).to.equal(1);
		expect(s.$nested).to.be.instanceOf(Signal);
		expect(s.$nested!.value).to.have.property("b", 2);
		expect(s.nested.$b).to.be.instanceOf(Signal);
		expect(s.nested.$b!.value).to.equal(2);
		expect(s.$array).to.be.instanceOf(Signal);
		expect(s.$array!.value).to.have.property("0", 3);
		expect(s.array.$0).to.be.instanceOf(Signal);
		expect(s.array.$0.value).to.equal(3);
		expect(s.array.$1).to.be.instanceOf(Signal);
		expect(s.array.$1.value).to.have.property("b", 2);
		expect(s.array[1].$b).to.be.instanceOf(Signal);
		expect(s.array[1].$b.value).to.equal(2);
		expect(s.array.$length).to.be.instanceOf(Signal);
		expect(s.array.$length.value).to.equal(2);
	});

	it("signal should return peek (value)", () => {
		const nested = { b: 2 };
		const array = [3, nested];
		const v = { a: 1, nested, array };
		const s = deepSignal(v);
		expect(s.$a!.peek()).to.equal(1);
		expect(s.$nested!.peek()).to.have.property("b", 2);
		expect(s.$nested!.peek().b).to.equal(2);
		expect(s.nested.$b!.peek()).to.equal(2);
		expect(s.$array!.peek()).to.have.property("0", 3);
		expect(s.$array!.peek()[0]).to.equal(3);
		expect(s.$array!.peek()[1]).to.have.property("b", 2);
		expect(s.array.$1!.peek().b).to.equal(2);
		expect(s.array[1].$b!.peek()).to.equal(2);
		expect(s.$array!.peek().length).to.equal(2);
		expect(s.array.$length!.peek()).to.equal(2);
	});

	it("should subscribe to changes", () => {
		const nested = { b: 2 };
		const array = [3, nested];
		const v = { a: 1, nested, array };
		const s = deepSignal(v);

		const spy1 = sinon.spy(() => s.a);
		const spy2 = sinon.spy(() => s.nested);
		const spy3 = sinon.spy(() => s.nested.b);
		const spy4 = sinon.spy(() => s.array[0]);
		const spy5 = sinon.spy(() => s.array[1].b);

		effect(spy1);
		effect(spy2);
		effect(spy3);
		effect(spy4);
		effect(spy5);

		expect(spy1).callCount(1);
		expect(spy2).callCount(1);
		expect(spy3).callCount(1);
		expect(spy4).callCount(1);
		expect(spy5).callCount(1);

		s.a = 11;

		expect(spy1).callCount(2);
		expect(spy2).callCount(1);
		expect(spy3).callCount(1);
		expect(spy4).callCount(1);
		expect(spy5).callCount(1);

		s.nested.b = 22;

		expect(spy1).callCount(2);
		expect(spy2).callCount(1);
		expect(spy3).callCount(2);
		expect(spy4).callCount(1);
		expect(spy5).callCount(2); // nested also exists array[1]

		s.nested = { b: 222 };

		expect(spy1).callCount(2);
		expect(spy2).callCount(2);
		expect(spy3).callCount(3);
		expect(spy4).callCount(1);
		expect(spy5).callCount(2); // now s.nested has a different reference

		s.array[0] = 33;

		expect(spy1).callCount(2);
		expect(spy2).callCount(2);
		expect(spy3).callCount(3);
		expect(spy4).callCount(2);
		expect(spy5).callCount(2);

		s.array[1].b = 2222;

		expect(spy1).callCount(2);
		expect(spy2).callCount(2);
		expect(spy3).callCount(3);
		expect(spy4).callCount(2);
		expect(spy5).callCount(3);

		s.array[1] = { b: 22222 };

		expect(spy1).callCount(2);
		expect(spy2).callCount(2);
		expect(spy3).callCount(3);
		expect(spy4).callCount(2);
		expect(spy5).callCount(4);

		s.array.push(4);

		expect(spy1).callCount(2);
		expect(spy2).callCount(2);
		expect(spy3).callCount(3);
		expect(spy4).callCount(2);
		expect(spy5).callCount(4);

		s.array[3] = 5;

		expect(spy1).callCount(2);
		expect(spy2).callCount(2);
		expect(spy3).callCount(3);
		expect(spy4).callCount(2);
		expect(spy5).callCount(4);

		s.array = [333, { b: 222222 }];

		expect(spy1).callCount(2);
		expect(spy2).callCount(2);
		expect(spy3).callCount(3);
		expect(spy4).callCount(3);
		expect(spy5).callCount(5);
	});

	it("should subscribe to array length", () => {
		const array = [1];
		const s = deepSignal({ array });
		const spy1 = sinon.spy(() => s.array.length);
		const spy2 = sinon.spy(() => s.array.map((i: number) => i));

		effect(spy1);
		effect(spy2);
		expect(spy1).callCount(1);
		expect(spy2).callCount(1);

		s.array.push(2);
		expect(s.array.length).to.equal(2);
		expect(spy1).callCount(2);
		expect(spy2).callCount(2);

		s.array[2] = 3;
		expect(s.array.length).to.equal(3);
		expect(spy1).callCount(3);
		expect(spy2).callCount(3);

		s.array = s.array.filter((i: number) => i <= 2);
		expect(s.array.length).to.equal(2);
		expect(spy1).callCount(4);
		expect(spy2).callCount(4);
	});

	it.only("should not subscribe to changes when peeking", () => {
		const nested = { b: 2 };
		const array = [3, nested];
		const v = { a: 1, nested, array };
		const s = deepSignal(v);

		const spy1 = sinon.spy(() => s.$$a);
		const spy2 = sinon.spy(() => s.$$nested);
		const spy3 = sinon.spy(() => s.$$nested.b);
		const spy4 = sinon.spy(() => s.$$array[0]);
		const spy5 = sinon.spy(() => s.$$array[1].b);
		const spy6 = sinon.spy(() => s.$$array.length);

		effect(spy1);
		effect(spy2);
		effect(spy3);
		effect(spy4);
		effect(spy5);
		effect(spy6);

		expect(spy1).callCount(1);
		expect(spy2).callCount(1);
		expect(spy3).callCount(1);
		expect(spy4).callCount(1);
		expect(spy5).callCount(1);
		expect(spy6).callCount(1);

		s.a = 11;
		s.nested.b = 22;
		s.nested = { b: 222 };
		s.array[0] = 33;
		s.array[1].b = 2222;
		s.array.push(4);

		expect(spy1).callCount(1);
		expect(spy2).callCount(1);
		expect(spy3).callCount(1);
		expect(spy4).callCount(1);
		expect(spy5).callCount(1);
		expect(spy6).callCount(1);
	});

	it("should respect object references", () => {
		const nested = { b: 2 };
		const array = [3, nested];
		const obj = { a: 1, nested, array };
		const s1 = deepSignal(nested);
		const s2 = deepSignal(array);
		const s3 = deepSignal(obj);

		const spy1 = sinon.spy(() => s1.b);
		const spy2 = sinon.spy(() => s3.nested.b);
	});
});
