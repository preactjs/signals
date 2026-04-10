# Signals React Transform Rolldown Plugin

> A Rolldown plugin to transform React components so they automatically subscribe to Preact Signals.

This package applies the React Signals transform during Rolldown builds with Rolldown's native magic string pipeline, so React components and hooks can subscribe to signal reads without wiring Babel up manually.

## Installation

```sh
npm i --save-dev @preact/signals-react-transform-rolldown
npm i react @preact/signals-react
```

## Usage

```ts
import reactSignalsTransform from "@preact/signals-react-transform-rolldown";

export default {
	plugins: [
		reactSignalsTransform({
			mode: "auto",
		}),
	],
};
```

## Options

This plugin forwards the same options as `@preact/signals-react-transform`:

- `mode`
- `importSource`
- `detectTransformedJSX`
- `experimental`

Example:

```ts
reactSignalsTransform({
	detectTransformedJSX: true,
	experimental: {
		debug: true,
	},
});
```

## Notes

- Run it before other JSX transforms.
- The generated code imports `useSignals` from `@preact/signals-react/runtime` by default.
- When your code is already compiled to `react/jsx-runtime` or `React.createElement`, enable `detectTransformedJSX`.

## License

`MIT`, see the [LICENSE](../../LICENSE) file.
