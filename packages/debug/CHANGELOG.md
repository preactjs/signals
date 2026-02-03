# @preact/signals-debug

## 1.3.0

### Minor Changes

- [#837](https://github.com/preactjs/signals/pull/837) [`0e0625d`](https://github.com/preactjs/signals/commit/0e0625d12f9a7a7770d2e24c63d5cff7cb422c25) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Ensure all component/effect dependencies are always visualized in the Graph

## 1.2.1

### Patch Changes

- [`54094d5`](https://github.com/preactjs/signals/commit/54094d53be8a3dce2a327288aff85324001edfa3) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Format react/preact components in the debug logging https://github.com/preactjs/signals/pull/844

## 1.2.0

### Minor Changes

- [#828](https://github.com/preactjs/signals/pull/828) [`030e428`](https://github.com/preactjs/signals/commit/030e428cb0427b955c5dc38aea56550fda2c58bb) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Allow for disabling console.log debugging from devtools

### Patch Changes

- [#841](https://github.com/preactjs/signals/pull/841) [`f770671`](https://github.com/preactjs/signals/commit/f770671cd8f566c583ef191c7ea758d0357cb017) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Batch updates in a more performant way

## 1.1.2

### Patch Changes

- [#840](https://github.com/preactjs/signals/pull/840) [`5b295dd`](https://github.com/preactjs/signals/commit/5b295ddb0bfd3d9b2d8a6a14a0ba7e9f53987879) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Serialize date and bigint values correctly

## 1.1.1

### Patch Changes

- [#833](https://github.com/preactjs/signals/pull/833) [`f5357b8`](https://github.com/preactjs/signals/commit/f5357b80ff9c241033b3168d96a5352dbc8e48b7) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Mangle `_debugId` properly so production targets the same variable

## 1.1.0

### Minor Changes

- [#815](https://github.com/preactjs/signals/pull/815) [`53e802a`](https://github.com/preactjs/signals/commit/53e802ad8d9d70b6e4635729892307ea15cbd32f) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Add support for in-process messaging

- [#819](https://github.com/preactjs/signals/pull/819) [`8a8b0d1`](https://github.com/preactjs/signals/commit/8a8b0d109d324a5764289674e580e693683de04d) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Remove the need for enter/exit component and track the effects normally

### Patch Changes

- [#826](https://github.com/preactjs/signals/pull/826) [`08384be`](https://github.com/preactjs/signals/commit/08384be2d4133582d6c95c11ca890ef79a17ba57) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Fix circular references

- [#827](https://github.com/preactjs/signals/pull/827) [`f17889b`](https://github.com/preactjs/signals/commit/f17889b6d46448205d9485b8d5e691fbe05cd404) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Add mangle entry for \_debugCallback

- Updated dependencies [[`f17889b`](https://github.com/preactjs/signals/commit/f17889b6d46448205d9485b8d5e691fbe05cd404)]:
  - @preact/signals-core@1.12.2

## 1.0.3

### Patch Changes

- [#807](https://github.com/preactjs/signals/pull/807) [`10c50ee`](https://github.com/preactjs/signals/commit/10c50eec83bd1ff0b6de1817b6d71dacb54f9e01) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Update types in the export map of our package.json

## 1.0.2

### Patch Changes

- [#805](https://github.com/preactjs/signals/pull/805) [`2beb964`](https://github.com/preactjs/signals/commit/2beb964bfd76eaab273c7756cd91009a8f67f6e9) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Correct types path in package.json for debug package

## 1.0.1

### Patch Changes

- [#761](https://github.com/preactjs/signals/pull/761) [`c7c3218`](https://github.com/preactjs/signals/commit/c7c32180008d583b2ef490fab05e84bd99d1c51e) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Fix reporting complex values to the extension

## 1.0.0

### Minor Changes

- [#681](https://github.com/preactjs/signals/pull/681) [`6cc7005`](https://github.com/preactjs/signals/commit/6cc700595278d241f276c40dd0ecf162c9e432d8) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Initial release of `@preact/signals-debug`

- [#727](https://github.com/preactjs/signals/pull/727) [`8fe8dec`](https://github.com/preactjs/signals/commit/8fe8decd9b5c6c4fd5b357730838eda030c25ae2) Thanks [@JoviDeCroock](https://github.com/JoviDeCroock)! - Add devtools capabilities and component tracking

### Patch Changes

- Updated dependencies [[`6cc7005`](https://github.com/preactjs/signals/commit/6cc700595278d241f276c40dd0ecf162c9e432d8)]:
  - @preact/signals-core@1.12.0
