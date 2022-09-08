
# Signals

Signals is a performant state management library with two primary goals:

1. Make it as easy as possible to write business logic for small up to complex apps. No matter how complex your logic is, your app updates should stay fast without you needing to think about it. Signals automatically optimize state updates behind the scenes to trigger the fewest updates necessary. They are lazy by default and automatically skip signals that no one listens to.
2. Integrate into frameworks as if they were native built-in primitives. You don't need any selectors, wrapper functions, or anything else. Signals can be accessed directly and your component will automatically re-render when the signal's value changes.

Read the [announcement post](https://preactjs.com/blog/introducing-signals/) to learn more about which problems signals solves and how it came to be.

## Installation:

```sh
npm install @preact/signals-react
```

- [Guide / API](../../README.md#guide--api)
	- [`signal(initialValue)`](../../README.md#signalinitialvalue)
		- [`signal.peek()`](../../README.md#signalpeek)
	- [`computed(fn)`](../../README.md#computedfn)
	- [`effect(fn)`](../../README.md#effectfn)
	- [`batch(fn)`](../../README.md#batchfn)
- [React Integration](#react-integration)
	- [Hooks](#hooks)
- [License](#license)

## React Integration

The React integration can be installed via:

```sh
npm install @preact/signals-react
```

Similar to the Preact integration, the React adapter allows you to access signals directly inside your components and will automatically subscribe to them.

```js
import { signal } from "@preact/signals-react";

const count = signal(0);

function CounterValue() {
	// Whenver the `count` signal is updated, we'll
	// re-render this component automatically for you
	return <p>Value: {count.value}</p>;
}
```

### Hooks

If you need to instantiate new signals inside your components, you can use the `useSignal` or `useComputed` hook.

```js
import { useSignal, useComputed } from "@preact/signals-react";

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

## License

`MIT`, see the [LICENSE](../../LICENSE) file.

