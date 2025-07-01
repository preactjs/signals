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

## API Reference

### `setDebugOptions(options)`

Configure debugging behavior:

```typescript
setDebugOptions({
	grouped?: boolean;  // Enable/disable update grouping in console
	enabled?: boolean;  // Enable/disable debugging entirely
	spacing?: number;   // Number of spaces for nested update indentation, this can be handy in non-browser environments
});
```

## License

MIT © [Preact Team](https://preactjs.com)
