'use strict';

/**
 * Черновик «Право → Семейное право» (docs/drafts/law-family/tasks.js):
 * 11 заданий, исключённых из темы SOC-FAM, сохранены без изменений,
 * не подключены к сайту и не входят в банк; их ID заняты навсегда.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, scripts, loadBank } = require('./helpers/ege.js');
const { metadataErrors, newTaskErrors } = require('./helpers/bank-rules.js');
const draft = require('../docs/drafts/law-family/tasks.js');

const EGE = loadBank();
const S = EGE.scoring;

// Ключи на момент переноса из темы SOC-FAM.
const KEYS = {
  'SOC-FAM-008': '145', 'SOC-FAM-009': '23', 'SOC-FAM-010': '235', 'SOC-FAM-011': '1245',
  'SOC-FAM-013': '2345', 'SOC-FAM-015': '345', 'SOC-FAM-020': '25',
  'SOC-FAM-027': '21121', 'SOC-FAM-028': '22211', 'SOC-FAM-029': '22211', 'SOC-FAM-030': '11221'
};

test('черновик: 11 заданий с прежними ключами', () => {
  assert.equal(draft.plannedSection, 'LAW');
  assert.deepEqual(draft.tasks.map((t) => t.id), Object.keys(KEYS));
  for (const task of draft.tasks) {
    assert.equal(Array.from(S.getCorrect(task)).join(''), KEYS[task.id], task.id);
  }
});

test('черновик: задания по-прежнему корректны по правилам схемы 2', () => {
  for (const task of draft.tasks) {
    assert.deepEqual(metadataErrors(EGE, task), [], task.id);
    assert.deepEqual(newTaskErrors(EGE, task), [], task.id);
  }
});

test('черновик не подключён к сайту и не входит в банк', () => {
  assert.ok(!scripts.some((s) => s.includes('drafts')), 'черновик подключён в index.html');
  const code = fs.readFileSync(path.join(root, 'docs/drafts/law-family/tasks.js'), 'utf8');
  assert.doesNotMatch(code, /EGE\.addTasks\(/);
  for (const task of draft.tasks) assert.equal(EGE.getTask(task.id), null, `${task.id} есть в банке`);
});
