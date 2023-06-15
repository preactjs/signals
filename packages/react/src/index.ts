import {
	signal,
	computed,
	batch,
	effect,
	Signal,
	type ReadonlySignal,
} from "@preact/signals-core";
import { useSignal, useComputed, useSignalEffect } from "../runtime";
import { installAutoSignalTracking } from "../runtime/src/auto";

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
};

installAutoSignalTracking();
