// @ts-expect-error
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { updateSignalsTests } from "../../../test/shared/updates";
import "@preact/signals-react/auto";

describe("@preact/signals-react/auto", () => {
	describe("updating", () => {
		// calledOnce
		updateSignalsTests();
	});
});
