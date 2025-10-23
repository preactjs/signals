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
- [React Integration](#react-integration)
  - [Babel Transform](#babel-transform)
  - [`useSignals` hook](#usesignals-hook)
  - [Hooks](#hooks)
  - [Using signals with React's SSR APIs](#using-signals-with-reacts-ssr-apis)
  - [Rendering optimizations](#rendering-optimizations)
  - [Utility Components and Hooks](#utility-components-and-hooks)
    - [Show Component](#show-component)
    - [For Component](#for-component)
    - [Additional Hooks](#additional-hooks)
      - [`useLiveSignal`](#uselivesignal)
      - [`useSignalRef`](#usesignalref)
  - [Limitations](#limitations)
- [License](#license)

## React Integration

The React integration can be installed via:

```sh
npm install @preact/signals-react
```

We have a couple of options for integrating Signals into React. The recommended approach is to use the Babel transform to automatically make your components that use signals reactive.

### Babel Transform

Install the Babel transform package (`npm i --save-dev @preact/signals-react-transform`) and add the following to your Babel config:

```json
{
	"plugins": [["module:@preact/signals-react-transform"]]
}
```

This will automatically transform your components to be reactive. You can then use signals directly inside your components.

```js
import { signal } from "@preact/signals-react";

const count = signal(0);

function CounterValue() {
	// Whenever the `count` signal is updated, we'll
	// re-render this component automatically for you
	return <p>Value: {count.value}</p>;
}
```

See the [Readme for the Babel plugin](../react-transform/README.md) for more details about how the transform works and configuring it.

### `useSignals` hook

If you can't use the Babel transform, you can directly call the `useSignals` hook to make your components reactive.

```js
import { useSignals } from "@preact/signals-react/runtime";

const count = signal(0);

function CounterValue() {
	useSignals();
	return <p>Value: {count.value}</p>;
}
```

### Hooks

If you need to instantiate new signals or create new side effects on signal changes inside your components, you can use the `useSignal`, `useComputed` and `useSignalEffect` hooks.

```js
import { useSignal, useComputed, useSignalEffect } from "@preact/signals-react";

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

### Using signals with React's SSR APIs

Components rendered using SSR APIs (e.g. `renderToString`) in a server environment (i.e. an environment without a global `window` object) will not track signals used during render. Components generally don't rerender when using SSR APIs so tracking signal usage is useless since changing these signals can't trigger a rerender.

### Rendering optimizations

The React adapter ships with several optimizations it can apply out of the box to skip virtual-dom rendering entirely. If you pass a signal directly into JSX, it will bind directly to the DOM `Text` node that is created and update that whenever the signal changes.

```js
import { signal } from "@preact/signals-react";

const count = signal(0);

// Unoptimized: Will trigger the surrounding
// component to re-render
function Counter() {
	return <p>Value: {count.value}</p>;
}

// Optimized: Will update the text node directly
function Counter() {
	return (
		<p>
			<>Value: {count}</>
		</p>
	);
}
```

To opt into this optimization, simply pass the signal directly instead of accessing the `.value` property.

> **Note**
> The content is wrapped in a React Fragment due to React 18's newer, more strict children types.

### Utility Components and Hooks

The `@preact/signals-react/utils` package provides additional utility components and hooks to make working with signals even easier.

#### Show Component

The `Show` component provides a declarative way to conditionally render content based on a signal's value.

```js
import { Show } from "@preact/signals-react/utils";
import { signal } from "@preact/signals-react";

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
import { For } from "@preact/signals-react/utils";
import { signal } from "@preact/signals-react";

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
import { useLiveSignal } from "@preact/signals-react/utils";
import { signal } from "@preact/signals-react";

const external = signal(0);

function Component() {
	const local = useLiveSignal(external);
	// local will automatically update when external changes
}
```

##### useSignalRef

The `useSignalRef` hook creates a signal that behaves like a React ref with a `.current` property.

```js
import { useSignalRef } from "@preact/signals-react/utils";

function Component() {
	const ref = useSignalRef(null);
	return <div ref={ref}>The ref's value is {ref.current}</div>;
}
```

### Limitations

This version of React integration does not support passing signals as DOM attributes. Support for this may be added at a later date.

Using signals in render props is not recommended. In this situation, the component that reads the signal is the component that calls the render prop, which may or may not be hooked up to track signals. For example:

```js
const count = signal(0);

function ShowCount({ getCount }) {
	return <div>{getCount()}</div>;
}

function App() {
	return <ShowCount getCount={() => count.value} />;
}
```

Here, the `ShowCount` component is the one that accesses `count.value` at runtime since it invokes `getCount`, so it needs to be hooked up to track signals. However, since it doesn't statically access the signal, the Babel transform won't transform it by default. One fix is to set `mode: all` in the Babel plugin's config, which will transform all components. Another workaround is put the return of the render prop into it's own component and then return that from your render prop. In the following example, the `Count` component statically accesses the signal, so it will be transformed by default.

```js
const count = signal(0);

function ShowCount({ getCount }) {
	return <div>{getCount()}</div>;
}

const Count = () => <>{count.value}</>;

function App() {
	return <ShowCount getCount={() => <Count />} />;
}
```

Similar issues exist with using object getters & setters. Since the it isn't easily statically analyzable that a getter or setter is backed by a signal, the Babel plugin may miss some components that use signals in this way. Similarly, setting Babel's plugin to `mode: all` will fix this issue.

## License

`MIT`, see the [LICENSE](../../LICENSE) file.
