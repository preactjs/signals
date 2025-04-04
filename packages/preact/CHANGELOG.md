# @preact/signals

## 2.0.3

### Patch Changes

- [#666](https://github.com/preactjs/signals/pull/666) [`f72e769`](https://github.com/preactjs/signals/commit/f72e769b885690c4dd53011ab2244015ffd35cb1) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Fix array signals when used as jsx

## 2.0.2

### Patch Changes

- [#655](https://github.com/preactjs/signals/pull/655) [`6a0284c`](https://github.com/preactjs/signals/commit/6a0284ca233e666e16fcab2584269e2344062519) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Avoid usage of `.base` and check the `_dom` on the vnode instead

- [#660](https://github.com/preactjs/signals/pull/660) [`df4df76`](https://github.com/preactjs/signals/commit/df4df765bdeef3e976969d865f8d386a5effebd8) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Bail out of the animation frame with a setTimeout in case the origin page is hidden

## 2.0.1

### Patch Changes

- [#647](https://github.com/preactjs/signals/pull/647) [`655905b`](https://github.com/preactjs/signals/commit/655905bc6e5ee8ba30d578e2a7bf02a9c83ee38c) Thanks [@jviide](https://github.com/jviide)! - Ensure that text effects get disposed

- [#630](https://github.com/preactjs/signals/pull/630) [`4b9144f`](https://github.com/preactjs/signals/commit/4b9144f7f13815013f78299dd487344d3750fd8f) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Change the way we deal with state settling hooks, when we know we are dealing with hooks that can settle their A -> B -> A state (and wind up at the same value). We should not verbatim rerender in our custom shouldComponentUpdate. Instead we should trust that hooks have handled their own state settling.

## 2.0.0

### Major Changes

- [#604](https://github.com/preactjs/signals/pull/604) [`fea3e8d`](https://github.com/preactjs/signals/commit/fea3e8da7a36944d87310678fad291aeacc55d8d) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Defer all DOM updates by an animation frame, this should make it so
  that any previously synchronous DOM update will be instead delayed by an
  animation frame. This allows Preact to first perform its own render
  cycle and then our direct DOM updates to occur. These will now
  be performed in a batched way which is more performant as the browser
  is prepared to handle these during the animation frame.

  This does impact how Preact based signals are tested, when
  you perform a signal update, you'll need to wrap it in `act`. In a way
  this was always the case, as a signal update that resulted in
  a Preact state update would require it to be wrapped in `act`, but
  now this is the norm.

### Minor Changes

- [#595](https://github.com/preactjs/signals/pull/595) [`499428a`](https://github.com/preactjs/signals/commit/499428aa7e7db3e250b3c257debf054a6368c010) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Align signal effects with animation-frames for better performance

### Patch Changes

- [#609](https://github.com/preactjs/signals/pull/609) [`8e6e2de`](https://github.com/preactjs/signals/commit/8e6e2de5a2af27832ea139a7b76fc63ae56cc1f1) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Change timing to a double microtask so we are behind the Preact render queue but can't delay as much as a user-input coming in.

## 1.3.0

### Minor Changes

- [#578](https://github.com/preactjs/signals/pull/578) [`931404e`](https://github.com/preactjs/signals/commit/931404e96338e120464b73e522148389e38eeb2b) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Allow for passing no argument to the signal and the type to be automatically inferred as `T | undefined`

### Patch Changes

- Updated dependencies [[`931404e`](https://github.com/preactjs/signals/commit/931404e96338e120464b73e522148389e38eeb2b)]:
  - @preact/signals-core@1.7.0

## 1.2.3

### Patch Changes

- [#535](https://github.com/preactjs/signals/pull/535) [`58befba`](https://github.com/preactjs/signals/commit/58befba577d02c5cac5292fda0a599f9708e908b) Thanks [@jviide](https://github.com/jviide)! - Publish packages with provenance statements

- Updated dependencies [[`d846def`](https://github.com/preactjs/signals/commit/d846defaf6e64f0236e2b91247e5f94a35f29cbc), [`cb6bdab`](https://github.com/preactjs/signals/commit/cb6bdabbd31b27f8435c7976089fa276da6bfb7a), [`d846def`](https://github.com/preactjs/signals/commit/d846defaf6e64f0236e2b91247e5f94a35f29cbc), [`d846def`](https://github.com/preactjs/signals/commit/d846defaf6e64f0236e2b91247e5f94a35f29cbc), [`d846def`](https://github.com/preactjs/signals/commit/d846defaf6e64f0236e2b91247e5f94a35f29cbc)]:
  - @preact/signals-core@1.6.0

## 1.2.2

### Patch Changes

- [#415](https://github.com/preactjs/signals/pull/415) [`79efe32`](https://github.com/preactjs/signals/commit/79efe32437784a2f7583fc727f9f99324289d11d) Thanks [@prinsss](https://github.com/prinsss)! - Fix error when using `useSignal` with UMD builds of `@preact/signals`.

## 1.2.1

### Patch Changes

- [#399](https://github.com/preactjs/signals/pull/399) [`24fa9f7`](https://github.com/preactjs/signals/commit/24fa9f791d70baba35bdce722f71ce63ac091a4d) Thanks [@rschristian](https://github.com/rschristian)! - Fixes UMD builds of `@preact/signals` and `@preact/signals-react`

## 1.2.0

### Minor Changes

- [#387](https://github.com/preactjs/signals/pull/387) [`6e4dab4`](https://github.com/preactjs/signals/commit/6e4dab4e8c99217aa2837037a5fc82ee852ee288) Thanks [@XantreGodlike](https://github.com/XantreGodlike)! - Removed difference in behaviour between adapters, signals that use a JSX value will correctly re-render the whole component rather than attempting the JSX-Text optimization.

### Patch Changes

- Updated dependencies [[`256a331`](https://github.com/preactjs/signals/commit/256a331b5335e54f7e918b3f1068fb9d92d1c613)]:
  - @preact/signals-core@1.4.0

## 1.1.5

### Patch Changes

- [#381](https://github.com/preactjs/signals/pull/381) [`e655e7f`](https://github.com/preactjs/signals/commit/e655e7f86c321dca12e760e21c01f2dbfafade47) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Allow for context to propagate to components using context

## 1.1.4

### Patch Changes

- [#373](https://github.com/preactjs/signals/pull/373) [`8c12a0d`](https://github.com/preactjs/signals/commit/8c12a0df74f00e9cab04e999fc443889b3528c04) Thanks [@rschristian](https://github.com/rschristian)! - Removes package.json#exports.umd, which had invalid paths if they were ever to be consumed

- Updated dependencies [[`8c12a0d`](https://github.com/preactjs/signals/commit/8c12a0df74f00e9cab04e999fc443889b3528c04), [`26f6526`](https://github.com/preactjs/signals/commit/26f6526875ef0968621c4113594ac95b93de5163)]:
  - @preact/signals-core@1.3.1

## 1.1.3

### Patch Changes

- [`df813ad`](https://github.com/preactjs/signals/commit/df813adc3ed304e326950be08509350cda43f28e) Thanks [@developit](https://github.com/developit)! - Fix rendering of Signals as text in `preact-render-to-string` (#268)

* [#282](https://github.com/preactjs/signals/pull/282) [`cafbdaa`](https://github.com/preactjs/signals/commit/cafbdaabd525a034e38da10b04eee0688c026152) Thanks [@developit](https://github.com/developit)! - Fix a bug that caused cleanup functions returned from a `useSignalEffect()` callback not to be called.

* Updated dependencies [[`7e15d3c`](https://github.com/preactjs/signals/commit/7e15d3cf5f5e66258105e6f27cd7838b52fbbf9f)]:
  - @preact/signals-core@1.2.3

## 1.1.2

### Patch Changes

- [#226](https://github.com/preactjs/signals/pull/226) [`ad29826`](https://github.com/preactjs/signals/commit/ad2982606a8894ea8562a0726d7777185987ad60) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Fix hook names being mangled

- Updated dependencies [[`aa4cb7b`](https://github.com/preactjs/signals/commit/aa4cb7bfad744e78952cacc37af5bd4a713f0d3f), [`3f652a7`](https://github.com/preactjs/signals/commit/3f652a77d2a125a02a0cfc29fe661c81beeda16d)]:
  - @preact/signals-core@1.2.2

## 1.1.1

### Patch Changes

- [#198](https://github.com/preactjs/signals/pull/198) [`3db7500`](https://github.com/preactjs/signals/commit/3db7500beea4c447f22fbde80af7b5171afa171c) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Fix server-sider-render error when unmounting a signal passed as text into JSX.

## 1.1.0

### Minor Changes

- [#91](https://github.com/preactjs/signals/pull/91) [`fb74bb9`](https://github.com/preactjs/signals/commit/fb74bb9ce4e44192e1ee7d3d041274cc985db767) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - add the `useSignalEffect` hook

* [#183](https://github.com/preactjs/signals/pull/183) [`79ff1e7`](https://github.com/preactjs/signals/commit/79ff1e794dde9952db2d6d43b22cebfb2accc770) Thanks [@jviide](https://github.com/jviide)! - Add ability to run custom cleanup logic when an effect is disposed.

  ```js
  effect(() => {
    console.log("This runs whenever a dependency changes");
    return () => {
      console.log("This runs when the effect is disposed");
    });
  });
  ```

### Patch Changes

- [#186](https://github.com/preactjs/signals/pull/186) [`7242bd6`](https://github.com/preactjs/signals/commit/7242bd68cc570c6159600f271ee95977d3970d0f) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Fix unable to set SVG attribute via Signal

* [#161](https://github.com/preactjs/signals/pull/161) [`6ac6923`](https://github.com/preactjs/signals/commit/6ac6923e5294f8a31ee1a009550b9891c3996cb4) Thanks [@jviide](https://github.com/jviide)! - Remove all usages of `Set`, `Map` and other allocation heavy objects in signals-core. This substaintially increases performance across all measurements.

- [#171](https://github.com/preactjs/signals/pull/171) [`fcbb3f4`](https://github.com/preactjs/signals/commit/fcbb3f4b9077e201badec77b91f75c23623d1a9c) Thanks [@jviide](https://github.com/jviide)! - Reduce size of Preact adapter by replacing `WeakSet`s with bitmasks.

- Updated dependencies [[`b4611cc`](https://github.com/preactjs/signals/commit/b4611cc9dee0ae09f4b378ba293c3203edc32be4), [`9802da5`](https://github.com/preactjs/signals/commit/9802da5274bb45c3cc28dda961b9b2d18535729a), [`6ac6923`](https://github.com/preactjs/signals/commit/6ac6923e5294f8a31ee1a009550b9891c3996cb4), [`79ff1e7`](https://github.com/preactjs/signals/commit/79ff1e794dde9952db2d6d43b22cebfb2accc770), [`3e31aab`](https://github.com/preactjs/signals/commit/3e31aabb812ddb0f7451deba38267f8384eff9d1)]:
  - @preact/signals-core@1.2.0

## 1.0.4

### Patch Changes

- [#147](https://github.com/preactjs/signals/pull/147) [`3556499`](https://github.com/preactjs/signals/commit/355649903b766630b62cdd0f90a35d3eafa99fa9) Thanks [@developit](https://github.com/developit)! - Improve performance when rendering Signals as Text in Preact.

* [#148](https://github.com/preactjs/signals/pull/148) [`b948745`](https://github.com/preactjs/signals/commit/b948745de7b5b60a20ce3bdc5ee72d47d47f38ec) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Move `types` field in `package.json` to the top of the entry list to ensure that TypeScript always finds it.

- [#153](https://github.com/preactjs/signals/pull/153) [`0da9ce3`](https://github.com/preactjs/signals/commit/0da9ce3c6f57cef67c3e84f0d829421aee8defff) Thanks [@developit](https://github.com/developit)! - Optimize the performance of prop bindings in Preact

- Updated dependencies [[`f2ba3d6`](https://github.com/preactjs/signals/commit/f2ba3d657bf8169c6ba1d47c0827aa18cfe1c947), [`160ea77`](https://github.com/preactjs/signals/commit/160ea7791f3adb55c562f5990e0b4848d8491a38), [`4385ea8`](https://github.com/preactjs/signals/commit/4385ea8c8358a154d8b789685bb061658ce1153f), [`b948745`](https://github.com/preactjs/signals/commit/b948745de7b5b60a20ce3bdc5ee72d47d47f38ec), [`00a59c6`](https://github.com/preactjs/signals/commit/00a59c6475bd4542fb934474d82d1e242b2ac870)]:
  - @preact/signals-core@1.1.1

## 1.0.3

### Patch Changes

- ab5bd99: Fix swapping and HMR for signals when used as text

## 1.0.2

### Patch Changes

- 2383684: Correctly replace props-value with peeked value
- Updated dependencies [5644c1f]
  - @preact/signals-core@1.0.1

## 1.0.1

### Patch Changes

- c7c0d91: Add marker for devtools to `Text` that is created when a signal is passed into JSX

## 1.0.0

### Major Changes

- 2ee8489: The v1 release for the signals package, we'd to see the uses you all
  come up with and are eager to see performance improvements in your
  applications.

### Patch Changes

- Updated dependencies [ab22ec7]
- Updated dependencies [2ee8489]
- Updated dependencies [b56abf3]
  - @preact/signals-core@1.0.0

## 0.0.4

### Patch Changes

- 702a9c5: Update TypeScript types to mark computed signals as readonly
- 5f8be64: Optimize size of CJS & UMD bundles.
- Updated dependencies [702a9c5]
  - @preact/signals-core@0.0.5

## 0.0.3

### Patch Changes

- 812e7b5: Fix `batch()` not re-exported from preact adapter
- 8e9bf67: Fix incorrect TypeScript paths
- f71ea95: Avoid incrementing Preact adapter when core changes
- Updated dependencies [4123d60]
  - @preact/signals-core@0.0.4

## 0.0.2

### Patch Changes

- 1e4dac5: Add `prepublishOnly` scripts to ensure we're publishing fresh packages
- 9ccf359: Align signal rendering in Text positions with VDOM text rendering - skip rendering of `null`, `undefined` and `boolean` values.
- 1171338: Fix wrong path for TypeScript definitions in `package.json`
- Updated dependencies [1e4dac5]
  - @preact/signals-core@0.0.3
