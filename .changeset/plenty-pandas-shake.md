---
"@preact/signals": patch
"@preact/signals-react": patch
---

Fix `For` mis-rendering duplicate items and reusing stale keys.

The item cache was keyed by item identity with the vnode key frozen at creation time. Duplicate primitives collapsed into a single cache entry (same vnode emitted twice with one shared index signal), and after removing an item the frozen positional keys could collide with a newly added item's key, handing the new item another row's DOM and state. Without `getKey`, the cache now keeps one entry per occurrence and mints keys from a counter so a key is never reused for a different item. With `getKey`, the cache is keyed by the user key and the row re-renders when the item value behind a key changes.
