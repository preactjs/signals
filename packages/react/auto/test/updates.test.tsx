// @ts-ignore-next-line
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { updateSignalsTests } from "../../test/shared/updates";
import "@preact/signals-react/auto";

describe("@preact/signals-react/auto updating", () => {
	// calledOnce
	updateSignalsTests();
});
