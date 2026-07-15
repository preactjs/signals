---
"@preact/signals": minor
"@preact/signals-react": minor
---

Add support for passing functions as fallback to `<Show>` for lazy instantiation.

```tsx
<Show when={toggle} fallback={() => <p>I'm lazy</p>}>
	<p>foo</p>
</Show>
```

This avoids eager evaluation of whatever is passed to fallback which matters when you're dealing with signals.
