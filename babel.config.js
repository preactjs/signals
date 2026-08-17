module.exports = function (api) {
	api.cache(true);

	const rename = {};
	const mangle = require("./mangle.json");
	for (let prop in mangle.props.props) {
		let name = prop;
		if (name[0] === "$") {
			name = name.slice(1);
		}

		rename[name] = mangle.props.props[prop];
	}

	return {
		plugins: [["babel-plugin-transform-rename-properties", { rename }]],
	};
};
