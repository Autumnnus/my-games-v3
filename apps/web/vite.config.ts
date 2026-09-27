import { fileURLToPath } from "node:url";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  // API ve auth kodu process.env okur. Geliştirmede kök .env'i yükle; production'da değişkenleri
  // Coolify verir. Zaten tanımlı olan değişkenler ezilmez.
  if (mode === "development") {
    for (const [key, value] of Object.entries(loadEnv(mode, repoRoot, ""))) {
      process.env[key] ??= value;
    }
  }

  return {
    envDir: repoRoot,
    resolve: { tsconfigPaths: true },
    plugins: [
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
        strategy: ["cookie", "preferredLanguage", "baseLocale"],
      }),
      nitro({
        rolldownConfig: {
          // Kütüphanelerdeki "use client" direktifleri RSC kullanmadığımız için anlamsız; çıktıyı kirletmesin.
          onwarn(warning, defaultHandler) {
            if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
            defaultHandler(warning);
          },
        },
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  };
});
