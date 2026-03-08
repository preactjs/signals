import type {
	ReadonlySignal,
	Signal,
	SignalOptions,
} from "@preact/signals-core";

export type RemoteSignalStatus =
	| "connecting"
	| "ready"
	| "error"
	| "unpublished"
	| "disposed";

export type RemoteModelEntry = {
	key: string;
	value: unknown;
};

export type RemoteSignalMessage =
	| {
			type: "subscribe";
			key: string;
	  }
	| {
			type: "unsubscribe";
			key: string;
	  }
	| {
			type: "snapshot";
			key: string;
			value: unknown;
			version: number;
	  }
	| {
			type: "update";
			key: string;
			value: unknown;
			version: number;
	  }
	| {
			type: "error";
			key: string;
			message: string;
	  }
	| {
			type: "unpublished";
			key: string;
	  }
	| {
			type: "subscribe-model";
			key: string;
	  }
	| {
			type: "unsubscribe-model";
			key: string;
	  }
	| {
			type: "model-snapshot";
			key: string;
			version: number;
			entries: RemoteModelEntry[];
	  }
	| {
			type: "model-patch";
			key: string;
			version: number;
			updates: RemoteModelEntry[];
	  }
	| {
			type: "model-error";
			key: string;
			message: string;
	  }
	| {
			type: "model-unpublished";
			key: string;
	  }
	| {
			type: "call-model-action";
			key: string;
			action: string;
			args: unknown[];
			callId: number;
	  }
	| {
			type: "model-action-result";
			key: string;
			callId: number;
			value: unknown;
	  }
	| {
			type: "model-action-error";
			key: string;
			callId: number;
			message: string;
	  };

export interface RemoteSignalTransport {
	send(message: RemoteSignalMessage): void;
	subscribe(listener: (message: RemoteSignalMessage) => void): () => void;
}

export interface RemoteSignalOptions<T> {
	initialValue?: T;
}

export interface RemoteSignal<T> extends ReadonlySignal<T | undefined> {
	readonly key: string;
	readonly status: ReadonlySignal<RemoteSignalStatus>;
	readonly error: ReadonlySignal<Error | undefined>;
	dispose(): void;
}

export type RemoteModelState<TModel> = {
	[Key in keyof TModel as TModel[Key] extends ReadonlySignal<unknown>
		? Key
		: never]: TModel[Key] extends ReadonlySignal<infer TValue>
		? ReadonlySignal<TValue | undefined>
		: never;
};

export type RemoteModelActionDefinitions<TModel> = {
	[Key in keyof TModel as TModel[Key] extends (...args: any[]) => any
		? Key
		: never]: TModel[Key];
};

export type RemoteModelActions<TActions> = {
	[Key in keyof TActions as TActions[Key] extends (...args: any[]) => any
		? Key
		: never]: TActions[Key] extends (...args: infer TArgs) => infer TReturn
		? (...args: TArgs) => Promise<Awaited<TReturn>>
		: never;
};

export interface RemoteModelContract<
	TKey extends string = string,
	TModel extends object = object,
	TActions = RemoteModelActionDefinitions<TModel>,
> {
	readonly key: TKey;
	readonly __model?: TModel;
	readonly __actions?: TActions;
}

export type RemoteContractKey<TContract extends RemoteModelContract> =
	TContract["key"];

export type RemoteContractModel<TContract extends RemoteModelContract> =
	TContract extends RemoteModelContract<string, infer TModel, any>
		? TModel
		: never;

export type RemoteContractState<TContract extends RemoteModelContract> =
	RemoteModelState<RemoteContractModel<TContract>>;

export type RemoteContractActions<TContract extends RemoteModelContract> =
	TContract extends RemoteModelContract<string, any, infer TActions>
		? TActions
		: never;

export type RemoteModelReference<TContract extends RemoteModelContract> =
	| RemoteContractKey<TContract>
	| TContract;

export interface RemoteModel<
	TModel,
	TActions = RemoteModelActionDefinitions<TModel>,
> {
	readonly key: string;
	readonly status: ReadonlySignal<RemoteSignalStatus>;
	readonly error: ReadonlySignal<Error | undefined>;
	readonly state: RemoteModelState<TModel> | undefined;
	readonly actions: RemoteModelActions<TActions>;
	dispose(): void;
}

export interface RemoteSignalClient {
	signal<T>(key: string, options?: RemoteSignalOptions<T>): RemoteSignal<T>;
	model<TContract extends RemoteModelContract>(
		reference: RemoteModelReference<TContract>
	): RemoteModel<
		RemoteContractModel<TContract>,
		RemoteContractActions<TContract>
	>;
	model<TModel, TActions = RemoteModelActionDefinitions<TModel>>(
		key: string
	): RemoteModel<TModel, TActions>;
	dispose(): void;
}

export interface RemoteSignalServer {
	createSignal<T>(
		key: string,
		initialValue: T,
		options?: SignalOptions<T>
	): Signal<T>;
	publish<T>(key: string, source: ReadonlySignal<T>): () => void;
	unpublish(key: string): void;
	publishModel<TContract extends RemoteModelContract>(
		reference: RemoteModelReference<TContract>,
		model: RemoteContractModel<TContract>
	): () => void;
	publishModel<TModel extends object>(key: string, model: TModel): () => void;
	unpublishModel(key: string): void;
	attach(transport: RemoteSignalTransport): () => void;
}
