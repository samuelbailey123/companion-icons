import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**'],
			thresholds: { lines: 99, functions: 99, branches: 99, statements: 99 },
		},
	},
})
