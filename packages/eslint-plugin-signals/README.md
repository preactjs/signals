# @preact/eslint-plugin-signals

An [Oxlint](https://oxc.rs)/ESLint plugin that catches common signal misuse patterns in projects using `@preact/signals-core`, `@preact/signals`, or `@preact/signals-react`.

## Rules

| Rule                                                                  | Severity | Description                                                                          |
| --------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| [`signals/no-signal-write-in-computed`](#no-signal-write-in-computed) | error    | Disallow writing to signal `.value` inside `computed()` or `useComputed()`           |
| [`signals/no-value-after-await`](#no-value-after-await)               | error    | Warn when reading `.value` after an `await`, which breaks tracking                   |
| [`signals/no-signal-truthiness`](#no-signal-truthiness)               | warn     | Warn when a signal object itself is evaluated for truthiness                         |
| [`signals/no-signal-in-component-body`](#no-signal-in-component-body) | error    | Disallow calling `signal`/`computed`/`effect` in a component body; use hooks instead |
| [`signals/no-conditional-value-read`](#no-conditional-value-read)     | error    | Warn when `.value` is read conditionally behind a non-reactive guard                 |

## Installation

```sh
pnpm add -D @preact/eslint-plugin-signals
```

## Configuration

### Oxlint (`.oxlintrc.json`)

```jsonc
{
	"jsPlugins": ["@preact/eslint-plugin-signals"],
	"rules": {
		"@preact/signals/no-signal-write-in-computed": "error",
		"@preact/signals/no-value-after-await": "error",
		"@preact/signals/no-signal-truthiness": "warn",
		"@preact/signals/no-signal-in-component-body": "error",
		"@preact/signals/no-conditional-value-read": "error",
	},
}
```

### ESLint (flat config — `eslint.config.mjs`)

```js
import signals from "@preact/eslint-plugin-signals";
import tsParser from "@typescript-eslint/parser";

export default [
	{
		plugins: { signals },
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
				project: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"signals/no-signal-write-in-computed": "error",
			"signals/no-value-after-await": "error",
			"signals/no-signal-truthiness": "warn",
			"signals/no-signal-in-component-body": "error",
			"signals/no-conditional-value-read": "error",
		},
	},
];
```

---

## Rule Details

### `no-signal-write-in-computed`

Disallows writing to a signal's `.value` inside `computed()` or `useComputed()` callbacks.

Computed signals must be pure derivations — writing to a signal inside a computed breaks the reactive graph and can cause infinite loops or runtime errors.

```js
// ❌ Bad
const doubled = computed(() => {
	other.value = count.value * 2; // Side effect!
	return count.value;
});

const doubled = useComputed(() => {
	other.value = count.value * 2;
	return count.value;
});

// ✅ Good
const doubled = computed(() => count.value * 2);

effect(() => {
	other.value = count.value * 2; // Writes are fine in effects
});
```

### `no-value-after-await`

Warns when `.value` is read after an `await` expression in an async function.

Signal dependency tracking is synchronous. After an `await`, the tracking context is suspended and any `.value` reads will **not** be tracked as dependencies. This leads to stale or missing reactivity.

```js
// ❌ Bad
effect(async () => {
	const res = await fetch("/api");
	console.log(name.value); // Not tracked!
});

// ✅ Good — read .value before await
effect(async () => {
	const currentName = name.value; // Tracked!
	const res = await fetch(`/api/${currentName}`);
});

// ✅ Good — explicit untracked read
effect(async () => {
	const res = await fetch("/api");
	const n = untracked(() => name.value);
});
```

### `no-signal-truthiness`

Warns when a signal **object** (not its `.value`) is used in a boolean/truthiness context.

A `Signal` is a non-null object, so it is always truthy. Checking `if (mySignal)` is almost certainly a mistake — the developer likely meant `if (mySignal.value)`.

Detected patterns:

- `if (sig)` / `while (sig)` / `for (; sig; )` / `do {} while (sig)`
- `sig ? a : b`
- `sig && ...` / `sig || ...` / `sig ?? ...`
- `!sig`
- `Boolean(sig)`

```js
const count = signal(0);

// ❌ Bad
if (count) { /* always true! */ }
const x = count ? "yes" : "no"; // always "yes"!

// ✅ Good
if (count.value) { ... }
const x = count.value ? "yes" : "no";
```

> **Note:** This rule uses scope analysis and type annotations to identify
> signal variables. It traces each identifier back to its declaration and
> confirms it was initialised from a signal creator (`signal()`, `computed()`,
> `useSignal()`, `useComputed()`) imported from a `@preact/signals-*` package,
> or has a `Signal`/`ReadonlySignal` type annotation. Import aliases are
> handled correctly.

### `no-signal-in-component-body`

Disallows calling `signal()`, `computed()`, or `effect()` directly in the body of a React component. Use the hook equivalents instead.

Calling these functions during render creates a **new instance on every render**:

- `signal()` → fresh signal with no connection to previous renders
- `computed()` → new derived computation on every render
- `effect()` → a new subscription started on every render, causing memory leaks

The hook equivalents (`useSignal`, `useComputed`, `useSignalEffect`) are lifecycle-aware and only create the instance once.

```js
// ❌ Bad
function MyComponent() {
	const count = signal(0); // New signal every render!
	const doubled = computed(() => count.value * 2); // New computed every render!
	effect(() => console.log(count.value)); // New effect every render!
	return <div>{count.value}</div>;
}

// ✅ Good
function MyComponent() {
	const count = useSignal(0);
	const doubled = useComputed(() => count.value * 2);
	useSignalEffect(() => console.log(count.value));
	return <div>{count.value}</div>;
}
```

Calls inside **nested functions** (event handlers, `useEffect` callbacks, etc.) are not flagged, since those do not run during render:

```js
// ✅ OK — not called during render
function MyComponent() {
	const handleClick = () => {
		const temp = signal(0); // inside callback, not render
	};
}
```

> **Note:** Component detection uses two heuristics (either is sufficient):
> PascalCase naming convention, or the function body containing JSX.
> This catches both conventionally named components and lowercase components
> that return JSX. Utility functions without JSX are not flagged.

### `no-conditional-value-read`

Warns when signal `.value` is read conditionally inside a reactive scope (`effect`, `computed`, `useSignalEffect`, `useComputed`) behind a guard that does **not** itself read `.value`.

When a guard condition doesn't read any signal `.value`, no signal is tracked as a dependency for that guard. If the guard prevents the `.value` read from executing, the reactive scope may silently stop updating.

```js
// ❌ Bad — guard doesn't read .value, so sig is not tracked
effect(() => {
	if (someNonReactiveCondition) return;
	console.log(sig.value); // may never re-run!
});

effect(() => {
	const id = action.peek(); // .peek() is non-reactive
	if (!id) return;
	console.log(states.value[id]); // not tracked!
});

// ✅ Good — guard reads .value, so the signal is tracked
effect(() => {
	if (!enabled.value) return;
	console.log(data.value); // tracked, effect re-runs
});

// ✅ Good — .value read is unconditional
effect(() => {
	const v = sig.value; // always executed
	if (!v) return;
	doSomething(v);
});
```

## How Detection Works

All rules use **scope analysis** (via `context.sourceCode.getScope()`) to
resolve identifiers back to their `ImportDeclaration` and confirm the import
source is one of:

- `@preact/signals-core`
- `@preact/signals`
- `@preact/signals-react`
- `@preact/signals-react/runtime`

In addition, variables and parameters with a `Signal<T>` or `ReadonlySignal<T>`
type annotation are recognised as signals. This catches the common pattern of
importing signals from external model files:

```ts
import type { Signal } from "@preact/signals-core";
import { count } from "./model"; // count: Signal<number>

if (count) {
} // ← flagged by no-signal-truthiness
```

This means:

- A function named `computed` imported from `"some-other-lib"` will **not**
  trigger `no-signal-write-in-computed`.
- `import { signal as s }` is correctly resolved — `const x = s(0); if (x) {}`
  **will** trigger `no-signal-truthiness`.
- Type-annotated signals (`const s: Signal<number>`, function params, etc.)
  are detected without requiring a full type-checker.
- No `tsconfig.json` is required.

## Limitations

### No indirect signal tracking

All rules operate on **local, single-file** scope analysis. Signals that cross
function boundaries — passed as arguments, returned from helpers, or stored in
intermediate variables via dynamic assignment — cannot be traced:

```js
// Not detected — signal crosses a function boundary
function helper(sig) {
	sig.value = 42; // write not visible to no-signal-write-in-computed
}
computed(() => {
	helper(mySignal);
	return mySignal.value;
});

// Not detected — signal returned from a function
function getCount() {
	return signal(0);
}
if (getCount()) {
} // truthiness check not flagged

// Not detected — signal aliased through an object
const store = { count: signal(0) };
const ref = store.count;
if (ref) {
} // not flagged without type checker
```

This is a fundamental limitation of static analysis without full cross-function
data-flow tracking. When TypeScript type information is available (via
`@typescript-eslint/parser` with `project: true`), some of these cases are
caught through type-based detection — particularly member expressions like
`store.count` where the type checker can resolve the type.

### Other limitations

- Namespace imports (`import * as signals from "..."`) are verified against the
  import source but rely on property-name matching for the called function.
- Oxlint currently does not benefit from type-aware linting, so detection in
  Oxlint is limited to scope analysis and type annotations.

## License

MIT
