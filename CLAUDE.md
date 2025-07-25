# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Preact Signals library - a performant state management solution that provides reactive primitives for JavaScript frameworks. The library is built as a monorepo with multiple packages for different framework integrations.

## Commands

### Building

- `pnpm build` - Build all packages
- `pnpm build:core` - Build core signals package only
- `pnpm build:preact` - Build Preact integration
- `pnpm build:react` - Build React integration
- `pnpm prebuild` - Clean all dist directories

### Testing

- `pnpm test` - Run all tests (Karma browser tests + Mocha Node tests)
- `pnpm test:karma` - Run browser tests with coverage
- `pnpm test:karma:watch` - Run browser tests in watch mode
- `pnpm test:mocha` - Run Node.js tests with coverage
- `pnpm test:prod` - Run tests in production mode with minification

### Development

- `pnpm lint` - Run linting (oxlint + TypeScript)
- `pnpm lint:oxlint` - Run oxlint on TypeScript/JavaScript files
- `pnpm lint:tsc` - Run TypeScript compiler checks
- `pnpm format` - Format code with Prettier

## Architecture

### Monorepo Structure

- **packages/core/** - Core signals implementation (framework-agnostic)
- **packages/preact/** - Preact framework integration
- **packages/react/** - React framework integration
- **packages/react/runtime/** - React runtime hooks
- **packages/react/utils/** - React utility components
- **packages/preact/utils/** - Preact utility components
- **packages/debug/** - Debug extension for browser devtools
- **packages/react-transform/** - Babel transform for React

### Package Dependencies

The core package (`@preact/signals-core`) contains the framework-agnostic signals implementation. Framework packages depend on core and add their specific integrations:

- Preact integration adds hooks and rendering optimizations
- React integration provides compatibility with React components
- Debug package adds browser devtools integration

## Development Notes

- Uses pnpm workspaces with specific Node.js version (18.18.0 via Volta)
- All packages build to `dist/` directories which are cleaned before builds
- TypeScript path aliases allow importing packages by their published names during development
- Extension package provides Chrome devtools integration
- Documentation is built with Vite and served from `docs/` directory

## Chrome Extension Development

### Architecture

The Chrome extension (`/extension`) integrates with the debug package (`packages/debug/src`) to provide visualization of signal updates and dependencies.

Use signals for everything rather than hooks, you can replace any hook with a `useSignal`, `useComputed`
or `useSignalEffect` invocation instead.

### Panel Features

The Chrome extension provides two main visualization modes through a tabbed interface:

#### Updates Panel (Default Tab)

The updates panel provides real-time monitoring of signal changes:

**Core Features:**

- **Real-time Updates**: Live stream of signal value changes and effect executions
- **Depth Visualization**: Indented display showing dependency depth (0 = root signals, 1+ = dependent updates)
- **Update Statistics**: Header shows total update count and number of unique signals
- **Value Comparison**: Side-by-side display of previous → new values with syntax highlighting
- **Timestamp Information**: Each update shows when it occurred
- **Type Differentiation**: Visual distinction between signal updates and effect executions
- **Grouping Support**: Updates from the same trigger are grouped with divider lines

**Visual Indicators:**

- 🎯 Root signals (depth 0) - the original source of updates
- ↪️ Dependent updates (depth 1+) - computed values and effects triggered by root signals
- Color-coded borders: Blue for value updates, Orange for effect executions
- Monospace font for values to maintain readability

**Interactive Controls:**

- **Pause/Resume**: Stop updates temporarily without losing connection
- **Clear**: Reset the update history
- **Settings**: Configure filtering, grouping, and update rate limiting
- **Filter Patterns**: Regex-based filtering to focus on specific signals

#### Signal Dependency Graph

A new dependency graph visualization has been added to the Chrome extension panel:

#### Debug Package Changes (`packages/debug/src/`)

- **internal.ts**: Added `subscribedTo?: string` field to `UpdateInfo` interfaces to track signal dependencies
- **index.ts**:
  - Added `signalDependencies` WeakMap to track what each signal depends on
  - Added `getSignalId()` function to create unique IDs for signals
  - Added `trackDependency()` function to record signal-to-signal relationships
  - Modified `Computed.prototype._refresh` to track dependencies via `subscribedTo` field
  - Modified `Effect.prototype._callback` to track dependencies via `subscribedTo` field

#### Chrome Extension Changes (`extension/src/`)

- **panel.tsx**:
  - Added `signalId` and `subscribedTo` fields to `SignalUpdate` interface
  - Added graph data structures: `GraphNode`, `GraphLink`, `GraphData`
  - Created `GraphVisualization` component with SVG-based dependency graph
  - Added tab system with "Updates" and "Dependency Graph" tabs
  - Graph uses depth-based layout positioning nodes by their dependency depth
- **panel.css**:
  - Added tab styles with active state highlighting
  - Added graph visualization styles including node types (signal, computed, effect)
  - Added legend styles and responsive layout adjustments

#### Key Features

- **Depth-based Layout**: Nodes are positioned horizontally by their depth (0 = original signal, 1+ = dependent signals/effects)
- **Visual Differentiation**: Different colors for signals (blue), computed values (orange), and effects (green)
- **Dynamic Updates**: Graph rebuilds automatically as new signal updates are received
- **Interactive Legend**: Shows the meaning of different node colors

#### Dependencies Tracked

- Depth 0: Original signals that trigger updates
- Depth 1+: Computed signals and effects that depend on signals at previous depths
- Links show the direction of dependency (source → target)

### Connection Management

The extension uses a multi-layer communication system:

1. **Background Script**: Manages devtools connection and message routing
2. **Content Script**: Injects into the target page and bridges to debug package
3. **Panel**: Receives updates and provides visualization interface
4. **Debug Package**: Hooks into signal internals and sends updates

**Connection Status Indicators:**

- 🟢 Connected - Full communication established with signal debugging active
- 🟠 Connecting/Warning - Partial connection or no signals detected
- 🔴 Disconnected - No communication with target page

**Settings & Configuration:**

- **Enable/Disable**: Toggle debug monitoring on/off
- **Grouping**: Control whether related updates are visually grouped
- **Rate Limiting**: Prevent UI overload with configurable max updates per second
- **Pattern Filtering**: Use regex patterns to show only relevant signals

## Package Manager

This project requires pnpm. All scripts should be run with `pnpm` rather than `npm` or `yarn`.
