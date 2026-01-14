---
"@preact/signals": minor
"@preact/signals-react": minor
---

Add `useModel` hook for using Models in components

The new `useModel` hook provides a convenient way to use Models (created with `createModel`) within React and Preact components. It handles:

- Creating the model instance lazily on first render
- Maintaining the same instance across re-renders
- Automatically disposing the model when the component unmounts

```jsx
import { createModel, signal } from "@preact/signals-core";
import { useModel } from "@preact/signals-react"; // or "@preact/signals"

const CountModel = createModel(() => ({
	count: signal(0),
	increment() {
		this.count.value++;
	},
}));

function Counter() {
	const model = useModel(CountModel);
	return <button onClick={() => model.increment()}>{model.count}</button>;
}
```

For models that require constructor arguments, wrap in a factory function:

```jsx
const CountModel = createModel((initialCount: number) => ({
  count: signal(initialCount),
}));

function Counter() {
  const model = useModel(() => new CountModel(5));
  return <div>{model.count}</div>;
}
```
