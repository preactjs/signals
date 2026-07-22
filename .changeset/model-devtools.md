---
"@preact/signals-core": minor
"@preact/signals-debug": minor
"@preact/signals-devtools-adapter": minor
"@preact/signals-devtools-ui": minor
"@preact/signals-preact-transform": minor
"@preact/signals-react-transform": minor
"@preact/signals-agent-vite": minor
---

Make `createModel` instances first-class in the debug and DevTools experience. Core exposes model names and a lightweight construction hook, while the debug package owns model membership and instance metadata. Model identity and member paths now flow through debug events, update rows show model badges, dependency graphs draw model boundaries, and the Babel transforms infer model names in debug mode.
