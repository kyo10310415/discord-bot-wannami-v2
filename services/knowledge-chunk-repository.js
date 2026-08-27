const { randomUUID } = require('crypto');
const database = require('../db/pool');

function parseEmbedding(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  }
  return [];
}

class KnowledgeChunkRepository {
  constructor(db = database) {
    this.db = db;
  }

  async listCached({ sourceId, contentHash, embeddingModel, indexVersion }) {
    const result = await this.db.query(`
      SELECT chunk_index, content, embedding
      FROM knowledge_source_chunks
      WHERE source_id = $1
        AND content_hash = $2
        AND embedding_model = $3
        AND index_version = $4
      ORDER BY chunk_index ASC
    `, [sourceId, contentHash, embeddingModel, indexVersion]);

    return result.rows.map((row) => ({
      chunkIndex: row.chunk_index,
      content: row.content,
      embedding: parseEmbedding(row.embedding)
    }));
  }

  async replaceForSource({ sourceId, contentHash, embeddingModel, indexVersion, chunks }) {
    await this.db.withTransaction(async (client) => {
      await client.query('DELETE FROM knowledge_source_chunks WHERE source_id = $1', [sourceId]);

      for (const chunk of chunks) {
        await client.query(`
          INSERT INTO knowledge_source_chunks (
            id, source_id, chunk_index, content, content_hash,
            embedding_model, index_version, embedding
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `, [
          randomUUID(),
          sourceId,
          chunk.chunkIndex,
          chunk.content,
          contentHash,
          embeddingModel,
          indexVersion,
          JSON.stringify(chunk.embedding)
        ]);
      }
    });
  }
}

const knowledgeChunkRepository = new KnowledgeChunkRepository();

module.exports = {
  KnowledgeChunkRepository,
  knowledgeChunkRepository,
  parseEmbedding
};
