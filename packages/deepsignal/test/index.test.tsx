import { deepSignal } from "deepsignal";
import { Signal, effect, signal } from "@preact/signals-core";
import { createElement, render } from "preact";
import { setupRerender, act } from "preact/test-utils";

const sleep = (ms?: number) => new Promise(r => setTimeout(r, ms));

describe.only("deepsignal", () => {
	let scratch: HTMLDivElement;
	let rerender: () => void;
	let nested = { b: 2 };
	let array = [3, nested];
	let v = { a: 1, nested, array };
	let s = deepSignal(v);

	beforeEach(() => {
		scratch = document.createElement("div");
		rerender = setupRerender();
		nested = { b: 2 };
		array = [3, nested];
		v = { a: 1, nested, array };
		s = deepSignal(v);
	});

	afterEach(() => {
		render(null, scratch);
	});

	it.only("should return like plain objects/arrays", () => {
		expect(s.a).to.equal(1);
		expect(s.nested.b).to.equal(2);
		expect(s.array[0]).to.equal(3);
		expect(typeof s.array[1] === "object" && s.array[1].b).to.equal(2);
		expect(s.array.length).to.equal(2);
	});

	it.only("should update like plain objects/arrays", () => {
		expect(s.a).to.equal(1);
		expect(s.nested.b).to.equal(2);
		s.a = 2;
		s.nested.b = 3;
		expect(s.a).to.equal(2);
		expect(s.nested.b).to.equal(3);
	});

	it.only("should update array length", () => {
		expect(s.array.length).to.equal(2);
		s.array.push(4);
		expect(s.array.length).to.equal(3);
		s.array.splice(1, 2);
		expect(s.array.length).to.equal(1);
	});

	it.only("should return signal instance when using $", () => {
		expect(s.$a).to.be.instanceOf(Signal);
		expect(s.$a!.value).to.equal(1);
		expect(s.$nested).to.be.instanceOf(Signal);
		expect(s.$nested!.value.b).to.equal(2);
		expect(s.nested.$b).to.be.instanceOf(Signal);
		expect(s.nested.$b!.value).to.equal(2);
		expect(s.$array).to.be.instanceOf(Signal);
		expect(s.$array!.value[0]).to.equal(3);
		expect(s.array.$![0]).to.be.instanceOf(Signal);
		expect(s.array.$![0].value).to.equal(3);
		expect(s.array.$![1]).to.be.instanceOf(Signal);
		expect(
			typeof s.array.$![1].value === "object" && s.array.$![1].value.b
		).to.equal(2);
		expect(typeof s.array[1] === "object" && s.array[1].$b).to.be.instanceOf(
			Signal
		);
		expect(typeof s.array[1] === "object" && s.array[1].$b!.value).to.equal(2);
		expect(s.array.$length).to.be.instanceOf(Signal);
		expect(s.array.$length!.value).to.equal(2);
	});

	it.only("should return peek when using $$", () => {
		expect(s.$$a).to.equal(1);
		expect(s.$$nested!.b).to.equal(2);
		expect(s.nested.$$b).to.equal(2);
		expect(s.$$array![0]).to.equal(3);
		expect(s.array.$$![0]).to.equal(3);
		expect(typeof s.$$array![1] === "object" && s.$$array![1].b).to.equal(2);
		expect(typeof s.array.$$![1] === "object" && s.array.$$![1].b).to.equal(2);
		expect(s.$$array!.length).to.equal(2);
		expect(s.array.$$length).to.equal(2);
	});

	it.only("should update array $length", () => {
		expect(s.array.$length!.value).to.equal(2);
		s.array.push(4);
		expect(s.array.$length!.value).to.equal(3);
		s.array.splice(1, 2);
		expect(s.array.$length!.value).to.equal(1);
	});

	it.only("should not return signals in plain arrays using $prop", () => {
		expect((s.array as any).$0).to.be.undefined;
	});

	it.only("should subscribe to changes", () => {
		const spy1 = sinon.spy(() => s.a);
		const spy2 = sinon.spy(() => s.nested);
		const spy3 = sinon.spy(() => s.nested.b);
		const spy4 = sinon.spy(() => s.array[0]);
		const spy5 = sinon.spy(
			() => typeof s.array[1] === "object" && s.array[1].b
		);

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

		if (typeof s.array[1] === "object") s.array[1].b = 2222;

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

	it.only("should subscribe to array length", () => {
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
		const spy1 = sinon.spy(() => s.$$a);
		const spy2 = sinon.spy(() => s.$$nested);
		const spy3 = sinon.spy(() => s.$$nested!.b);
		const spy4 = sinon.spy(() => s.$$array![0]);
		const spy5 = sinon.spy(() => {
			const nested = s.array.$$![1];
			if (typeof nested === "object") nested.b;
		});
		const spy6 = sinon.spy(() => s.array.$$length);

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
		if (typeof s.array[1] === "object") s.array[1].b = 2222;
		s.array.push(4);

		expect(spy1).callCount(1);
		expect(spy2).callCount(1);
		expect(spy3).callCount(1);
		expect(spy4).callCount(1);
		expect(spy5).callCount(1);
		expect(spy6).callCount(1);

		const spy7 = sinon.spy(() => s.nested.$$b);
		effect(spy7);
		expect(spy7).callCount(1);
		s.nested.b = 22;
		expect(spy7).callCount(1);
		s.nested = { b: 222 };
		expect(spy7).callCount(2);
	});

	it.skip("should preserve object references", () => {
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
