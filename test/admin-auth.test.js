const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAdmin, requireAdminRequestHeader } = require('../middleware/admin-auth-middleware');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
}

test('requireAdmin allows configured admin roles', () => {
  const req = { user: { role: 'admin' }, path: '/sources', originalUrl: '/admin/sources' };
  const res = createResponse();
  let called = false;
  requireAdmin(req, res, () => { called = true; });
  assert.equal(called, true);
});

test('requireAdmin rejects non-admin API users', () => {
  const req = { user: { role: 'student' }, path: '/api/sources', originalUrl: '/api/admin/knowledge-sources' };
  const res = createResponse();
  requireAdmin(req, res, () => assert.fail('next should not be called'));
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /管理者権限/);
});

test('write requests require the management UI header', () => {
  const req = { method: 'POST', get: () => undefined };
  const res = createResponse();
  requireAdminRequestHeader(req, res, () => assert.fail('next should not be called'));
  assert.equal(res.statusCode, 403);
});
