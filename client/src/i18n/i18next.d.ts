import type tr from "./locales/tr.json";

declare module "i18next" {
  interface CustomTypeOptions {
    resources: {
      translation: typeof tr;
    };
  }
}
