# Signals Preact Transform SWC

A SWC plugin to provide names to your `signal`, `computed`, `useSignal`, and `useComputed` invocations.

## Installation

```sh
npm i --save-dev @preact/signals-preact-transform-swc @swc/core
```

## Usage

Add the plugin to your SWC config:

```json
{
	"jsc": {
		"experimental": {
			"plugins": [["@preact/signals-preact-transform-swc", { "enabled": true }]]
		}
	}
}
```

The plugin mirrors the Babel transform and injects debug-friendly names such as `count (Component.js:3)` when a signal declaration does not already provide a `name` option.

## Options

### `enabled`

Defaults to `true`. Set it to `false` to disable name injection.

## Local Setup

Install Rust and the SWC wasm target before building the plugin:

```sh
rustup target add wasm32-wasip1
```

Then use the workspace scripts:

```sh
pnpm --filter @preact/signals-preact-transform-swc build
pnpm --filter @preact/signals-preact-transform-swc test
```

Use `build:debug` when you want a faster local wasm build for test runs.

## Publishing

Version the package with Changesets from the repo root, then publish the workspace package:

```sh
pnpm changeset
pnpm run version
pnpm --filter @preact/signals-preact-transform-swc publish --access public --provenance
```

`prepublishOnly` already runs the release build, so publishing always includes a fresh wasm artifact.

## License

`MIT`, see the [LICENSE](../../LICENSE) file.
