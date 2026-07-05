---
"@preact/signals": patch
---

Dispose signal prop updaters when an element re-renders without any signal props.

The disposal pass only ran when the new render still carried at least one signal-bound prop. When every signal prop was replaced by plain values, the old updater effect stayed subscribed and kept writing the previous signal's values straight into the DOM, overriding whatever Preact rendered.
