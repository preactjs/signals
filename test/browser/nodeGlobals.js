// Babel plugins require some other babel projects that use NodeJS globals. So
// to run those plugins in the browser I'm declaring those globals here.
window.process = {
	env: {},
};
