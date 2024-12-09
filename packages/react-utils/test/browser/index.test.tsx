import * as core from "@preact/signals-core";
import * as adapter from "@preact/signals-react";

describe("@preact/signals-react", () => {
	describe("exports", () => {
		it("should re-export core", () => {
			const keys = Object.keys(core);

			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				expect(key in adapter).to.equal(
					true,
					`"${key}" is not exported from react adapter`
				);
			}
		});
	});
});
