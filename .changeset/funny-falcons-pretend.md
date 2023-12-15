---
"@preact/signals-react": major
---

Remove auto tracking using React internals from signals-react package

Before this change, importing `@preact/signals-react` would invoke side effects that hook into React internals to automatically track signals. This change removes those side effects and requires consumers to update their code to continue using signals in React.

We made this breaking change because the mechanism we were using to automatically track signals was fragile and not reliable. We've had multiple issues reported where signals were not being tracked correctly. It would also lead to unexpected errors that were hard to debug.

For some consumers and apps though, the current mechanism does work. If you'd like to continue using this mechanism, simply add `import "@preact/signals/auto";` to the root of your app where you call `ReactDOM.render`. For our newly supported ways of using signals in React, check out the new Readme for `@preact/signals-react`.
