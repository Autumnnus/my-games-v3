import { defineConfig } from "tsdown";

// Tüm bağımlılıklar tek dosyaya paketlenir; production imajı node_modules taşımaz.
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: "esm",
  platform: "node",
  target: "node22",
  outExtensions: () => ({ js: ".mjs" }),
  deps: {
    alwaysBundle: [/.*/],
    neverBundle: ["pg-native"],
    onlyBundle: false,
  },
  dts: false,
});
