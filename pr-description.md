## Summary

**TODO**

## Design decisions

- Not using a class cause it would require reflecting onto a classes constructor and the current signals implementation avoids reflection and proxies so wanted this to be follow a similar design. Can be built on top of this.
- Types specify that the return of `createModel` should be called with `new` though this is not required in the implementation. Mainly doing this to help explain what createModel returns. (**TODO**: explain more).
- Models **do not** return an explicit `dispose` function. Instead they can declare an empty `effect` with a cleanup function. This pattern allows for composable models. See the section "Dispose pattern" below.

## Recommended patterns

### Explicit readonly pattern

I recommend declaring your model interface explicitly and to make signals `ReadonlySignal` in that interface so they are readonly by externally, but mutable internally. This pattern means only actions can modify signals giving you better insight and control over how signals are changed. (**TODO** provide an example)

### Dispose pattern

To invoke logic explicitly on model dispose, define an `effect` that uses no signals but returns your desired cleanup function. This pattern mirrors what you might do for `useEffect` in React. This pattern is the recommended pattern for defining custom model dispose behavior since it allows models to compose without manually wiring up the nested dispose functions.

## Open Questions

- Do people like the `#region` markers? Produced helpful headings in VSCode scroll preview
- Should `createModel` be in its own package? Would require poking into the internals of Effects in order to observe them.

## Future work

- Add `useModel` hook to Preact & React adapters
- Extend debug transform to add name to models & actions and to use model name in signals/computeds/effects declared in model
- Extend debug tooling to understand models and actions
