# Signals Preact Transform

A Babel plugin to provide names to all your `useComputed` and `useSignal` invocations.

## Installation:

```sh
npm i --save-dev @preact/signals-preact-transform
```

## Usage

To setup the transform plugin, add the following to your Babel config:

```js
// babel.config.js
module.exports = {
	plugins: [["module:@preact/signals-preact-transform"]],
};
```

As this is a development plugin it is advised to remove it when you
go to production to remove some bundle size.

## License

`MIT`, see the [LICENSE](../../LICENSE) file.
