# Signals React Transform

> A Babel plugin to transform React components to automatically subscribe to Preact Signals.

Signals is a performant state management library with two primary goals:

1. Make it as easy as possible to write business logic for small up to complex apps. No matter how complex your logic is, your app updates should stay fast without you needing to think about it. Signals automatically optimize state updates behind the scenes to trigger the fewest updates necessary. They are lazy by default and automatically skip signals that no one listens to.
2. Integrate into frameworks as if they were native built-in primitives. You don't need any selectors, wrapper functions, or anything else. Signals can be accessed directly and your component will automatically re-render when the signal's value changes.

Read the [announcement post](https://preactjs.com/blog/introducing-signals/) to learn more about which problems signals solves and how it came to be.

## Installation:

```sh
npm install @preact/signals-react-transform
```

## Usage

This package works with the `@preact/signals-react` package to integrate signals into React. You use the `@preact/signals-react` package to setup and access signals inside your components and this package is one way to automatically subscribe your components to rerender when the signals you use change.

To understand how to use signals in your components, check out the [Signals React documentation](../react/README.md). This babel transform is one of a couple different ways to use signals in React. To see other ways, including integrations that don't require a build step, see the [Signals React documentation](../react/README.md).

Then, setup the transform plugin in your Babel config:

```js
// babel.config.js
module.exports = {
	plugins: [["@preact/signals-react-transform"]],
};
```

Here is an example of a component using signals:

```js
import { signal } from "@preact/signals-react";

const count = signal(0);

function CounterValue() {
	// Whenever the `count` signal is updated, we'll
	// re-render this component automatically for you
	return <p>Value: {count.value}</p>;
}
```

After the babel transform runs, it'll look something like:

```js
import { signal, useSignals } from "@preact/signals-react";

const count = signal(0);

function CounterValue() {
	const effect = useSignals();
	try {
		// Whenever the `count` signal is updated, we'll
		// re-render this component automatically for you
		return <p>Value: {count.value}</p>;
	} finally {
		effect.endTracking();
	}
}
```

The `useSignals` hook setups the machinery to observe what signals are used inside the component and then automatically re-render the component when those signals change. The `endTracking` function notifies the tracking mechanism that this component has finished rendering. When your component unmounts, it also unsubscribes from all signals it was using.

Fundamentally, this Babel transform needs to answer two questions in order to know whether to transform a function:

1. Is a function a component?
2. If so, does this component use signals?

Currently we use the following heuristics to answer these questions:

1. A function is a component if it has a capitalized name (e.g. `function MyComponent() {}`), contains JSX, and is declared at module scope.
2. If a function's body includes a member expression referencing `.value` (i.e. `something.value`), we assume it's a signal.

If your function/component meets these criteria, this plugin will transform it. If not, it will be left alone. If you have a function that uses signals but does not meet these criteria (e.g. a function that manually calls `createElement` instead of using JSX), you can add a comment with the string `@trackSignals` to instruct this plugin to transform this function. You can also manually opt-out of transforming a function by adding a comment with the string `@noTrackSignals`.

```js
// This function will be transformed
/** @trackSignals */
function MyComponent() {
	return createElement("h1", null, signal.value);
}

// This function will not be transformed
/** @noTrackSignals */
function MyComponent() {
	return <p>{signal.value}</p>;
}
```

Note, this plugin will not transform higher-order components (HOCs) that wrap other components. If you have an HOC that uses signals, you can use the `@trackSignals` comment to transform the body of the higher-order component.

## Plugin Options

### `mode`

The `mode` option enables you to control how the plugin transforms your code. There are two modes:

- `mode: "auto"` (default): This mode will automatically transform any function that meets the criteria described above. This is the easiest way to get started with signals.
- `mode: "manual"`: This mode will only transform functions that have a comment with the string `@trackSignals`. This is useful if you want to manually control which functions are transformed.

```js
// babel.config.js
module.exports = {
	plugins: [
		[
			"@preact/signals-react-transform",
			{
				mode: "manual",
			},
		],
	],
};
```

## License

`MIT`, see the [LICENSE](../../LICENSE) file.
