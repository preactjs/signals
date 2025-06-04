# Signals

Signals is a performant state management library with two primary goals:

1. Make it as easy as possible to write business logic for small up to complex apps. No matter how complex your logic is, your app updates should stay fast without you needing to think about it. Signals automatically optimize state updates behind the scenes to trigger the fewest updates necessary. They are lazy by default and automatically skip signals that no one listens to.
2. Integrate into frameworks as if they were native built-in primitives. You don't need any selectors, wrapper functions, or anything else. Signals can be accessed directly and your component will automatically re-render when the signal's value changes.

Read the [announcement post](https://preactjs.com/blog/introducing-signals/) to learn more about which problems signals solves and how it came to be.

- [Core API](../core/README.md#guide--api)
  - [`signal(initialValue)`](../core/README.md#signalinitialvalue)
    - [`signal.peek()`](../core/README.md#signalpeek)
  - [`computed(fn)`](../core/README.md#computedfn)
  - [`effect(fn)`](../core/README.md#effectfn)
  - [`batch(fn)`](../core/README.md#batchfn)
  - [`untracked(fn)`](../core/README.md#untrackedfn)
- [Preact Integration](#preact-integration)
  - [Hooks](#hooks)
  - [Rendering optimizations](#rendering-optimizations)
    - [Attribute optimization (experimental)](#attribute-optimization-experimental)
  - [Utility Components and Hooks](#utility-components-and-hooks)
    - [Show Component](#show-component)
    - [For Component](#for-component)
    - [Additional Hooks](#additional-hooks)
      - [`useLiveSignal`](#uselivesignal)
      - [`useSignalRef`](#usesignalref)
- [License](#license)

## Preact Integration

The Preact integration can be installed via:

```sh
npm install @preact/signals
```

It allows you to access signals as if they were native to Preact. Whenever you read a signal inside a component we'll automatically subscribe the component to that. When you update the signal we'll know that this component needs to be updated and will do that for you.

```js
// The Preact adapter re-exports the core library
import { signal } from "@preact/signals";

const count = signal(0);

function CounterValue() {
	// Whenever the `count` signal is updated, we'll
	// re-render this component automatically for you
	return <p>Value: {count.value}</p>;
}
```

### Hooks

If you need to instantiate new signals or create new side effects on signal changes inside your components, you can use the `useSignal`, `useComputed` and `useSignalEffect` hooks.

```js
import { useSignal, useComputed, useSignalEffect } from "@preact/signals";

function Counter() {
	const count = useSignal(0);
	const double = useComputed(() => count.value * 2);

	useSignalEffect(() => {
		console.log(`Value: ${count.value}, value x 2 = ${double.value}`);
	});

	return (
		<button onClick={() => count.value++}>
			Value: {count.value}, value x 2 = {double.value}
		</button>
	);
}
```

### Rendering optimizations

The Preact adapter ships with several optimizations it can apply out of the box to skip virtual-dom rendering entirely. If you pass a signal directly into JSX, it will bind directly to the DOM `Text` node that is created and update that whenever the signal changes.

```js
import { signal } from "@preact/signals";

const count = signal(0);

// Unoptimized: Will trigger the surrounding
// component to re-render
function Counter() {
	return <p>Value: {count.value}</p>;
}

// Optimized: Will update the text node directly
function Counter() {
	return <p>Value: {count}</p>;
}
```

To opt into this optimization, simply pass the signal directly instead of accessing the `.value` property.

#### Attribute optimization (experimental)

We can also pass signals directly as an attribute to an HTML element node.

```js
import { signal } from "@preact/signals";

const inputValue = signal("foobar");

function Person() {
	return <input value={inputValue} onInput={...} />;
}
```

This way we'll bypass checking the virtual-dom and update the DOM property directly.

### Utility Components and Hooks

The `@preact/signals/utils` package provides additional utility components and hooks to make working with signals even easier.

#### Show Component

The `Show` component provides a declarative way to conditionally render content based on a signal's value.

```js
import { Show } from "@preact/signals/utils";
import { signal } from "@preact/signals";

const isVisible = signal(false);

function App() {
	return (
		<Show when={isVisible} fallback={<p>Nothing to see here</p>}>
			<p>Now you see me!</p>
		</Show>
	);
}

// You can also use a function to access the value
function App() {
	return <Show when={isVisible}>{value => <p>The value is {value}</p>}</Show>;
}
```

#### For Component

The `For` component helps you render lists from signal arrays with automatic caching of rendered items.

```js
import { For } from "@preact/signals/utils";
import { signal } from "@preact/signals";

const items = signal(["A", "B", "C"]);

function App() {
	return (
		<For each={items} fallback={<p>No items</p>}>
			{(item, index) => <div key={index}>Item: {item}</div>}
		</For>
	);
}
```

#### Additional Hooks

##### useLiveSignal

The `useLiveSignal` hook allows you to create a local signal that stays synchronized with an external signal.

```js
import { useLiveSignal } from "@preact/signals/utils";
import { signal } from "@preact/signals";

const external = signal(0);

function Component() {
	const local = useLiveSignal(external);
	// local will automatically update when external changes
}
```

##### useSignalRef

The `useSignalRef` hook creates a signal that behaves like a React ref with a `.current` property.

```js
import { useSignalRef } from "@preact/signals/utils";

function Component() {
	const ref = useSignalRef(null);
	return <div ref={ref}>The ref's value is {ref.current}</div>;
}
```

## License

`MIT`, see the [LICENSE](../../LICENSE) file.
