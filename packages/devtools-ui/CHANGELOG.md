# @preact/signals-devtools-ui

## 0.5.0

### Minor Changes

- [#961](https://github.com/preactjs/signals/pull/961) [`9d03b7e`](https://github.com/preactjs/signals/commit/9d03b7ee93d7ed0ffbd553cdff6df728125767ea) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Focus large dependency graphs on a searched or selected node and its direct dependencies and dependents, while keeping the full graph available on demand.

- [#964](https://github.com/preactjs/signals/pull/964) [`8d5adb1`](https://github.com/preactjs/signals/commit/8d5adb1a1f1b679f4aa02e6bc384974535705d90) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Add Performance Insights for instance-level update hotspots and explicitly instrumented no-output-change computed recomputations.

### Patch Changes

- [#956](https://github.com/preactjs/signals/pull/956) [`75e8a8b`](https://github.com/preactjs/signals/commit/75e8a8b94593b149364137bcebaaf33c30214776) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Wrap dense dependency graph layers into columns so large application graphs remain visible when fitted to the viewport.

- [#963](https://github.com/preactjs/signals/pull/963) [`a4ced54`](https://github.com/preactjs/signals/commit/a4ced54d9d8cc2186038cd8466cc4ab8c97adaed) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Add a chronological Timeline tab that groups runtime updates into inspectable cascades, preserves signal IDs, and supports signal focus and filtering.

- [#962](https://github.com/preactjs/signals/pull/962) [`ee06f32`](https://github.com/preactjs/signals/commit/ee06f32ca40602733a2def3ed3e169c12ef785f6) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Close the settings popover when changes are applied or cancelled.

- Updated dependencies [[`8d5adb1`](https://github.com/preactjs/signals/commit/8d5adb1a1f1b679f4aa02e6bc384974535705d90)]:
  - @preact/signals-devtools-adapter@0.5.0

## 0.4.3

### Patch Changes

- [#928](https://github.com/preactjs/signals/pull/928) [`7d3b123`](https://github.com/preactjs/signals/commit/7d3b1238ab879c54279bded4a64eb45871560778) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Clean up DevTools integration types and configuration payload handling. The debug package now sends normalized settings payloads, adapters accept current and legacy config/availability messages, and the UI disposes adapter subscriptions when contexts are destroyed.

- [#919](https://github.com/preactjs/signals/pull/919) [`980189c`](https://github.com/preactjs/signals/commit/980189cc3be1700b6465a8804ce640948d12a27f) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Improve dependency graph fit and panning on large canvases.

- [#927](https://github.com/preactjs/signals/pull/927) [`6a38fb6`](https://github.com/preactjs/signals/commit/6a38fb657796c9584938bea66bc82e4efb857081) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Fix dependency graph JSON export to include only serializable graph data instead of internal render metadata.

- Updated dependencies [[`7d3b123`](https://github.com/preactjs/signals/commit/7d3b1238ab879c54279bded4a64eb45871560778)]:
  - @preact/signals-devtools-adapter@0.4.1

## 0.4.2

### Patch Changes

- [#876](https://github.com/preactjs/signals/pull/876) [`dbdd585`](https://github.com/preactjs/signals/commit/dbdd585e5c059fe52742452dd69fe390c3a683f9) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Use the native createModel in devtools-ui

## 0.4.1

### Patch Changes

- [#872](https://github.com/preactjs/signals/pull/872) [`8848feb`](https://github.com/preactjs/signals/commit/8848feba51ec578cadc33c558ccee3f6a4310893) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Dark mode in devtools

## 0.4.0

### Minor Changes

- [#866](https://github.com/preactjs/signals/pull/866) [`00ba858`](https://github.com/preactjs/signals/commit/00ba858365c135049400607d2f3f380756c96c5d) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Add special case in devtools-ui for component updates

### Patch Changes

- Updated dependencies [[`00ba858`](https://github.com/preactjs/signals/commit/00ba858365c135049400607d2f3f380756c96c5d)]:
  - @preact/signals-devtools-adapter@0.4.0

## 0.3.0

### Minor Changes

- [#837](https://github.com/preactjs/signals/pull/837) [`0e0625d`](https://github.com/preactjs/signals/commit/0e0625d12f9a7a7770d2e24c63d5cff7cb422c25) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Ensure all component/effect dependencies are always visualized in the Graph

### Patch Changes

- [#849](https://github.com/preactjs/signals/pull/849) [`3a490fe`](https://github.com/preactjs/signals/commit/3a490fe5d74dad9b2273323d118b930ee81ea730) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Improve sorting of nodes/links in the graph

- Updated dependencies [[`0e0625d`](https://github.com/preactjs/signals/commit/0e0625d12f9a7a7770d2e24c63d5cff7cb422c25)]:
  - @preact/signals-devtools-adapter@0.3.0

## 0.2.0

### Minor Changes

- [#828](https://github.com/preactjs/signals/pull/828) [`030e428`](https://github.com/preactjs/signals/commit/030e428cb0427b955c5dc38aea56550fda2c58bb) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Allow for disabling console.log debugging from devtools

### Patch Changes

- Updated dependencies [[`030e428`](https://github.com/preactjs/signals/commit/030e428cb0427b955c5dc38aea56550fda2c58bb)]:
  - @preact/signals-devtools-adapter@0.2.0

## 0.1.1

### Patch Changes

- [#832](https://github.com/preactjs/signals/pull/832) [`f8832ed`](https://github.com/preactjs/signals/commit/f8832eda5b7b7246ba3e15196de64e4c31ea53df) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Properly close settings with the popover api

- [#833](https://github.com/preactjs/signals/pull/833) [`f5357b8`](https://github.com/preactjs/signals/commit/f5357b80ff9c241033b3168d96a5352dbc8e48b7) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Mangle `_debugId` properly so production targets the same variable

## 0.1.0

### Minor Changes

- [#815](https://github.com/preactjs/signals/pull/815) [`53e802a`](https://github.com/preactjs/signals/commit/53e802ad8d9d70b6e4635729892307ea15cbd32f) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Initial release

### Patch Changes

- Updated dependencies [[`53e802a`](https://github.com/preactjs/signals/commit/53e802ad8d9d70b6e4635729892307ea15cbd32f)]:
  - @preact/signals-devtools-adapter@0.1.0
