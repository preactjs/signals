---
"@preact/signals": minor
"@preact/signals-react": minor
---

Add support for passing functions as fallback to `<For>` for lazy instantiation.

```tsx
<For each={list} fallback={() => <p>No items</p>}>
	{item => <p>{item}</p>}
</For>
```

This avoids eager evaluation of the fallback when the collection has items, which matters when you're dealing with signals.
