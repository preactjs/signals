import { Signal } from "@preact/signals";

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

export type UpdateInfo = ValueUpdate | EffectUpdate;

export interface ValueUpdate {
	type: "value";
	signal: Signal;
	prevValue: any;
	newValue: any;
	timestamp: number;
	depth: number;
}

interface EffectUpdate {
	type: "effect";
	timestamp: number;
	signal: Signal;
	depth: number;
}
