# Signals

Signals is a performant state management library with two primary goals:

1. Make it as easy as possible to write business logic for small up to complex apps. No matter how complex your logic is, your app updates should stay fast without you needing to think about it. Signals automatically optimize state updates behind the scenes to trigger the fewest updates necessary. They are lazy by default and automatically skip signals that no one listens to.
2. Integrate into frameworks as if they were native built-in primitives. You don't need any selectors, wrapper functions, or anything else. Signals can be accessed directly and your component will automatically re-render when the signal's value changes.

Read the [announcement post](https://preactjs.com/blog/introducing-signals/) to learn more about which problems signals solves and how it came to be.

- [Core API](./packages/core/README.md#guide--api)
  - [`signal(initialValue)`](./packages/core/README.md#signalinitialvalue)
    - [`signal.peek()`](./packages/core/README.md#signalpeek)
  - [`computed(fn)`](./packages/core/README.md#computedfn)
  - [`effect(fn)`](./packages/core/README.md#effectfn)
  - [`batch(fn)`](./packages/core/README.md#batchfn)
  - [`untracked(fn)`](./packages/core/README.md#untrackedfn)
- [Preact Integration](./packages/preact/README.md#preact-integration)
  - [Hooks](./packages/preact/README.md#hooks)
  - [Rendering optimizations](./packages/preact/README.md#rendering-optimizations)
    - [Attribute optimization (experimental)](./packages/preact/README.md#attribute-optimization-experimental)
  - [Utility Components and Hooks](./packages/preact/README.md#utility-components-and-hooks)
    - [Show Component](./packages/preact/README.md#show-component)
    - [For Component](./packages/preact/README.md#for-component)
    - [Additional Hooks](./packages/preact/README.md#additional-hooks)
      - [`useLiveSignal`](./packages/preact/README.md#uselivesignal)
      - [`useSignalRef`](./packages/preact/README.md#usesignalref)
- [React Integration](./packages/react/README.md#react-integration)
  - [Babel Transform](./packages/react/README.md#babel-transform)
  - [`useSignals` hook](./packages/react/README.md#usesignals-hook)
  - [Hooks](./packages/react/README.md#hooks)
  - [Using signals with React's SSR APIs](./packages/react/README.md#using-signals-with-reacts-ssr-apis)
  - [Rendering optimizations](./packages/react/README.md#rendering-optimizations)
  - [Utility Components and Hooks](./packages/react/README.md#utility-components-and-hooks)
    - [Show Component](./packages/react/README.md#show-component)
    - [For Component](./packages/react/README.md#for-component)
    - [Additional Hooks](./packages/react/README.md#additional-hooks)
      - [`useLiveSignal`](./packages/react/README.md#uselivesignal)
      - [`useSignalRef`](./packages/react/README.md#usesignalref)
  - [Limitations](./packages/react/README.md#limitations)
- [License](#license)

## License

`MIT`, see the [LICENSE](./LICENSE) file.
