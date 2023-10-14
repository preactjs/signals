---
"@preact/signals-react": patch
---

Added reactivity for components wrapped with `React.forwardRef` and `React.lazy`.
So since this moment, this code will work as expected: 
```tsx
const sig = signal(0)
setInterval(() => sig.value++, 1000)

const Lazy = React.lazy(() => Promise.resolve({ default: () => <div>{sig.value + 1}</div> }))
const Forwarded = React.forwardRef(() => <div>{sig.value + 1}</div>)

export const App = () => (
    <Suspense>
        <Lazy />
        <Forwarded />
    </Suspense>
)
```