const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const discord = require('discord.js');
const { getAIResponseStatus } = require('../utils/ai-response-status');
const marker = key => 'SYNTHETIC_' + key + '_PRIVATE_MARKER';
const data = { userId: marker('USER_ID'), username: marker('USER_NAME'), channelName: marker('CHANNEL_NAME'), channelId: marker('CHANNEL_ID'), guildName: marker('GUILD_NAME'), guildId: marker('GUILD_ID'), question: marker('QUESTION'), response: marker('RESPONSE'), responseLength: marker('RESPONSE').length, processingTime: 1, questionType: 'general_question', responseStatus: '成功', messageId: marker('MESSAGE_ID') };
function noPrivateLogs(logs) {
    const text = JSON.stringify(logs);
    for (const key of Object.keys(data))
        if (typeof data[key] === 'string' && data[key].includes('_PRIVATE_MARKER'))
            assert.equal(text.includes(data[key]), false, 'private ' + key);
    for (const name of ['ERROR', 'SHEET', 'IMAGE_URL'])
        assert.equal(text.includes(marker(name)), false, name);
}
function load(source, requireStub, logs, extra = {}) { const module = { exports: {} }; const console = Object.fromEntries(['log', 'warn', 'error', 'info'].map(k => [k, (...a) => logs.push(a)])); vm.runInNewContext(source, { module, exports: module.exports, require: requireStub, console, process: { env: {} }, Date, Map, Set, URL, JSON, ...extra }); return module.exports; }
function qaFixture({ fail = false, enabled = true } = {}) {
    const logs = [], writes = [];
    const source = fs.readFileSync(require.resolve('../services/qa-logger'), 'utf8');
    const sheets = { spreadsheets: { get: async () => ({ data: {} }), values: { get: async () => ({ data: { values: [['existing-header']] } }), append: async (request) => {
                    if (fail)
                        throw Error(marker('ERROR'));
                    writes.push(request);
                } } } };
    const mod = load(source, name => {
        if (name === 'googleapis')
            return { google: { auth: { GoogleAuth: class {
                        } }, sheets: () => sheets } };
        if (name === '../utils/logger')
            return {};
        throw Error('Unexpected module');
    }, logs);
    return { logs, writes, service: mod.qaLoggerService, async initialize() {
            if (enabled)
                await this.service.initialize(marker('SHEET'));
        } };
}
function mentionFixture(qa, { ragFailure = false, everyone = false } = {}) {
    const logs = qa.logs, replies = [];
    const states = new Map([[data.userId, { waitingForQuestion: true, stateType: 'general_question' }]]);
    const source = fs.readFileSync(require.resolve('../handlers/mention-handler'), 'utf8');
    const rag = { generateKnowledgeOnlyResponse: async () => {
            if (ragFailure)
                throw Error(marker('ERROR'));
            return data.response;
        } };
    const mod = load(source, name => {
        if (name === 'discord.js')
            return discord;
        if (name === '../config/hidden-keywords')
            return { HIDDEN_KEYWORDS: [{ keyword: 'never-match-keyword' }] };
        if (name === '../services/youtube-analyzer')
            return { youtubeAnalyzer: {} };
        if (name === '../utils/ai-response-status')
            return { getAIResponseStatus };
        if (name === '../services/rag-system')
            return rag;
        throw Error('Unexpected module');
    }, logs, { global: { interactionStates: states }, setInterval: () => 1, clearInterval: () => { } });
    const message = { id: data.messageId, content: '<@synthetic-bot> ' + data.question, author: { id: data.userId, username: data.username, tag: data.username, bot: false }, system: false, webhookId: null, mentions: { everyone, has: () => true, roles: { some: () => false } }, guild: { id: data.guildId, name: data.guildName, members: { cache: { get: () => null } } }, channel: { id: data.channelId, name: data.channelName, sendTyping: async () => { }, send: async () => { } }, attachments: new Map([['image', { url: 'https://example.invalid/' + marker('IMAGE_URL') + '.png' }]]), embeds: [], reply: async (body) => { replies.push(body); return { id: marker('REPLY_ID'), edit: async () => { } }; } };
    return { mod, message, replies, async run(method = 'handleMessageWithQALogging') { await mod[method](message, { user: { id: 'synthetic-bot' } }, qa.service); } };
}
test('actual mention to QA Sheet preserves business row and reply without duplicating identity/content to console', async () => { const q = qaFixture(); await q.initialize(); const m = mentionFixture(q); await m.run(); assert.equal(m.replies[0], data.response); assert.equal(q.writes.length, 1); const write = q.writes[0]; assert.equal(write.valueInputOption, 'RAW'); const row = write.resource.values[0]; assert.equal(row.length, 13); assert.deepEqual(Array.from(row.slice(1, 8)), [data.userId, data.username, data.channelName, data.channelId, data.guildName, data.question, data.response]); assert.equal(row[12], data.guildId); noPrivateLogs(q.logs); });
test('disabled QA and early message rejection still omit identity without Sheet writes', async () => {
    for (const everyone of [false, true]) {
        const q = qaFixture({ enabled: false });
        const m = mentionFixture(q, { everyone });
        await m.run();
        assert.equal(q.writes.length, 0);
        assert.equal(m.replies.length, everyone ? 0 : 1);
        noPrivateLogs(q.logs);
    }
    const q = qaFixture({ enabled: false });
    const m = mentionFixture(q, { everyone: true });
    await m.run('handleMessage');
    assert.equal(m.replies.length, 0);
    noPrivateLogs(q.logs);
});
test('Sheet and RAG exceptions keep existing reply/continue behavior but cannot log provider details', async () => { const q = qaFixture({ fail: true }); await q.initialize(); const m = mentionFixture(q); await m.run(); assert.equal(m.replies[0], data.response); assert.equal(q.writes.length, 0); noPrivateLogs(q.logs); const q2 = qaFixture(); await q2.initialize(); const m2 = mentionFixture(q2, { ragFailure: true }); await m2.run(); assert.equal(q2.writes.length, 0); assert.equal(m2.replies.length, 1); assert.equal(String(m2.replies[0]).includes(marker('ERROR')), false); noPrivateLogs(q2.logs); });
test('actual entry initialization catch logs only fixed event while QA remains disabled after failure', async () => { const source = fs.readFileSync(require.resolve('../index'), 'utf8'); const start = source.indexOf('// Q&A記録サービス初期化'), end = source.indexOf('// Q&A自動生成サービス初期化', start); assert.ok(start >= 0 && end > start); const logs = []; const logger = Object.fromEntries(['info', 'success', 'error', 'warn'].map(k => [k, (...a) => logs.push(a)])); const execute = vm.runInNewContext('(async()=>{' + source.slice(start, end) + '})', { env: { QA_SPREADSHEET_ID: marker('SHEET') }, qaLoggerService: { initialize: async () => { throw Error(marker('ERROR')); } }, logger }); await execute(); assert.ok(logs.length); noPrivateLogs(logs); });
