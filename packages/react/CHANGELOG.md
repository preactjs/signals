# @preact/signals-react

## 1.2.1

### Patch Changes

- [#238](https://github.com/preactjs/signals/pull/238) [`bcf4b0b`](https://github.com/preactjs/signals/commit/bcf4b0b25d774483ddafa29c2fa133c467668b8c) Thanks [@eddyw](https://github.com/eddyw)! - Fix ERR_UNSUPPORTED_DIR_IMPORT error when importing `use-sync-external-store/shim` from ESM build

## 1.2.0

### Minor Changes

- [#219](https://github.com/preactjs/signals/pull/219) [`0621526`](https://github.com/preactjs/signals/commit/0621526dd59187f674557e6df42c71980b32efab) Thanks [@eddyw](https://github.com/eddyw)! - Replace useReducer with useSyncExternalStore

### Patch Changes

- [#226](https://github.com/preactjs/signals/pull/226) [`ad29826`](https://github.com/preactjs/signals/commit/ad2982606a8894ea8562a0726d7777185987ad60) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Fix hook names being mangled

- Updated dependencies [[`aa4cb7b`](https://github.com/preactjs/signals/commit/aa4cb7bfad744e78952cacc37af5bd4a713f0d3f), [`3f652a7`](https://github.com/preactjs/signals/commit/3f652a77d2a125a02a0cfc29fe661c81beeda16d)]:
  - @preact/signals-core@1.2.2

## 1.1.1

### Patch Changes

- [#221](https://github.com/preactjs/signals/pull/221) [`7e8d4c2`](https://github.com/preactjs/signals/commit/7e8d4c25dfdc7fa9434b6c2af4aa0e495b9fae55) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Fix signal not updated in React production build

- Updated dependencies [[`4b73164`](https://github.com/preactjs/signals/commit/4b7316497aee03413f91e9f714cdcf9f553e39d9), [`57fd2e7`](https://github.com/preactjs/signals/commit/57fd2e723528a36cc5d4ebf09ba34178aa84c879), [`49756ae`](https://github.com/preactjs/signals/commit/49756aef28fe12c6ae6b801224bf5ae608ddf562)]:
  - @preact/signals-core@1.2.1

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

- [#161](https://github.com/preactjs/signals/pull/161) [`6ac6923`](https://github.com/preactjs/signals/commit/6ac6923e5294f8a31ee1a009550b9891c3996cb4) Thanks [@jviide](https://github.com/jviide)! - Remove all usages of `Set`, `Map` and other allocation heavy objects in signals-core. This substaintially increases performance across all measurements.

- Updated dependencies [[`b4611cc`](https://github.com/preactjs/signals/commit/b4611cc9dee0ae09f4b378ba293c3203edc32be4), [`9802da5`](https://github.com/preactjs/signals/commit/9802da5274bb45c3cc28dda961b9b2d18535729a), [`6ac6923`](https://github.com/preactjs/signals/commit/6ac6923e5294f8a31ee1a009550b9891c3996cb4), [`79ff1e7`](https://github.com/preactjs/signals/commit/79ff1e794dde9952db2d6d43b22cebfb2accc770), [`3e31aab`](https://github.com/preactjs/signals/commit/3e31aabb812ddb0f7451deba38267f8384eff9d1)]:
  - @preact/signals-core@1.2.0

## 1.0.2

### Patch Changes

- [#147](https://github.com/preactjs/signals/pull/147) [`3556499`](https://github.com/preactjs/signals/commit/355649903b766630b62cdd0f90a35d3eafa99fa9) Thanks [@developit](https://github.com/developit)! - Improve performance when rendering Signals as Text in Preact.

* [#148](https://github.com/preactjs/signals/pull/148) [`b948745`](https://github.com/preactjs/signals/commit/b948745de7b5b60a20ce3bdc5ee72d47d47f38ec) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - Move `types` field in `package.json` to the top of the entry list to ensure that TypeScript always finds it.

- [#146](https://github.com/preactjs/signals/pull/146) [`9e798fd`](https://github.com/preactjs/signals/commit/9e798fdaf419566530696f850ea7fc1fc649d3cd) Thanks [@marvinhagemeister](https://github.com/marvinhagemeister)! - fix(react): track owners separately, mutate updaters with dispatcher

- Updated dependencies [[`f2ba3d6`](https://github.com/preactjs/signals/commit/f2ba3d657bf8169c6ba1d47c0827aa18cfe1c947), [`160ea77`](https://github.com/preactjs/signals/commit/160ea7791f3adb55c562f5990e0b4848d8491a38), [`4385ea8`](https://github.com/preactjs/signals/commit/4385ea8c8358a154d8b789685bb061658ce1153f), [`b948745`](https://github.com/preactjs/signals/commit/b948745de7b5b60a20ce3bdc5ee72d47d47f38ec), [`00a59c6`](https://github.com/preactjs/signals/commit/00a59c6475bd4542fb934474d82d1e242b2ac870)]:
  - @preact/signals-core@1.1.1

## 1.0.1

### Patch Changes

- 62439c9: Fixes invalid React peer dependency range for environments with strict peerDeps
- Updated dependencies [336bb34]
- Updated dependencies [bc0080c]
- Updated dependencies [7228418]
- Updated dependencies [32abe07]
- Updated dependencies [4782b41]
- Updated dependencies [bf6af3b]
  - @preact/signals-core@1.1.0

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

## 0.0.2

### Patch Changes

- Updated dependencies [702a9c5]
  - @preact/signals-core@0.0.5
