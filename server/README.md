# my-games-backend-v2

## Kurulum

```bash
bun install
```

## MongoDB'yi Docker ile başlat

```bash
docker compose up -d mongo
```

veya:

```bash
bun run docker:mongo:up
```

## Ortam değişkenleri

Örnek dosyayı kopyalayıp doldurun:

```bash
cp .env.example .env
```

Yerel Docker MongoDB için:

```env
MONGO_URL=mongodb://localhost:27017/my-games
```

## Backend'i çalıştır

```bash
bun run dev
```

Sunucu: `http://localhost:3030`

Scalar API Docs: `http://localhost:3030/scalar`
OpenAPI JSON: `http://localhost:3030/openapi.json`

## MongoDB'yi kapat

```bash
docker compose down
```

veya:

```bash
bun run docker:mongo:down
```
