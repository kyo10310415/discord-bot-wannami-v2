const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cron = require('node-cron');

function loadScheduler(file, fakeCron) {
  const module = { exports: {} };
  const quiet = new Proxy({}, { get: () => () => {} });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'services', file), 'utf8'), {
    module, exports: module.exports, console: quiet,
    require: name => name === 'node-cron' ? fakeCron : name.includes('logger') ? quiet : {},
    Date
  });
  return module.exports;
}

test('knowledge scheduler explicitly creates stopped task then starts with unchanged Tokyo schedule', () => {
  const calls = [];
  const task = { start: () => calls.push('start'), stop: () => calls.push('stop') };
  const { KnowledgeScheduler } = loadScheduler('knowledge-scheduler.js', {
    createTask(expression, callback, options) {
      calls.push('create');
      assert.equal(expression, '0 0 3 * * 1');
      assert.equal(options.timezone, 'Asia/Tokyo');
      assert.equal('scheduled' in options, false);
      assert.equal(typeof callback, 'function');
      return task;
    }
  });
  const scheduler = new KnowledgeScheduler();
  scheduler.start();
  assert.equal(scheduler.isRunning, true);
  scheduler.stop();
  assert.equal(scheduler.isRunning, false);
  assert.equal(scheduler.cronJob, null);
  assert.deepEqual(calls, ['create', 'start', 'stop']);
});

test('weekly scheduler keeps automatically started Tuesday UTC schedule and stop contract', () => {
  let stopped = false;
  const { WeeklySchedulerService } = loadScheduler('weekly-scheduler.js', {
    schedule(expression, callback, options) {
      assert.equal(expression, '0 9 * * 2');
      assert.equal(options.timezone, 'UTC');
      assert.equal(typeof callback, 'function');
      return { stop: () => { stopped = true; } };
    }
  });
  const scheduler = new WeeklySchedulerService();
  assert.equal(scheduler.start(), true);
  assert.equal(scheduler.isRunning, true);
  scheduler.stop();
  assert.equal(stopped, true);
  assert.equal(scheduler.isRunning, false);
});

test('v4 real scheduling preserves timezone and lifecycle without running any job', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date('2026-10-23T00:00:00Z') });
  let executions = 0;
  const knowledge = cron.createTask('0 0 3 * * 1', () => { executions++; }, { timezone: 'Asia/Tokyo' });
  const weekly = cron.schedule('0 9 * * 2', () => { executions++; }, { timezone: 'UTC' });
  try {
    assert.equal(knowledge.getStatus(), 'stopped');
    assert.equal(knowledge.getNextRun(), null);
    knowledge.start();
    assert.equal(knowledge.getNextRun().toISOString(), '2026-10-25T18:00:00.000Z');
    assert.equal(weekly.getNextRun().toISOString(), '2026-10-27T09:00:00.000Z');
    knowledge.stop();
    weekly.stop();
    assert.equal(knowledge.getStatus(), 'stopped');
    assert.equal(weekly.getStatus(), 'stopped');
    assert.equal(executions, 0);
    assert.equal(cron.validate('invalid'), false);
    assert.throws(() => cron.createTask('invalid', () => {}));
  } finally {
    knowledge.destroy();
    weekly.destroy();
  }
});
