// `env.ts` modül yüklenirken doğrulanır; test dosyaları uygulamayı içe aktarmadan önce değerler hazır olmalı.
process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";

// Veritabanı (test DB), dış servis anahtarlarının temizlenmesi ve her testten önce tabloların boşaltılması.
await import("../../core/test/setup");

export {};
