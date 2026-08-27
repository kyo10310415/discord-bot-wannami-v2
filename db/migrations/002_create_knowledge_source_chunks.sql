CREATE TABLE IF NOT EXISTS knowledge_source_chunks (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  embedding_model VARCHAR(120) NOT NULL,
  index_version VARCHAR(32) NOT NULL,
  embedding JSONB NOT NULL CHECK (jsonb_typeof(embedding) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, content_hash, embedding_model, index_version, chunk_index)
);

CREATE INDEX IF NOT EXISTS knowledge_source_chunks_cache_idx
  ON knowledge_source_chunks (source_id, content_hash, embedding_model, index_version);
