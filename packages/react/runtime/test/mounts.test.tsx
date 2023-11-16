// @ts-ignore-next-line
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { mountSignalsTests } from "../../test/shared/mounting";

describe("@preact/signals-react/runtime mounting", () => {
	mountSignalsTests();
});
