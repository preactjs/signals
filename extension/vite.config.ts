import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	esbuild: {
		jsx: "transform",
		jsxFactory: "h",
		jsxFragment: "Fragment",
		jsxImportSource: "preact",
	},
	build: {
		outDir: "dist",
		rollupOptions: {
			input: {
				popup: resolve(__dirname, "src/popup.tsx"),
				panel: resolve(__dirname, "src/panel.tsx"),
			},
			output: {
				entryFileNames: "[name].js",
				chunkFileNames: "[name].js",
				assetFileNames: "[name].[ext]",
			},
		},
		minify: false,
		sourcemap: true,
	},
	define: {
		"process.env.NODE_ENV": JSON.stringify(
			process.env.NODE_ENV || "development"
		),
	},
});
