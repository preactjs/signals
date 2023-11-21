// @ts-expect-error
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { updateSignalsTests } from "../../../test/shared/updates";

describe("@preact/signals-react/runtime", () => {
	describe("updating", () => {
		updateSignalsTests(true);
	});
});
