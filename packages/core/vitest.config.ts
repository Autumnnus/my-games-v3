import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    // Testler aynı test veritabanını paylaşır; dosyalar sırayla çalışır.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
