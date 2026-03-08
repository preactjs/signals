import type { RemoteSignalMessage } from "@preact/signals-remote";

export type WorkerCommand =
	| { type: "increment" }
	| { type: "decrement" }
	| { type: "randomize" }
	| { type: "start" }
	| { type: "stop" }
	| { type: "reset" };

export type WorkerEnvelope =
	| {
			kind: "remote";
			message: RemoteSignalMessage;
	  }
	| {
			kind: "command";
			command: WorkerCommand;
	  };
