import { defineConfig } from "tsdown";

// Production imajında migration'ı ve admin komutunu node_modules olmadan çalıştırabilmek için tek dosyaya
// paketlenir.
export default defineConfig({
  entry: { migrate: "src/migrate.ts", admin: "src/admin-cli.ts" },
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
