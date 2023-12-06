// !!!!!!!!!!!!!!!!!!!!
//
// Imports to other packages (e.g. `react` or `@preact/signals-core`) or
// subpackages (e.g. `@preact/signals-react/runtime`) in this file should be
// listed as "external" in cmdline arguments passed to microbundle in the root
// package.json script for this package so their contents aren't bundled into
// the final source file.

import {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
	untracked,
} from "@preact/signals-core";
import type { ReactElement } from "react";
import {
	useSignal,
	useComputed,
	useSignalEffect,
} from "@preact/signals-react/runtime";

export {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
	useSignal,
	useComputed,
	useSignalEffect,
	untracked,
};

declare module "@preact/signals-core" {
	// @ts-ignore internal Signal is viewed as function
	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	interface Signal extends ReactElement {}
}
