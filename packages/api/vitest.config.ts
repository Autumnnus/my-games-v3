import { defineConfig } from "vitest/config";

// API testleri core'un test veritabanını ve kurulumunu paylaşır (aynı DB, dosyalar sırayla).
export default defineConfig({
  test: {
    globalSetup: ["../core/test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
