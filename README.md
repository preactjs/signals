
# Signals

Signals is a performant state management library with two primary goals:

1. Make it as easy as possible to write business logic for small up to complex apps. No matter how complex your logic is, your app updates should stay fast without you needing to think about it. Signals automatically optimize state updates behind the scenes to trigger the fewest updates necessary. They are lazy by default and automatically skip signals that no one listens to.
2. Integrate into frameworks as if they were native built-in primitives. You don't need any selectors, wrapper functions, or anything else. Signals can be accessed directly and your component will automatically re-render when the signal's value changes.

Read the [announcement post](https://preactjs.com/blog/introducing-signals/) to learn more about which problems signals solves and how it came to be.

## Installation:

```sh
# Just the core library
npm install @preact/signals-core
# If you're using Preact
npm install @preact/signals
# If you're using React
npm install @preact/signals-react
# If you're using Svelte
npm install @preact/signals-core
```

- [Guide / API](#guide--api)
	- [`signal(initialValue)`](#signalinitialvalue)
		- [`signal.peek()`](#signalpeek)
	- [`computed(fn)`](#computedfn)
	- [`effect(fn)`](#effectfn)
	- [`batch(fn)`](#batchfn)
- [Preact Integration](./packages/preact/README.md#preact-integration)
	- [Hooks](./packages/preact/README.md#hooks)
	- [Rendering optimizations](./packages/preact/README.md#rendering-optimizations)
		- [Attribute optimization (experimental)](./packages/preact/README.md#attribute-optimization-experimental)
- [React Integration](./packages/react/README.md#react-integration)
	- [Hooks](./packages/react/README.md#hooks)
- [License](#license)

## Guide / API

The signals library exposes four functions which are the building blocks to model any business logic you can think of.

### `signal(initialValue)`

The `signal` function creates a new signal. A signal is a container for a value that can change over time. You can read a signal's value or subscribe to value updates by accessing its `.value` property.

```js
import { signal } from "@preact/signals-core";

const counter = signal(0);

// Read value from signal, logs: 0
console.log(counter.value);

// Write to a signal
counter.value = 1;
```

Writing to a signal is done by setting its `.value` property. Changing a signal's value synchronously updates every [computed](#computedfn) and [effect](#effectfn) that depends on that signal, ensuring your app state is always consistent.

#### `signal.peek()`

In the rare instance that you have an effect that should write to another signal based on the previous value, but you _don't_ want the effect to be subscribed to that signal, you can read a signals's previous value via `signal.peek()`.

```js
const counter = signal(0);
const effectCount = signal(0);

effect(() => {
	console.log(counter.value);

	// Whenever this effect is triggered, increase `effectCount`.
	// But we don't want this signal to react to `effectCount`
	effectCount.value = effectCount.peek() + 1;
});
```

Note that you should only use `signal.peek()` if you really need it. Reading a signal's value via `signal.value` is the preferred way in most scenarios.

### `computed(fn)`

Data is often derived from other pieces of existing data. The `computed` function lets you combine the values of multiple signals into a new signal that can be reacted to, or even used by additional computeds. When the signals accessed from within a computed callback change, the computed callback is re-executed and its new return value becomes the computed signal's value.

```js
import { signal, computed } from "@preact/signals-core";

const name = signal("Jane");
const surname = signal("Doe");

const fullName = computed(() => name.value + " " + surname.value);

// Logs: "Jane Doe"
console.log(fullName.value);

// Updates flow through computed, but only if someone
// subscribes to it. More on that later.
name.value = "John";
// Logs: "John Doe"
console.log(fullName.value);
```

Any signal that is accessed inside the `computed`'s callback function will be automatically subscribed to and tracked as a dependency of the computed signal.

### `effect(fn)`

The `effect` function is the last piece that makes everything reactive. When you access a signal inside its callback function, that signal and every dependency of said signal will be activated and subscribed to. In that regard it is very similar to [`computed(fn)`](#computedfn). By default all updates are lazy, so nothing will update until you access a signal inside `effect`.

```js
import { signal, computed, effect } from "@preact/signals-core";

const name = signal("Jane");
const surname = signal("Doe");
const fullName = computed(() => name.value + " " + surname.value);

// Logs: "Jane Doe"
effect(() => console.log(fullName.value));

// Updating one of its dependencies will automatically trigger
// the effect above, and will print "John Doe" to the console.
name.value = "John";
```

You can destroy an effect and unsubscribe from all signals it was subscribed to, by calling the returned function.

```js
import { signal, computed, effect } from "@preact/signals-core";

const name = signal("Jane");
const surname = signal("Doe");
const fullName = computed(() => name.value + " " + surname.value);

// Logs: "Jane Doe"
const dispose = effect(() => console.log(fullName.value));

// Destroy effect and subscriptions
dispose();

// Update does nothing, because no one is subscribed anymore.
// Even the computed `fullName` signal won't change, because it knows
// that no one listens to it.
surname.value = "Doe 2";
```

### `batch(fn)`

The `batch` function allows you to combine multiple signal writes into one single update that is triggered at the end when the callback completes.

```js
import { signal, computed, effect, batch } from "@preact/signals-core";

const name = signal("Jane");
const surname = signal("Doe");
const fullName = computed(() => name.value + " " + surname.value);

// Logs: "Jane Doe"
effect(() => console.log(fullName.value));

// Combines both signal writes into one update. Once the callback
// returns the `effect` will trigger and we'll log "Foo Bar"
batch(() => {
	name.value = "Foo";
	surname.value = "Bar";
});
```

When you access a signal that you wrote to earlier inside the callback, or access a computed signal that was invalidated by another signal, we'll only update the necessary dependencies to get the current value for the signal you read from. All other invalidated signals will update at the end of the callback function.

```js
import { signal, computed, effect, batch } from "@preact/signals-core";

const counter = signal(0);
const double = computed(() => counter.value * 2);
const triple = computed(() => counter.value * 3);

effect(() => console.log(double.value, triple.value));

batch(() => {
	counter.value = 1;
	// Logs: 2, despite being inside batch, but `triple`
	// will only update once the callback is complete
	console.log(double.value);
});
// Now we reached the end of the batch and call the effect
```

Batches can be nested and updates will be flushed when the outermost batch call completes.

```js
import { signal, computed, effect, batch } from "@preact/signals-core";

const counter = signal(0);
effect(() => console.log(counter.value));

batch(() => {
	batch(() => {
		// Signal is invalidated, but update is not flushed because
		// we're still inside another batch
		counter.value = 1;
	});

	// Still not updated...
});
// Now the callback completed and we'll trigger the effect.
```

## License

`MIT`, see the [LICENSE](./LICENSE) file.
