# Signals React Transform SWC

A SWC plugin to transform React components and hooks so they automatically subscribe to Preact Signals.

## Installation

```sh
npm i --save-dev @preact/signals-react-transform-swc @swc/core
```

## Usage

Add the plugin to your SWC config:

```json
{
	"jsc": {
		"experimental": {
			"plugins": [["@preact/signals-react-transform-swc", { "mode": "auto" }]]
		}
	}
}
```

The plugin mirrors the Babel transform from `@preact/signals-react-transform`, including `mode`, `importSource`, `detectTransformedJSX`, and the `experimental.debug` / `experimental.noTryFinally` options.

## Options

### `mode`

Controls which functions are transformed. Supported values are `"auto"` (default), `"manual"`, and `"all"`.

### `importSource`

Overrides where `useSignals` is imported from. Defaults to `@preact/signals-react/runtime`.

### `detectTransformedJSX`

When `true`, the plugin also treats `React.createElement`, `react/jsx-runtime`, and `react/jsx-dev-runtime` calls as JSX.

### `experimental.debug`

When `true`, the plugin passes component names to `useSignals` and injects debug names into `signal`, `computed`, `useSignal`, and `useComputed` calls.

### `experimental.noTryFinally`

When `true`, the plugin prepends a bare `useSignals()` call instead of wrapping component bodies in `try/finally`.

## Local Setup

Install Rust and the SWC wasm target before building the plugin:

```sh
rustup target add wasm32-wasip1
```

Then use the workspace scripts:

```sh
pnpm --filter @preact/signals-react-transform-swc build
pnpm --filter @preact/signals-react-transform-swc test
```

Use `build:debug` when you want a faster local wasm build for test runs.

## Publishing

Version the package with Changesets from the repo root, then publish the workspace package:

```sh
pnpm changeset
pnpm run version
pnpm --filter @preact/signals-react-transform-swc publish --access public --provenance
```

`prepublishOnly` already runs the release build, so publishing always includes a fresh wasm artifact.

## License

`MIT`, see the [LICENSE](../../LICENSE) file.
