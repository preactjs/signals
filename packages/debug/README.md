# @preact/signals-debug

A powerful debugging toolkit for [@preact/signals](https://github.com/preactjs/signals) that provides detailed insights into signal updates, effects, and computed values.

## Installation

```bash
npm install @preact/signals-debug
# or
yarn add @preact/signals-debug
# or
pnpm add @preact/signals-debug
```

> [!NOTE]
> Ensure this package is imported in the root of your application

## Features

- Track signal value changes and updates
- Monitor effect executions
- Debug computed value recalculations
- Get real-time debugging statistics
- Configurable debugging options

## Usage

```typescript
import { setDebugOptions } from "@preact/signals-debug";

// Configure debug options
setDebugOptions({
	grouped: true, // Group related updates in console output
	enabled: true, // Enable/disable debugging
	spacing: 2, // Number of spaces for nested update indentation
});
```

## Debug Information

The package automatically enhances signals with debugging capabilities:

1. **Value Changes**: Tracks and logs all signal value changes
2. **Effect Tracking**: Monitors effect executions and their dependencies
3. **Computed Values**: Tracks computed value recalculations and dependencies
4. **Update Grouping**: Groups related updates for better visualization
5. **Performance Stats**: Provides active trackers and subscriptions count

## Effect initialization warnings

Effects execute immediately, while computeds evaluate lazily. Creating a model
inside a computed can therefore start an effect while that computed is still
running. If the effect reads an enclosing computed, the read throws
`Cycle detected`. Which value is read first can determine whether this happens,
so the same construction pattern can appear to work until the read order changes.

Debug warns when an effect's first observed execution occurs during computed
evaluation, even if that particular execution does not cause a cycle:

```text
[signals-debug] Effect first observed during computed evaluation
summary [computed] → items [computed] → observeItem [effect]
```

The warning includes a structured `effect-in-computed` diagnostic with the
execution path's names, IDs, and node types, plus a stack captured at the effect's
first observed execution. This is execution ancestry, not a complete dependency
graph or the exact read that closes a cycle. Import debug before creating effects;
when imported later, their first observed execution may be a rerun.

`untracked()` does not hide this ancestry: it disables dependency tracking, but
an enclosing computed is still evaluating. Consider keeping models constructed
inside computeds passive and moving effect initialization to an explicit owner
outside the computed, with appropriate disposal.

Warnings respect `enabled` and `consoleLogging`. They do not force computed reads,
add subscriptions, defer effects, or replace core's cycle error.

## API Reference

### `setDebugOptions(options)`

Configure debugging behavior:

```typescript
setDebugOptions({
	grouped?: boolean;  // Enable/disable update grouping in console
	enabled?: boolean;  // Enable/disable debugging entirely
	consoleLogging?: boolean; // Enable/disable console updates and warnings
	spacing?: number;   // Number of spaces for nested update indentation, this can be handy in non-browser environments
});
```

## License

MIT © [Preact Team](https://preactjs.com)
