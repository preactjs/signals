---
name: signals-debugging
description: Interprets `@preact/signals-debug` updates and the AI-native Vite event stream to diagnose reactive UI bugs.
---

# Signals Debugging

Use this skill when a user reports a UI bug in an app that uses `@preact/signals-debug`, the Signals devtools bridge, or `@preact/signals-vite-plugin`.

The Vite plugin is configured with `signalsVite()`.

## What the Debug Stream Means

Signals debug data is structured, not just console text.

- `source: "signals"`, `type: "update"`
  - A plain signal or computed changed value.
  - Important fields: `signalName`, `signalType`, `prevValue`, `newValue`, `timestamp`, `page.pathname`.
- `source: "signals"`, `type: "effect"`
  - An effect ran because one of its dependencies changed.
  - Important fields: `signalName`, `subscribedTo`, `allDependencies`.
- `source: "signals"`, `type: "component"`
  - A component render was triggered.
  - Useful for confirming whether state changes reached the view layer.
- `source: "signals"`, `type: "disposed"`
  - A signal/computed/effect was torn down.
  - Useful for unmount bugs and stale subscriptions.
- `source: "network"`
  - `request`, `response`, and `error` events are transport context.
  - Use these to correlate auth failures, validation fetches, and retries.
- `source: "page"`
  - `ready`, `navigate`, `interaction`, `error`, and `unhandledrejection` provide user-flow context.

## How to Read a Signal Cascade

Think in this order:

1. **Interaction** - what the user or test just did (`page.interaction`, `network.request`)
2. **Root signal** - which signal changed first (`signals.update` with depth 0 in raw debug output)
3. **Derived state** - which computed values re-ran because of it
4. **Effects/components** - whether the change reached side effects or rendering
5. **Mismatch** - compare the final signal state to the outcome

## High-Signal Heuristics

- Network says `401` or `500`, but a status signal becomes `success`
  - The error path is mutating the wrong signal.
- A form submit interaction happens, but no relevant signal update follows
  - The handler is not wired, is throwing early, or is reading stale state.
- A signal updates but no `component` event follows
  - The component is not subscribed, is reading via `peek()`, or was disposed.
- The same signal flips rapidly between values
  - Look for an effect loop or conflicting async writes.
- `disposed` happens before the expected UI update
  - The component/effect is unmounting or losing subscriptions too early.

## Vite Plugin Workflow

When the app uses `@preact/signals-vite-plugin`, use this flow:

1. Create a session:

```bash
curl -X POST <YOUR_DEV_URL>/__signals_agent__/sessions \
	-H 'content-type: application/json'
```

2. Reproduce the issue in the browser or with Playwright.
3. Fetch or stream the session events:

```bash
curl <YOUR_DEV_URL>/__signals_agent__/sessions/<session-id>/events
```

4. Reset the local buffer between reproductions when you need a clean run:

```bash
curl -X POST <YOUR_DEV_URL>/__signals_agent__/reset
```

5. Build a timeline:
   - page interaction
   - network request/response
   - root signal update
   - derived updates
   - final rendered state
6. Point to the first contradiction, not just the last error.

## Signal Naming

- The Babel transform can name signals automatically from the variable they are assigned to.
  - Example: `const count = signal(0)` can become `signal(0, { name: "count" })` in development transforms.
  - This is why debug events often contain readable `signalName` values even when the source code did not add one manually.
- Signals and computeds can also name themselves directly with the second options argument.
  - Example: `signal(0, { name: "count" })`
  - Example: `computed(() => count.value * 2, { name: "doubled" })`
- Prefer the explicit second argument when the local variable name is too generic or when you want stable names across refactors.

You can use these names in a param `filterPatterns` that you can pass to your session creation. This will make the debug stream only include events that match at least one pattern, which is helpful for noisy apps.

Example:

```bash
curl -X POST <YOUR_DEV_URL>/__signals_agent__/sessions \
	-H 'content-type: application/json' \
	-d '{"filterPatterns":["AuthForm","password"]}'
```

## How to Filter Well

Start tight, then widen only if needed.

- Good first filters for form issues: component name, route name, feature name
- For auth flows: `AuthForm`, `auth`, `login`, `session`, `token`
- If nothing shows up, remove component-specific filters and inspect the global stream

## What to Say Back

Respond with:

1. the triggering action
2. the key network or page fact
3. the contradictory signal transition
4. the likely faulty branch or file
5. the smallest fix that would align state with reality

Example:

```
Submitting `AuthForm` sends `POST /api/login`, which returns `401`.
The debug stream then shows `AuthForm.status` changing from `submitting` to `success` instead of `error`.
That means the catch path is writing the success state on failure.
Fix the submit error branch so it sets the error signal and leaves the form in an error state.
```

## Cautions

- Treat sanitized/sensitive values like `[Redacted]` as evidence that sensitive state exists, not as missing data.
- Do not assume every page or network error is causal; correlate it with nearby signal events.
- Prefer the earliest contradictory event in the timeline over the loudest downstream symptom.
