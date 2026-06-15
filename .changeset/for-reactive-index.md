---
"@preact/signals": patch
"@preact/signals-react": patch
---

Fix stale `<For>` render-prop indexes after removals/reorders by making each cached item's index reactive (a per-item signal) instead of a frozen prop. Cached children are reused and re-render with the new index rather than being recreated, so DOM/component identity is preserved.
