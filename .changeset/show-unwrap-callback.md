---
"@preact/signals-utils": patch
---

Unwrap signals returned from `Show`'s `when` callback

When `when` is a function like `() => someSignal`, `Show` previously used the
returned Signal object directly in its truthiness check. Since Signal objects
are always truthy, this meant the fallback branch was never shown — even when
the signal's value was `false`, `0`, `""`, or `null`.

`Show` now unwraps the return value when it's a Signal, reading `.value` before
the truthiness check. This matches the existing behavior for the non-callback
form (`when={someSignal}`), which already reads `.value`.
