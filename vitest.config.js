import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**'],
			// build.js is a filesystem-only CLI wrapper; all its logic lives in library.js,
			// which is covered. Excluding it keeps the threshold meaningful rather than
			// rewarding a test that just shells out and writes files.
			exclude: ['src/build.js'],
			thresholds: { lines: 99, functions: 99, branches: 99, statements: 99 },
		},
	},
})
