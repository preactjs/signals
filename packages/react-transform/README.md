# Signals React Transform

> A Babel plugin to transform React components to automatically subscribe to Preact Signals.

Signals is a performant state management library with two primary goals:

1. Make it as easy as possible to write business logic for small up to complex apps. No matter how complex your logic is, your app updates should stay fast without you needing to think about it. Signals automatically optimize state updates behind the scenes to trigger the fewest updates necessary. They are lazy by default and automatically skip signals that no one listens to.
2. Integrate into frameworks as if they were native built-in primitives. You don't need any selectors, wrapper functions, or anything else. Signals can be accessed directly and your component will automatically re-render when the signal's value changes.

Read the [announcement post](https://preactjs.com/blog/introducing-signals/) to learn more about which problems signals solves and how it came to be.

## Installation:

```sh
npm i --save-dev @preact/signals-react-transform
```

## Usage

This package works with the `@preact/signals-react` package to integrate signals into React. You use the `@preact/signals-react` package to setup and access signals inside your components and this package is one way to automatically subscribe your components to rerender when the signals you use change. To understand how to use signals in your components, check out the [Signals React documentation](../react/README.md).

To setup the transform plugin, add the following to your Babel config:

```js
// babel.config.js
module.exports = {
	plugins: [["module:@preact/signals-react-transform"]],
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
	const store = useSignals(1);
	try {
		// Whenever the `count` signal is updated, we'll
		// re-render this component automatically for you
		return <p>Value: {count.value}</p>;
	} finally {
		store.f();
	}
}
```

The `useSignals` hook setups the machinery to observe what signals are used inside the component and then automatically re-render the component when those signals change. The `f()` function notifies the tracking mechanism that this component has finished rendering. When your component unmounts, it also unsubscribes from all signals it was using.

Fundamentally, this Babel transform needs to answer two questions in order to know whether to transform a function:

1. Is a function a component?
2. If so, does this component use signals?

Currently we use the following heuristics to answer these questions:

1. A function is a component if it has a capitalized name (e.g. `function MyComponent() {}`) and contains JSX.
2. If a function's body includes a member expression referencing `.value` (i.e. `something.value`), we assume it's a signal.

If your function/component meets these criteria, this plugin will transform it. If not, it will be left alone. If you have a function that uses signals but does not meet these criteria (e.g. a function that manually calls `createElement` instead of using JSX), you can add a comment with the string `@useSignals` to instruct this plugin to transform this function. You can also manually opt-out of transforming a function by adding a comment with the string `@noUseSignals`.

```js
// This function will be transformed
/** @useSignals */
function MyComponent() {
	return createElement("h1", null, signal.value);
}

// This function will not be transformed
/** @noUseSignals */
function MyComponent() {
	return <p>{signal.value}</p>;
}
```

## Plugin Options

### `mode`

The `mode` option enables you to control how the plugin transforms your code. There are three modes:

- `mode: "auto"` (default): This mode will automatically transform any function that meets the criteria described above. This is the easiest way to get started with signals.
- `mode: "manual"`: This mode will only transform functions that have a comment with the string `@useSignals`. This is useful if you want to manually control which functions are transformed.
- `mode: "all"`: This mode will transform all functions that appear to be Components, regardless of whether or not they use signals. This is useful if you are starting a new project and want to use signals everywhere.

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

### `importSource`

The `importSource` option enables you to control where the `useSignals` hook is imported from. By default, it will import from `@preact/signals-react`. This is useful if you want to wrap the exports of the `@preact/signals-react` package to provide customized behavior or if you want to use a different package entirely. Note: if you use a different package, you'll need to make sure that it exports a `useSignals` hook with the same API & behavior as the one in `@preact/signals-react`.

```js
// babel.config.js
module.exports = {
	plugins: [
		[
			"@preact/signals-react-transform",
			{
				importSource: "my-signals-package",
			},
		],
	],
};
```

## Logging

This plugin uses the [`debug`](https://www.npmjs.com/package/debug) package to log information about what it's doing. To enable logging, set the `DEBUG` environment variable to `signals:react-transform:*`.

## License

`MIT`, see the [LICENSE](../../LICENSE) file.
