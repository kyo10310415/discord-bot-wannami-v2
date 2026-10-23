const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { GoogleAuth, OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');

async function fixture(respond) {
  const requests = [];
  const client = new OAuth2Client();
  client.setCredentials({ access_token: 'synthetic-test-access', expiry_date: Date.now() + 3600000 });
  client.transporter.defaults.fetchImplementation = async (url, options) => {
    const request = { url: new URL(url), method: options.method, headers: new Headers(options.headers), body: options.body };
    requests.push(request);
    assert.equal(request.headers.get('authorization') === 'Bearer synthetic-test-access', true);
    const { status = 200, data } = respond(request);
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  };
  const auth = new GoogleAuth();
  auth.cachedCredential = client;
  assert.equal(await auth.getClient(), client);
  const module = { exports: {} };
  const logs = [];
  const quiet = new Proxy({}, { get: () => (...args) => logs.push(args) });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'services/google-apis.js'), 'utf8'), {
    module, exports: module.exports, console: quiet,
    require: name => name === 'googleapis' ? { google } : name === 'google-auth-library' ? { GoogleAuth } : name.includes('logger') ? quiet : {},
  });
  const service = module.exports.googleAPIsService;
  service.auth = auth;
  service.sheets = google.sheets({ version: 'v4', auth });
  service.drive = google.drive({ version: 'v3', auth });
  service.initialized = true;
  return { service, auth, requests, logs };
}

test('real GoogleAuth and generated Sheets/Drive/Docs requests preserve service response contract without network', async () => {
  const f = await fixture(({ url }) => {
    if (url.pathname.includes('/values/')) return { data: { values: [['question', 'answer']] } };
    if (url.hostname === 'docs.googleapis.com') return { data: { body: { content: [{ paragraph: { elements: [{ textRun: { content: 'document-text' } }] } }] } } };
    return { data: { id: 'fixture-file', name: 'fixture' } };
  });
  assert.deepEqual(await f.service.readSpreadsheet('fixture-sheet', 'A:G'), [['question', 'answer']]);
  assert.equal((await f.service.getFileInfo('fixture-file')).id, 'fixture-file');
  assert.equal((await f.service.loadGoogleDocs('https://docs.google.com/document/d/fixture-doc/edit', 'fixture')).content.includes('document-text'), true);
  assert.equal(f.requests.length, 3);
  assert.equal(f.requests[0].url.searchParams.get('valueRenderOption'), 'UNFORMATTED_VALUE');
  assert.equal(f.requests[0].url.pathname.endsWith('/values/A%3AG'), true);
  assert.equal(f.requests[1].url.searchParams.get('fields'), 'id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink');
  assert.equal(f.requests[2].url.pathname, '/v1/documents/fixture-doc');
  assert.equal(f.requests.every(r => r.method === 'GET'), true);
});

test('Sheets append keeps JSON requestBody contract under auth10/gaxios7', async () => {
  const f = await fixture(() => ({ data: { updates: { updatedRows: 1 } } }));
  const result = await f.service.sheets.spreadsheets.values.append({ spreadsheetId: 'fixture-sheet', range: 'A:C', valueInputOption: 'RAW', requestBody: { values: [['fixture']] } });
  assert.equal(result.data.updates.updatedRows, 1);
  assert.equal(f.requests[0].method, 'POST');
  assert.equal(JSON.parse(f.requests[0].body).values[0][0], 'fixture');
});

test('failed Google request retains status and redacts authorization before service logging', async () => {
  const f = await fixture(() => ({ status: 403, data: { error: { code: 403, message: 'fixture denial' } } }));
  await assert.rejects(() => f.service.readSpreadsheet('fixture-sheet'), error => {
    assert.equal(error.response.status, 403);
    assert.equal(error.config.headers.get('authorization').includes('synthetic-test-access'), false);
    return true;
  });
  assert.equal(f.logs.some(args => args.some(arg => arg?.config?.headers?.get?.('authorization')?.includes('synthetic-test-access'))), false);
});
