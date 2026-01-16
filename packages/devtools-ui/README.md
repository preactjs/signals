# @preact/signals-devtools-ui

DevTools UI components for Preact Signals. This package provides a reusable UI that can be embedded in various contexts - browser extensions, iframes, overlays, blog posts, etc.

## Installation

```bash
npm install @preact/signals-devtools-ui @preact/signals-devtools-adapter
```

## Quick Start

### Embedded in a page (for demos, blog posts, etc.)

```tsx
import { mount } from "@preact/signals-devtools-ui";
import { createDirectAdapter } from "@preact/signals-devtools-adapter";
import "@preact/signals-devtools-ui/styles";

// Create a direct adapter (connects directly to signals on the page)
const adapter = createDirectAdapter();

// Mount the DevTools UI
const unmount = await mount({
	adapter,
	container: document.getElementById("devtools-container")!,
});

// Later, to cleanup:
unmount();
```

### In a browser extension

```tsx
import { mount } from "@preact/signals-devtools-ui";
import { createBrowserExtensionAdapter } from "@preact/signals-devtools-adapter";
import "@preact/signals-devtools-ui/styles";

const adapter = createBrowserExtensionAdapter();

await mount({
	adapter,
	container: document.getElementById("app")!,
});
```

### In an iframe

```tsx
import { mount } from "@preact/signals-devtools-ui";
import { createPostMessageAdapter } from "@preact/signals-devtools-adapter";
import "@preact/signals-devtools-ui/styles";

const adapter = createPostMessageAdapter({
	sourceWindow: window,
	sourceOrigin: "https://your-app.com",
	targetWindow: window.parent,
	targetOrigin: "https://your-app.com",
});

await mount({
	adapter,
	container: document.getElementById("devtools")!,
});
```

## Using Individual Components

You can also use individual components for custom layouts:

```tsx
import {
	initDevTools,
	Header,
	UpdatesContainer,
	GraphVisualization,
} from "@preact/signals-devtools-ui";
import { createDirectAdapter } from "@preact/signals-devtools-adapter";

const adapter = createDirectAdapter();
await adapter.connect();
initDevTools(adapter);

function MyCustomDevTools() {
	return (
		<div>
			<Header />
			<div className="my-layout">
				<UpdatesContainer />
				<GraphVisualization />
			</div>
		</div>
	);
}
```

## Props

### `mount(options)`

| Option       | Type                   | Required | Description                      |
| ------------ | ---------------------- | -------- | -------------------------------- |
| `adapter`    | `DevToolsAdapter`      | Yes      | The communication adapter to use |
| `container`  | `HTMLElement`          | Yes      | The DOM element to render into   |
| `hideHeader` | `boolean`              | No       | Hide the header bar              |
| `initialTab` | `"updates" \| "graph"` | No       | Which tab to show initially      |

### `DevToolsPanel`

| Prop         | Type                   | Default     | Description            |
| ------------ | ---------------------- | ----------- | ---------------------- |
| `hideHeader` | `boolean`              | `false`     | Hide the header bar    |
| `initialTab` | `"updates" \| "graph"` | `"updates"` | Initial tab to display |

## Styling

The package includes CSS styles. Import them in your app:

```ts
import "@preact/signals-devtools-ui/styles";
```

Or include the CSS file from the dist folder manually.

## Available Components

- `DevToolsPanel` - Main panel component
- `Header` - Header with status and controls
- `SettingsPanel` - Debug settings configuration
- `UpdatesContainer` - Signal updates list
- `GraphVisualization` - Dependency graph
- `EmptyState` - Empty state placeholder
- `StatusIndicator` - Connection status indicator
- `Button` - Styled button component

## License

MIT
