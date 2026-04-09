import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	root: resolve(__dirname, 'examples'),
	server: {
		fs: {
			allow: [resolve(__dirname)],
		},
	},
	resolve: {
		alias: {
			'../src': resolve(__dirname, 'src'),
		},
	},
});
