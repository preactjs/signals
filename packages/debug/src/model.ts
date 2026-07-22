import { Effect } from "@preact/signals-core";
import type { ModelInfo } from "./internal";

const BRAND_SYMBOL = Symbol.for("preact-signals");
const MODEL_SYMBOL = Symbol.for("preact-signals-model");
const MODEL_HOOKS_SYMBOL = Symbol.for("preact-signals-model-hooks");
const MODEL_OWNER_HOOK_SYMBOL = Symbol.for("preact-signals-debug-model-hook");

interface ModelMetadata {
	name: string;
}

interface ModelMembership {
	model: ModelMetadata;
	path?: string;
}

type ModelHook = (
	model: object,
	effects: Effect[] | undefined,
	name: string
) => void;

function addModelMembership(
	value: object,
	model: ModelMetadata,
	path?: string
) {
	let memberships: ModelMembership[];
	try {
		const existing = (value as any)[MODEL_SYMBOL];
		if (existing === undefined) {
			memberships = [];
			Object.defineProperty(value, MODEL_SYMBOL, { value: memberships });
		} else if (Array.isArray(existing)) {
			memberships = existing;
		} else {
			return;
		}
	} catch {
		return;
	}

	if (
		!memberships.some(
			membership => membership.model === model && membership.path === path
		)
	) {
		memberships.push({ model, path });
	}
}

function reflectModelMembers(
	value: object,
	model: ModelMetadata,
	path?: string,
	ancestors = new WeakSet<object>()
) {
	if (ancestors.has(value)) return;

	if ((value as any).brand === BRAND_SYMBOL) {
		addModelMembership(value, model, path);
		return;
	}

	ancestors.add(value);
	for (const key of Object.keys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !("value" in descriptor)) continue;
		const member = descriptor.value;
		if (typeof member === "object" && member !== null) {
			reflectModelMembers(
				member,
				model,
				path === undefined ? key : `${path}.${key}`,
				ancestors
			);
		}
	}
	ancestors.delete(value);
}

function attachModelOwnership(
	model: object,
	effects: Effect[] | undefined,
	name: string
) {
	const metadata = { name };
	addModelMembership(model, metadata);
	reflectModelMembers(model, metadata);
	for (const effect of effects || []) {
		addModelMembership(effect, metadata);
	}
}

function installModelOwnershipHook() {
	try {
		const scope =
			typeof globalThis !== "undefined"
				? globalThis
				: typeof self !== "undefined"
					? self
					: undefined;
		if (!scope) return;

		let hooks = (scope as any)[MODEL_HOOKS_SYMBOL];
		if (!(hooks instanceof Set)) {
			hooks = new Set<ModelHook>();
			Object.defineProperty(scope, MODEL_HOOKS_SYMBOL, { value: hooks });
		}

		for (const hook of hooks as Set<ModelHook>) {
			if ((hook as any)[MODEL_OWNER_HOOK_SYMBOL]) return;
		}

		Object.defineProperty(attachModelOwnership, MODEL_OWNER_HOOK_SYMBOL, {
			value: true,
		});
		hooks.add(attachModelOwnership);
	} catch {
		// Model ownership is optional instrumentation.
	}
}

installModelOwnershipHook();

const modelIds = new WeakMap<object, string>();
let nextModelId = 1;

export function getModelInfo(value: any): ModelInfo[] | undefined {
	const memberships = value?.[MODEL_SYMBOL];
	if (!Array.isArray(memberships)) return undefined;

	const models: ModelInfo[] = [];
	for (const membership of memberships) {
		const model = membership?.model;
		if (!model || typeof model !== "object" || typeof model.name !== "string") {
			continue;
		}

		let id = modelIds.get(model);
		if (id === undefined) {
			id = `model_${nextModelId++}`;
			modelIds.set(model, id);
		}

		models.push({
			id,
			name: model.name,
			...(typeof membership.path === "string" ? { path: membership.path } : {}),
		});
	}

	return models.length > 0 ? models : undefined;
}
