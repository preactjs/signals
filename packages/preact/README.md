# Signals

Signals is a performant state management library with two primary goals:

1. Make it as easy as possible to write business logic for small up to complex apps. No matter how complex your logic is, your app updates should stay fast without you needing to think about it. Signals automatically optimize state updates behind the scenes to trigger the fewest updates necessary. They are lazy by default and automatically skip signals that no one listens to.
2. Integrate into frameworks as if they were native built-in primitives. You don't need any selectors, wrapper functions, or anything else. Signals can be accessed directly and your component will automatically re-render when the signal's value changes.

Read the [announcement post](https://preactjs.com/blog/introducing-signals/) to learn more about which problems signals solves and how it came to be.

## Installation:

```sh
npm install @preact/signals
```

- [Guide / API](../../README.md#guide--api)
  - [`signal(initialValue)`](../../README.md#signalinitialvalue)
    - [`signal.peek()`](../../README.md#signalpeek)
  - [`computed(fn)`](../../README.md#computedfn)
  - [`effect(fn)`](../../README.md#effectfn)
  - [`batch(fn)`](../../README.md#batchfn)
  - [`untracked(fn)`](../../README.md#untrackedfn)
- [Preact Integration](#preact-integration)
  - [Hooks](#hooks)
  - [Rendering optimizations](#rendering-optimizations)
    - [Attribute optimization (experimental)](#attribute-optimization-experimental)
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

If you need to instantiate new signals inside your components, you can use the `useSignal` or `useComputed` hook.

```js
import { useSignal, useComputed } from "@preact/signals";

function Counter() {
	const count = useSignal(0);
	const double = useComputed(() => count.value * 2);

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

## License

`MIT`, see the [LICENSE](../../LICENSE) file.
