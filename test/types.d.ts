import type { signal, computed } from "@preact/signals-core";
import type { useSignal, useComputed } from "@preact/signals";
import type React from "react";

interface VDomLibrary {
	createElement: typeof React.createElement;
	useReducer: typeof React.useReducer;
	useState: typeof React.useState;
}

interface SignalLibrary {
	signal: typeof signal;
	computed: typeof computed;
	useSignal: typeof useSignal;
	useComputed: typeof useComputed;
}
