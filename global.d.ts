declare const expect: Chai.ExpectStatic;
declare const sinon: import("sinon").SinonStatic;
declare const transformSignalCode: (
	code: string,
	options?: import("@preact/signals-react-transform").PluginOptions
) => string;
