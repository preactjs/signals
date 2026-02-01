---
"@preact/signals-react-transform": patch
---

Fix JSX detection leaking to non-component functions in the same scope

Previously, when a component containing JSX was defined inside another function, the JSX detection could incorrectly "leak" to sibling functions or the parent function, causing non-components to be transformed. This was especially problematic in test files where components are defined inside `it()` or `describe()` blocks.

```js
describe("suite", () => {
	it("test", () => {
		// This arrow function was incorrectly transformed because
		// Counter's JSX detection leaked to sibling functions
		const CountModel = () => signal.value;
		function Counter() {
			return <div>Hello</div>;
		}
	});
});
```

The transform now correctly scopes JSX and signal usage detection to only the containing component or custom hook function.
