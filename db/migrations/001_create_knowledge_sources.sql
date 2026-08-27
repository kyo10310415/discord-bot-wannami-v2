CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_source_imports (
  id UUID PRIMARY KEY,
  source_kind VARCHAR(32) NOT NULL DEFAULT 'spreadsheet',
  source_reference TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  imported_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_by TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  classification VARCHAR(120) NOT NULL DEFAULT '',
  document_type VARCHAR(120) NOT NULL DEFAULT '',
  category VARCHAR(120) NOT NULL DEFAULT '',
  example_type VARCHAR(120) NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sync_status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'processing', 'ready', 'error', 'disabled')),
  last_error TEXT,
  content_char_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  imported_from VARCHAR(32),
  imported_row_number INTEGER,
  last_import_id UUID REFERENCES knowledge_source_imports(id) ON DELETE SET NULL,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_sources_active_idx
  ON knowledge_sources (is_active, name);

CREATE INDEX IF NOT EXISTS knowledge_sources_status_idx
  ON knowledge_sources (sync_status);

CREATE INDEX IF NOT EXISTS knowledge_sources_category_idx
  ON knowledge_sources (category);

CREATE INDEX IF NOT EXISTS knowledge_source_imports_started_idx
  ON knowledge_source_imports (started_at DESC);
