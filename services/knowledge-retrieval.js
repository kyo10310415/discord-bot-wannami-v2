const JAPANESE_STOP_PHRASES = new Set([
  'ありますか',
  'ありませんか',
  'おいたほう',
  'ください',
  'について',
  'でしょうか',
  '教えて',
  '知りたい'
]);

function normalizeDigits(value) {
  return String(value || '').replace(/[０-９]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
}

function extractLessonNumber(value) {
  const normalized = normalizeDigits(value);
  const match = normalized.match(/(?:レッスン|lesson)\s*0*(\d+)(?!\d)/i);
  if (!match) return null;
  const lessonNumber = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(lessonNumber) ? lessonNumber : null;
}

function extractSourceLessonNumber(source) {
  const titleLesson = extractLessonNumber(source?.source || source?.title || source?.name);
  if (titleLesson !== null) return titleLesson;
  return extractLessonNumber(source?.remarks || source?.metadata?.remarks);
}

function splitTextIntoChunks(content, { maxSize = 1000, overlap = 200 } = {}) {
  const text = String(content || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  if (text.length <= maxSize) return [text];

  const safeOverlap = Math.max(0, Math.min(overlap, maxSize - 1));
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(text.length, start + maxSize);

    if (end < text.length) {
      const minimumBoundary = start + Math.floor(maxSize * 0.6);
      const window = text.slice(minimumBoundary, end);
      const boundaryOffsets = [
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('\n'),
        window.lastIndexOf('。'),
        window.lastIndexOf('！'),
        window.lastIndexOf('？')
      ];
      const boundaryOffset = Math.max(...boundaryOffsets);
      if (boundaryOffset >= 0) {
        end = minimumBoundary + boundaryOffset + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;

    const nextStart = Math.max(start + 1, end - safeOverlap);
    start = nextStart;
  }

  return chunks;
}

function meaningfulTokens(value) {
  const text = normalizeDigits(value).toLowerCase();
  const tokens = [
    ...(text.match(/[a-z][a-z0-9_-]+/g) || []),
    ...(text.match(/[ァ-ヶー]{2,}/g) || []),
    ...(text.match(/[一-龯]{2,}/g) || []),
    ...(text.match(/[ぁ-ん]{3,}/g) || [])
  ];

  return [...new Set(tokens
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !JAPANESE_STOP_PHRASES.has(token)))];
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index]);
    const rightValue = Number(right[index]);
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function lexicalSimilarity(content, query) {
  const haystack = normalizeDigits(content).toLowerCase();
  const needle = normalizeDigits(query).toLowerCase().trim();
  const tokens = meaningfulTokens(query);
  if (!needle || (!tokens.length && !haystack.includes(needle))) return 0;

  const matched = tokens.filter((token) => haystack.includes(token)).length;
  const tokenScore = tokens.length ? matched / tokens.length : 0;
  const phraseBonus = haystack.includes(needle) ? 0.25 : 0;
  return Math.min(1, tokenScore * 0.75 + phraseBonus);
}

function createDocumentChunks(document, options = {}) {
  return splitTextIntoChunks(document.content, options).map((content, chunkIndex) => ({
    sourceId: document.id || null,
    source: document.source,
    title: document.source,
    url: document.url,
    classification: document.classification || '',
    category: document.category || '',
    type: document.type || '',
    goodBadExample: document.goodBadExample || '',
    remarks: document.remarks || '',
    metadata: document.metadata,
    chunkIndex,
    content
  }));
}

function aggregateRankedChunks(rankedChunks, {
  maxResults = 5,
  maxChunksPerSource = 3,
  includeMetadata = true
} = {}) {
  const grouped = new Map();

  for (const chunk of rankedChunks) {
    const key = chunk.sourceId || chunk.url || chunk.source;
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...chunk,
        chunks: [],
        score: chunk.score
      });
    }

    const group = grouped.get(key);
    group.score = Math.max(group.score, chunk.score);
    if (group.chunks.length < maxChunksPerSource) {
      group.chunks.push(chunk);
    }
  }

  return [...grouped.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults)
    .map((group) => {
      const excerpts = group.chunks.map((chunk) => chunk.content);
      const score = Math.max(0, Math.min(1, group.score));
      return {
        source: group.source,
        title: group.source,
        url: group.url,
        classification: group.classification,
        category: group.category,
        type: group.type,
        goodBadExample: group.goodBadExample,
        remarks: group.remarks,
        content: excerpts.join('\n\n[…中略…]\n\n'),
        answer: excerpts.join('\n\n[…中略…]\n\n'),
        score,
        rawScore: group.score,
        similarity: score,
        matchDetails: group.chunks.map((chunk) =>
          `意味検索チャンク${chunk.chunkIndex + 1}:${Math.round(chunk.score * 100)}%`),
        metadata: includeMetadata ? {
          ...(group.metadata || {}),
          source: group.source,
          url: group.url,
          lessonNumber: extractSourceLessonNumber(group),
          chunkIndexes: group.chunks.map((chunk) => chunk.chunkIndex)
        } : undefined
      };
    });
}

module.exports = {
  aggregateRankedChunks,
  cosineSimilarity,
  createDocumentChunks,
  extractLessonNumber,
  extractSourceLessonNumber,
  lexicalSimilarity,
  meaningfulTokens,
  normalizeDigits,
  splitTextIntoChunks
};
