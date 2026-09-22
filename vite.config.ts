import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Cloudflare Pages のルートに置く
  base: '/',
  build: {
    target: 'es2022',
    // AI の重み（約 750KB の JSON）は public/ai/ に置いてあり、Worker から fetch する
    chunkSizeWarningLimit: 900,
  },
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Python 版との一致テストは 42 局面ぶんの先読みを回すので時間がかかる
    testTimeout: 120_000,
  },
})