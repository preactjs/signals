import type { ModelConstructor } from "@preact/signals-core";

import type { RemoteModelContract, RemoteModelReference } from "./types";

export function defineRemoteModel<TKey extends string, TModel extends object>(
	key: TKey
): RemoteModelContract<TKey, TModel>;
export function defineRemoteModel<
	TKey extends string,
	TModel extends object,
	TFactoryArgs extends any[],
>(
	key: TKey,
	model: ModelConstructor<TModel, TFactoryArgs>
): RemoteModelContract<TKey, TModel>;
export function defineRemoteModel(key: string): RemoteModelContract {
	return { key };
}

export function resolveRemoteModelKey(
	reference: RemoteModelReference<RemoteModelContract> | string
): string {
	return typeof reference === "string" ? reference : reference.key;
}
