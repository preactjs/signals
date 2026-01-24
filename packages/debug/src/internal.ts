import { Signal } from "@preact/signals";
import { Effect } from "@preact/signals-core";

export interface Computed extends Signal {
	_sources?: Node;
}

export type Node = {
	_source: Signal;
	_prevSource?: Node;
	_nextSource?: Node;
	_target: any; // Computed or Effect - using any to avoid type issues
	_prevTarget?: Node;
	_nextTarget?: Node;
	_version: number;
	_rollbackNode?: Node;
};

export interface DependencyInfo {
	id: string;
	name: string;
	type: "signal" | "computed";
}

export type UpdateInfo = ValueUpdate | EffectUpdate | ComponentUpdate;

export interface ValueUpdate {
	type: "value";
	signal: Signal;
	prevValue: any;
	newValue: any;
	timestamp: number;
	depth: number;
	subscribedTo?: string; // signalId of the signal this effect is subscribed to
	allDependencies?: DependencyInfo[]; // All dependencies this computed depends on
}

interface EffectUpdate {
	type: "effect";
	timestamp: number;
	signal: Effect;
	depth: number;
	subscribedTo?: string; // signalId of the signal this effect is subscribed to
	allDependencies?: DependencyInfo[]; // All dependencies this effect depends on
}

interface ComponentUpdate {
	type: "component";
	timestamp: number;
	signal: Effect;
	depth: number;
	subscribedTo?: string; // signalId of the signal this component is subscribed to
	allDependencies?: DependencyInfo[]; // All dependencies this component depends on
}
