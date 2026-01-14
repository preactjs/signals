## Summary

This PR adds `createModel` and `action` to `@preact/signals-core`, providing a structured way to build reactive state containers that encapsulate signals, computed values, effects, and actions.

```js
const CounterModel = createModel((initialCount = 0) => {
	const count = signal(initialCount);
	const doubled = computed(() => count.value * 2);

	effect(() => {
		console.log("Count changed:", count.value);
	});

	return {
		count,
		doubled,
		increment() {
			count.value++;
		},
	};
});

const counter = new CounterModel(5);
counter.increment(); // Updates are automatically batched
counter[Symbol.dispose](); // Cleans up all effects
```

Key features:

- Factory functions can accept arguments for initialization
- All methods are automatically wrapped as actions (batched & untracked)
- Effects created during model construction are captured and disposed when the model is disposed via `Symbol.dispose`
- Models compose naturally - effects from nested models are captured by the parent and disposed together when the parent is disposed
- TypeScript validates that models only contain signals, actions, or nested objects with signals/actions

## Design decisions

### No classes or reflection

The implementation avoids using ES classes internally. Using a class would require reflecting onto a class's constructor and the current signals implementation avoids reflection and proxies, so this follows a similar design philosophy. A class-based API could be built on top of this primitive, like so (shoutout @developit for this neat little hack):

```ts
class BaseModelImpl implements Disposable {
	[Symbol.dispose](): void {}
}

export const BaseModel = new Proxy(BaseModelImpl, {
	construct(target, args, newTarget) {
		return createModel(() => Reflect.construct(target, args, newTarget));
	},
}) as unknown as typeof BaseModelImpl;
```

### Using `new` to instantiate models

The public types require using `new` to instantiate models. This helps disambiguate the factory function passed into `createModel` from the returned constructor. It's easier to explain that "`createModel` accepts a factory and returns a class" than "`createModel` accepts a factory and returns a factory."

In other words, this:

```ts
const PersonModel = createModel((name: string) => ({ ... }));
const person = new PersonModel("John");
```

is easier to understand than:

```ts
const createPerson = createModel((name: string) => ({ ... }));
const person = createPerson("John");
```

Using `new` also communicates that each call creates a fresh instance with independent state.

Internally, `createModel` returns a plain function that can be called without `new` for simplicity, but the public types enforce `new` for clarity.

### Automatically capture effects implement a dispose function

Effects declared inside a model's factory function are captured by `createModel` in order to automatically implement a dispose function on the model (exposed as `[Symbol.dispose]`). This design avoids models needing to manually wire up effect dispose from nested models to the model interface.

### Factory functions should NOT return `dispose` functions

If a model needs to run custom logic when it is diposed (that may not be related to signals), it should **not** return a `dispose()` or `[Symbol.dispose]`. When composing models, this dispose function isn't guarenteed to get called as parent models would need to know that your model has a dispose and manually wire it up.

Instead for custom cleanup logic, the recommended pattern is to declare an effect with no signal dependencies that returns a cleanup function that runs the desired cleanup logic. (see "Dispose pattern" below).

## Recommended patterns

### Explicit readonly pattern

Declare your model interface explicitly and use `ReadonlySignal` for signals that should only be modified through actions. This ensures only actions can modify signals, giving you better insight and control over state changes:

```ts
import {
	signal,
	computed,
	createModel,
	ReadonlySignal,
} from "@preact/signals-core";

interface Counter {
	count: ReadonlySignal<number>;
	doubled: ReadonlySignal<number>;
	increment(): void;
	decrement(): void;
}

const CounterModel = createModel<Counter>(() => {
	const count = signal(0);
	const doubled = computed(() => count.value * 2);

	return {
		count,
		doubled,
		increment() {
			count.value++;
		},
		decrement() {
			count.value--;
		},
	};
});

const counter = new CounterModel();
counter.increment(); // OK
counter.count.value = 10; // TypeScript error: Cannot assign to 'value' because it is a read-only property
```

### Dispose pattern

Generally, if you delcare an effect that has cleanup logic, that cleanup logic will before each execution of the effect function (aka whenever the signals your effect relies on update).

However, if you have cleanup logic that needs to run on model dispose that doesn't depend on signals, define an effect that uses no signals but returns your cleanup function. This mirrors the `useEffect(() => { return cleanup }, [])` pattern in React:

```ts
const WebSocketModel = createModel((url: string) => {
	const messages = signal<string[]>([]);
	const ws = new WebSocket(url);

	ws.onmessage = e => {
		messages.value = [...messages.value, e.data];
	};

	// This effect runs once and cleanup is called on dispose
	effect(() => {
		return () => {
			ws.close();
		};
	});

	return {
		messages,
		send(message: string) {
			ws.send(message);
		},
	};
});
```

This pattern is recommended for custom dispose behavior because it allows models to compose naturally - nested models will have their effects cleaned up automatically without manually wiring up dispose functions.

## Open Questions

- Should `createModel` be in its own package? It would require accessing Effect internals to observe effect creation.
- Do people like the `#region` markers? They produce helpful headings in VSCode's scrollbar preview.

## Future work

- Add `useModel` hook to Preact & React adapters
- Extend debug transform to add names to models & actions, and use model name in signals, computeds, effects, and actions declared within the model
- Extend debug tooling to understand models and actions
