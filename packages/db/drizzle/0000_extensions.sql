-- pgvector: RAG embedding'leri (Faz 7)
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
-- pg_trgm: oyun adı benzerlik araması (migration eşleştirme, arama)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- unaccent: aksan/Türkçe karakterden bağımsız arama
CREATE EXTENSION IF NOT EXISTS unaccent;
