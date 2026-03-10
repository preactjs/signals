# @preact/signals-vite-plugin

Vite tooling that wires up Signals debugging with less manual setup.

In development it auto-injects `@preact/signals-debug`, applies the React or Preact Signals Babel transform for you, forwards signal updates to a local HTTP API, and captures nearby page context such as network activity, navigation, and form interactions. In production builds it keeps the React transform enabled without the extra debug metadata.

## Installation

```bash
pnpm add -D @preact/signals-vite-plugin
```

## Usage

```ts
import { defineConfig } from "vite";
import { signalsVite } from "@preact/signals-vite-plugin";

export default defineConfig({
	plugins: [signalsVite()],
});
```

## Options

`signalsVite()` accepts a small set of controls:

- `endpointBase` - override the default API base (`/__signals_agent__`)
- `maxEvents` - cap the in-memory event buffer size (defaults to `2000`)
- `autoImportDebug` - skip auto-importing `@preact/signals-debug` when set to `false`
- `autoTransform` - disable the built-in React/Preact Babel transform integration
- `framework` - force `react`, `preact`, or `auto` detection for the transform layer

Transform behavior:

- React projects get `@preact/signals-react-transform` in both dev and build
- React development also enables the transform's debug metadata so component and signal names show up in `@preact/signals-debug`
- Preact projects get `@preact/signals-preact-transform` during development so signal names are injected automatically

## What it exposes

The plugin serves a small API from the Vite dev server:

- `POST /__signals_agent__/sessions` - create a filtered debugging session
- `POST /__signals_agent__/reset` - clear buffered events while keeping active sessions
- `GET /__signals_agent__/sessions/:id/events` - fetch buffered events for a session
- `GET /__signals_agent__/sessions/:id/stream` - stream matching events over SSE
- `DELETE /__signals_agent__/sessions/:id` - stop a session
- `GET /__signals_agent__/events` - query recent events without creating a session

Query params for event reads:

- `after=<event-id>` - only return events after a known cursor
- `limit=<count>` - return only the most recent matching events
- `filterPatterns=AuthForm,login` or repeated `filterPatterns` params - match events by summary, signal name, page info, and related metadata
- `filter=...` - alias for `filterPatterns`
- `source=signals|network|page` - restrict results to selected sources

## Example flow

```bash
curl -X POST http://localhost:5173/__signals_agent__/sessions \
	-H 'content-type: application/json' \
	-d '{"filterPatterns":["AuthForm","auth","login"]}'
```

Then open the page, reproduce the issue, and fetch the captured events:

```bash
curl http://localhost:5173/__signals_agent__/sessions/<session-id>/events
```

Reset the local debug buffer between runs if needed:

```bash
curl -X POST http://localhost:5173/__signals_agent__/reset
```

## Notes

- signal values are sanitized before transport
- keys like `password`, `token`, `secret`, and `authorization` are redacted
- network capture records request metadata and statuses, not request bodies
- requests made to the plugin's own debugging API are excluded from captured network events
- malformed JSON sent to the debugging API returns `400`
