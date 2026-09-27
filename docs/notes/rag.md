# RAG tasarımı (Faz 7 için hazır plan)

> Durum: altyapı hazır (pgvector açık, outbox olayları var, AI SDK + tool döngüsü çalışıyor). Tablolar ve
> indexleme işi Faz 7'de, AI'ı detaylandırırken eklenecek. Bu not o işin iskeletidir.

## Neden ayrı bir vektör DB yok

Aynı Postgres'te pgvector kullanılır. En büyük kazanç yetki ve birleştirme: "sadece benim review'larım",
"sadece herkese açık içerik", "şu oyunun topluluk yorumları" gibi filtreler aynı SQL sorgusunda yapılır; ayrı
bir servis ne RAM ne bakım yükü getirir.

## Veri modeli

```sql
create table documents (
  id uuid primary key default uuidv7(),
  source_type text not null,          -- 'game' | 'review' | 'screenshot' (ileride)
  source_id uuid not null,            -- games.id / library_entries.id / screenshots.id
  owner_id text references "user"(id) on delete cascade,  -- review/screenshot sahibi; oyunlarda null
  locale text,                        -- 'tr' | 'en' | null
  content_hash text not null,         -- içerik değişmediyse yeniden embed etme
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create table chunks (
  id uuid primary key default uuidv7(),
  document_id uuid not null references documents(id) on delete cascade,
  idx int not null,
  content text not null,
  embedding vector(768) not null,     -- gemini-embedding-2, outputDimensionality: 768
  tsv tsvector generated always as (to_tsvector('simple', content)) stored
);
create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks using gin (tsv);
```

Drizzle'da `vector("embedding", { dimensions: 768 })` ve HNSW index desteklenir.

## Neler indexlenir

| Kaynak | İçerik | Ne zaman |
|---|---|---|
| Oyun | ad + özet + hikâye + türler/temalar | IGDB'den ilk alındığında ve haftalık metadata yenilemesinde |
| Review | kullanıcının incelemesi (+ oyun adı, puan) | `entry.created` / `entry.updated` olayında `review` değiştiyse |
| Screenshot (ileride) | görselin kendisi (multimodal embedding) | `screenshots.added` |

## Akış

```
outbox olayı (entry.updated: review değişti)
  → worker tüketicisi: content_hash hesapla, değişmediyse çık
  → pg-boss "rag.embed" işi (kuyruklu, rate-limit'li, toplu embedMany)
  → documents upsert + chunks'ı değiştir
```

- Parçalama: review'lar genelde kısa → tek parça. Oyun metni ~800 karakterlik, cümle sınırında bölünmüş parçalar.
- Embedding: `embedMany({ model: google.embedding("gemini-embedding-2"), values, providerOptions: { google: {
  outputDimensionality: 768, taskType: "RETRIEVAL_DOCUMENT" } } })`; sorguda `taskType: "RETRIEVAL_QUERY"`.
- İlk doldurma: tüm oyunlar ve review'lar için tek seferlik bir `rag.backfill` işi (partiler hâlinde).

## Arama (hibrit)

1. Sorgu embedding'i (`RETRIEVAL_QUERY`).
2. İki aday listesi: vektör benzerliği (`embedding <=> $q`, top 30) ve tam metin (`tsv @@ websearch_to_tsquery`, top 30).
3. Reciprocal Rank Fusion ile birleştir: `score = Σ 1 / (60 + rank)`.
4. Yetki filtresi SQL'de: oyunlar herkese açık; review'lar herkese açık (gizlilik ayarı yok) ama istenirse
   `owner_id = currentUser` ile "sadece benim" modu.

## Agent'a bağlama

Mevcut tool listesine (`packages/core/src/ai/tools.ts`) bir `searchKnowledge({ query, scope: "games" | "reviews" |
"mine", limit })` tool'u eklenir. Model gerektiğinde arar; her mesaja körlemesine bağlam doldurulmaz. Tool çıktısı
kaynak kimlikleriyle döner, böylece UI cevapta hangi review'a dayandığını link olarak gösterebilir.

## Maliyet ve kaynak

- 768 boyut × 4 bayt ≈ 3 KB/parça. 10.000 parça ≈ 30 MB + HNSW index — mevcut Postgres bütçesine sığar.
- Embedding çağrıları worker'da, kuyrukla ve sınırlı eşzamanlılıkla; web isteğini bekletmez.
- `AI_PROVIDER=mock` ile yerelde anahtarsız geliştirme için `MockEmbeddingModelV4` (`ai/test`) kullanılabilir.
