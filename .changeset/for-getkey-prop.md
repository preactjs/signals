---
"@preact/signals-react": minor
"@preact/signals": minor
---

Add optional `getKey` prop to `<For>` component for stable list reconciliation. When provided, `getKey` generates stable keys for the internal `<Item>` wrapper, fixing incorrect DOM reuse when items are removed or reordered.
