const { randomUUID } = require('crypto');
const database = require('../db/pool');

const EDITABLE_FIELDS = {
  name: 'name',
  url: 'source_url',
  classification: 'classification',
  documentType: 'document_type',
  category: 'category',
  exampleType: 'example_type',
  remarks: 'remarks',
  isActive: 'is_active'
};

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    url: row.source_url,
    classification: row.classification || '',
    documentType: row.document_type || '',
    category: row.category || '',
    exampleType: row.example_type || '',
    remarks: row.remarks || '',
    isActive: row.is_active,
    syncStatus: row.sync_status,
    lastError: row.last_error,
    contentCharCount: row.content_char_count || 0,
    lastSyncedAt: row.last_synced_at,
    importedFrom: row.imported_from,
    importedRowNumber: row.imported_row_number,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class KnowledgeSourceRepository {
  constructor(db = database) {
    this.db = db;
  }

  async list({ query = '', status = 'all', active = 'all' } = {}) {
    const clauses = [];
    const params = [];

    if (query) {
      params.push(`%${query}%`);
      clauses.push(`(
        name ILIKE $${params.length}
        OR source_url ILIKE $${params.length}
        OR classification ILIKE $${params.length}
        OR category ILIKE $${params.length}
        OR remarks ILIKE $${params.length}
      )`);
    }

    if (status && status !== 'all') {
      params.push(status);
      clauses.push(`sync_status = $${params.length}`);
    }

    if (active === true || active === 'true') {
      clauses.push('is_active = TRUE');
    } else if (active === false || active === 'false') {
      clauses.push('is_active = FALSE');
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.db.query(`
      SELECT *
      FROM knowledge_sources
      ${where}
      ORDER BY updated_at DESC, name ASC
    `, params);
    return result.rows.map(mapRow);
  }

  async listActiveForKnowledgeBase() {
    const result = await this.db.query(`
      SELECT *
      FROM knowledge_sources
      WHERE is_active = TRUE
      ORDER BY name ASC
    `);

    return result.rows.map((row) => ({
      id: row.id,
      fileName: row.name,
      url: row.source_url,
      classification: row.classification || '',
      type: row.document_type || '',
      category: row.category || '',
      goodBadExample: row.example_type || '',
      remarks: row.remarks || ''
    }));
  }

  async findById(id) {
    const result = await this.db.query(
      'SELECT * FROM knowledge_sources WHERE id = $1',
      [id]
    );
    return mapRow(result.rows[0]);
  }

  async create(source, actor = 'system') {
    const id = randomUUID();
    const result = await this.db.query(`
      INSERT INTO knowledge_sources (
        id, name, source_url, classification, document_type, category,
        example_type, remarks, is_active, sync_status, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      RETURNING *
    `, [
      id,
      source.name,
      source.url,
      source.classification || '',
      source.documentType || '',
      source.category || '',
      source.exampleType || '',
      source.remarks || '',
      source.isActive !== false,
      source.isActive === false ? 'disabled' : 'pending',
      actor
    ]);
    return mapRow(result.rows[0]);
  }

  async update(id, changes, actor = 'system') {
    const assignments = [];
    const params = [];

    for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
      if (Object.prototype.hasOwnProperty.call(changes, key)) {
        params.push(changes[key]);
        assignments.push(`${column} = $${params.length}`);
      }
    }

    if (!assignments.length) return this.findById(id);

    params.push(actor);
    assignments.push(`updated_by = $${params.length}`);
    assignments.push('updated_at = NOW()');
    if (Object.prototype.hasOwnProperty.call(changes, 'isActive')) {
      assignments.push(`sync_status = '${changes.isActive ? 'pending' : 'disabled'}'`);
    } else {
      assignments.push(`sync_status = CASE WHEN is_active = FALSE THEN 'disabled' ELSE 'pending' END`);
    }
    assignments.push('last_error = NULL');
    params.push(id);

    const result = await this.db.query(`
      UPDATE knowledge_sources
      SET ${assignments.join(', ')}
      WHERE id = $${params.length}
      RETURNING *
    `, params);
    return mapRow(result.rows[0]);
  }

  async remove(id) {
    const result = await this.db.query(
      'DELETE FROM knowledge_sources WHERE id = $1 RETURNING *',
      [id]
    );
    return mapRow(result.rows[0]);
  }

  async getStats() {
    const result = await this.db.query(`
      SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(*) FILTER (WHERE is_active = TRUE)::INTEGER AS active,
        COUNT(*) FILTER (WHERE sync_status = 'ready')::INTEGER AS ready,
        COUNT(*) FILTER (WHERE sync_status IN ('pending', 'processing'))::INTEGER AS processing,
        COUNT(*) FILTER (WHERE sync_status = 'error')::INTEGER AS error,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW()))::INTEGER AS added_this_month,
        COALESCE(SUM(content_char_count), 0)::INTEGER AS total_characters,
        MAX(last_synced_at) AS last_synced_at
      FROM knowledge_sources
    `);
    const row = result.rows[0];
    return {
      total: row.total,
      active: row.active,
      ready: row.ready,
      processing: row.processing,
      error: row.error,
      addedThisMonth: row.added_this_month,
      totalCharacters: row.total_characters,
      lastSyncedAt: row.last_synced_at
    };
  }

  async markProcessing(id) {
    await this.db.query(`
      UPDATE knowledge_sources
      SET sync_status = 'processing', last_error = NULL, updated_at = NOW()
      WHERE id = $1 AND is_active = TRUE
    `, [id]);
  }

  async markReady(id, contentCharCount) {
    await this.db.query(`
      UPDATE knowledge_sources
      SET sync_status = 'ready', last_error = NULL,
          content_char_count = $2, last_synced_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [id, contentCharCount || 0]);
  }

  async markError(id, errorMessage) {
    await this.db.query(`
      UPDATE knowledge_sources
      SET sync_status = 'error', last_error = $2,
          content_char_count = 0, last_synced_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [id, String(errorMessage || '不明なエラー').slice(0, 4000)]);
  }

  async createImportRun({ spreadsheetId, actor }) {
    const id = randomUUID();
    await this.db.query(`
      INSERT INTO knowledge_source_imports (
        id, source_kind, source_reference, status, started_by
      ) VALUES ($1, 'spreadsheet', $2, 'running', $3)
    `, [id, spreadsheetId, actor]);
    return id;
  }

  async finishImportRun(id, result, error = null) {
    await this.db.query(`
      UPDATE knowledge_source_imports
      SET status = $2,
          imported_count = $3,
          created_count = $4,
          updated_count = $5,
          error_count = $6,
          error_message = $7,
          completed_at = NOW()
      WHERE id = $1
    `, [
      id,
      error ? 'failed' : 'completed',
      result.imported || 0,
      result.created || 0,
      result.updated || 0,
      result.errors || 0,
      error ? String(error.message || error).slice(0, 4000) : null
    ]);
  }

  async upsertImported(source, { actor, importId }) {
    const id = randomUUID();
    const result = await this.db.query(`
      INSERT INTO knowledge_sources (
        id, name, source_url, classification, document_type, category,
        example_type, remarks, is_active, sync_status, imported_from,
        imported_row_number, last_import_id, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, TRUE, 'pending', 'spreadsheet',
        $9, $10, $11, $11
      )
      ON CONFLICT (source_url) DO UPDATE SET
        name = EXCLUDED.name,
        classification = EXCLUDED.classification,
        document_type = EXCLUDED.document_type,
        category = EXCLUDED.category,
        example_type = EXCLUDED.example_type,
        remarks = EXCLUDED.remarks,
        is_active = TRUE,
        sync_status = 'pending',
        last_error = NULL,
        imported_from = 'spreadsheet',
        imported_row_number = EXCLUDED.imported_row_number,
        last_import_id = EXCLUDED.last_import_id,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *, (xmax = 0) AS was_created
    `, [
      id,
      source.fileName,
      source.url,
      source.classification || '',
      source.type || '',
      source.category || '',
      source.goodBadExample || '',
      source.remarks || '',
      source.rowIndex || null,
      importId,
      actor
    ]);

    return {
      source: mapRow(result.rows[0]),
      created: Boolean(result.rows[0].was_created)
    };
  }
}

const knowledgeSourceRepository = new KnowledgeSourceRepository();

module.exports = {
  KnowledgeSourceRepository,
  knowledgeSourceRepository,
  mapRow
};
