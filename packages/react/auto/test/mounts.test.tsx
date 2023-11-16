// @ts-ignore-next-line
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { mountSignalsTests } from "../../test/shared/mounting";
import "@preact/signals-react/auto";

describe("@preact/signals-react/auto mounting", () => {
	mountSignalsTests();
});
