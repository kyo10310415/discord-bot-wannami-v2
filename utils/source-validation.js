const net = require('net');

const MAX_LENGTHS = {
  name: 255,
  classification: 120,
  documentType: 120,
  category: 120,
  exampleType: 120,
  remarks: 4000
};

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0;
}

function validateSourceUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch (_) {
    throw new Error('有効なソースURLを入力してください');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('ソースURLはHTTPまたはHTTPSのみ使用できます');
  }
  if (parsed.username || parsed.password) {
    throw new Error('認証情報を含むURLは登録できません');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privateHost = hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === '::1' ||
    isPrivateIpv4(hostname) ||
    (net.isIP(hostname) === 6 && (hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')));

  if (privateHost && process.env.ALLOW_PRIVATE_SOURCE_URLS !== 'true') {
    throw new Error('ローカルネットワークのURLは登録できません');
  }

  parsed.hash = '';
  return parsed.toString();
}

function cleanText(value, field, required = false) {
  const cleaned = String(value ?? '').trim();
  if (required && !cleaned) throw new Error(`${field}は必須です`);
  const maxLength = MAX_LENGTHS[field];
  if (maxLength && cleaned.length > maxLength) {
    throw new Error(`${field}は${maxLength}文字以内で入力してください`);
  }
  return cleaned;
}

function validateSourceInput(input, { partial = false } = {}) {
  const result = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input || {}, key);

  if (!partial || has('name')) result.name = cleanText(input?.name, 'name', true);
  if (!partial || has('url')) result.url = validateSourceUrl(input?.url);
  if (!partial || has('classification')) result.classification = cleanText(input?.classification, 'classification');
  if (!partial || has('documentType')) result.documentType = cleanText(input?.documentType, 'documentType');
  if (!partial || has('category')) result.category = cleanText(input?.category, 'category');
  if (!partial || has('exampleType')) result.exampleType = cleanText(input?.exampleType, 'exampleType');
  if (!partial || has('remarks')) result.remarks = cleanText(input?.remarks, 'remarks');
  if (has('isActive')) {
    if (typeof input.isActive !== 'boolean') throw new Error('isActiveは真偽値で指定してください');
    result.isActive = input.isActive;
  }

  return result;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

module.exports = { validateSourceInput, validateSourceUrl, isUuid };
