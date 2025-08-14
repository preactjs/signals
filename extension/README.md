# Preact Signals Chrome Extension

A Chrome DevTools extension for debugging and visualizing Preact Signals in your applications.

## Features

- **Real-time Updates Panel**: Monitor signal value changes and effect executions with depth visualization
- **Dependency Graph**: Visual representation of signal dependencies and relationships
- **Interactive Controls**: Pause, clear, and filter updates with regex patterns
- **Connection Management**: Automatic detection and connection to pages using Preact Signals

## Setup

### Prerequisites

1. Build the main Preact Signals packages:

   ```bash
   # From the root directory
   pnpm build
   ```

2. Start the development server for the extension:

   ```bash
   # From the extension directory
   cd extension
   pnpm dev
   ```

3. Set up demo applications (optional but recommended):
   ```bash
   cd docs/demos
   pnpm i && pnpm start --force
   ```

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `extension/dist` directory
5. The Preact Signals extension should now appear in your extensions list

## Usage

1. Open Chrome DevTools (F12)
2. Navigate to the "Preact Signals" tab
3. Visit a page using Preact Signals (like the demo applications)
4. The extension will automatically detect and connect to the signals system

### Panel Features

#### Updates Tab (Default)

- View real-time signal updates and effect executions
- See dependency depth with indented visualization
- Compare previous and new values side-by-side
- Monitor update statistics and timestamps

#### Dependency Graph Tab

- Visualize signal relationships and dependencies
- Nodes positioned by dependency depth
- Color-coded by type: signals (blue), computed (orange), effects (green)
- Interactive legend for understanding the visualization

### Controls

- **Pause/Resume**: Temporarily stop receiving updates
- **Clear**: Reset the update history
- **Filter**: Use regex patterns to show only specific signals
- **Settings**: Configure grouping, rate limiting, and other options

## Development

The extension connects to the debug package (`packages/debug`) which hooks into the core signals implementation to provide real-time monitoring capabilities.

For development of the extension itself, the `pnpm dev` command will watch for changes and rebuild automatically.
