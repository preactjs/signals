import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, render } from "preact";
import { act } from "preact/test-utils";
import {
	signal,
	computed,
	unstable_startDomBindingTracking,
	type DomBindingSource,
} from "@preact/signals";

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe("experimental DOM binding metadata", () => {
	let source: DomBindingSource;
	let scratch: HTMLDivElement;
	beforeEach(() => {
		source = unstable_startDomBindingTracking();
		scratch = document.createElement("div");
		document.body.appendChild(scratch);
	});
	afterEach(() => {
		render(null, scratch);
		source.dispose();
		scratch.remove();
	});

	it("discovers text and property effects without reading values or rerendering", async () => {
		const count = signal(1);
		const spy = vi.fn();
		function App() {
			spy();
			// @ts-ignore signal-valued DOM props are supported at runtime
			return (
				<div>
					<span>{count}</span>
					<input value={count} />
				</div>
			);
		}
		render(<App />, scratch);
		const first = source.getSnapshot();
		expect(first.truncated).to.equal(false);
		expect(first.bindings.map(b => b.kind).sort()).to.deep.equal([
			"property",
			"text",
		]);
		expect(first.bindings.every(b => b.signal === count)).to.equal(true);
		expect(first.bindings.every(Object.isFrozen)).to.equal(true);
		expect(
			first.bindings.find(b => b.kind === "text")!.target.nodeType
		).to.equal(3);
		const prop = first.bindings.find(b => b.kind === "property")!;
		expect(prop.target).to.equal(scratch.querySelector("input"));
		expect(prop.property).to.equal("value");
		expect(prop.updates).to.equal(0);
		const listener = vi.fn();
		const off = source.subscribe(listener);
		act(() => {
			count.value = 2;
		});
		await settle();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledTimes(1);
		const second = source.getSnapshot();
		expect(second.bindings.map(b => b.id)).to.deep.equal(
			first.bindings.map(b => b.id)
		);
		expect(second.bindings.every(b => b.updates === 1)).to.equal(true);
		expect(first.bindings.every(b => b.updates === 0)).to.equal(true);
		off();
	});

	it("preserves binding identity when changing signals and cleans replaced props", async () => {
		const a = signal("a");
		const b = signal("b");
		const view = (value: unknown) => <input value={value as string} />;
		render(view(a), scratch);
		const first = source.getSnapshot().bindings[0];
		render(view(b), scratch);
		const second = source.getSnapshot().bindings[0];
		expect(second.id).to.equal(first.id);
		expect(second.effect).to.equal(first.effect);
		expect(second.signal).to.equal(b);
		render(view("plain"), scratch);
		expect(source.getSnapshot().bindings).to.deep.equal([]);
		act(() => {
			b.value = "stale";
		});
		await settle();
		expect((scratch.firstChild as HTMLInputElement).value).to.equal("plain");
	});

	it("retargets text/JSX transitions and handles swapping signal references", async () => {
		const a = signal<any>("one");
		const b = signal("other");
		const view = (s: typeof a) => <span>{s}</span>;
		render(view(a), scratch);
		const first = source.getSnapshot().bindings[0];
		render(view(b), scratch);
		await settle();
		expect(source.getSnapshot().bindings[0].signal).to.equal(b);
		expect(source.getSnapshot().bindings[0].id).to.equal(first.id);
		render(view(a), scratch);
		act(() => {
			a.value = <strong>jsx</strong>;
		});
		await settle();
		expect(source.getSnapshot().bindings).to.deep.equal([]);
		act(() => {
			a.value = "text again";
		});
		await settle();
		const next = source.getSnapshot().bindings[0];
		expect(next.target).to.equal(scratch.firstChild!.firstChild);
		expect(next.signal).to.equal(a);
	});

	it("tracks attribute removal and releases bindings on unmount", async () => {
		const label = signal<string | null>("label");
		// @ts-ignore signal-valued DOM props
		render(<div data-label={label} />, scratch);
		act(() => {
			label.value = null;
		});
		await settle();
		expect((scratch.firstChild as Element).hasAttribute("data-label")).to.equal(
			false
		);
		expect(source.getSnapshot().bindings[0].updates).to.equal(1);
		render(null, scratch);
		expect(source.getSnapshot().bindings).to.deep.equal([]);
	});

	it("bounds discovery and isolates observer failures", async () => {
		const report = vi.spyOn(console, "error").mockImplementation(() => {});
		const good = vi.fn();
		source.subscribe(() => {
			throw new Error("observer");
		});
		const off = source.subscribe(good);
		const s = signal(0);
		render(<span>{s}</span>, scratch);
		expect(source.getSnapshot(0)).to.deep.equal({
			bindings: [],
			truncated: true,
		});
		expect(() => source.getSnapshot(-1)).to.throw(RangeError);
		await settle();
		expect(good).toHaveBeenCalledTimes(1);
		off();
		off();
		act(() => {
			s.value++;
		});
		await settle();
		expect(good).toHaveBeenCalledTimes(1);
		expect(report).toHaveBeenCalled();
		report.mockRestore();
	});

	it("does not evaluate inactive computeds and releases registry references on dispose", () => {
		const evaluate = vi.fn(() => 1);
		computed(evaluate);
		source.getSnapshot();
		expect(evaluate).not.toHaveBeenCalled();
		const s = signal(1);
		render(<span>{s}</span>, scratch);
		const listener = vi.fn();
		source.subscribe(listener);
		const { dispose } = source;
		dispose();
		const replacement = unstable_startDomBindingTracking();
		source.dispose(); // Old owners cannot disable a newer session.
		expect(() => unstable_startDomBindingTracking()).to.throw(
			/already enabled/
		);
		replacement.dispose();
		expect(source.getSnapshot().bindings).to.deep.equal([]);
		expect(() => source.subscribe(listener)).to.throw(/disposed/);
	});
});
