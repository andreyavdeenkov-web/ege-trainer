'use strict';

/**
 * Набор заданий попытки: в попытку практикума входят все задания его состава —
 * ограничения количества и случайной выборки из банка нет.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, loadBank } = require('./helpers/ege.js');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appCode = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

test('на стартовом экране нет выбора количества заданий', () => {
  assert.doesNotMatch(html, /count-options|Количество заданий/);
  assert.doesNotMatch(appCode, /COUNT_OPTIONS|countOptions|plannedCount|settings\.count/);
});

test('попытка практикума берёт весь его состав, без среза по количеству и выборки из банка', () => {
  const start = appCode.slice(appCode.indexOf('function startPracticum'), appCode.indexOf('function startSession'));
  assert.match(start, /practicum\.shuffle \? shuffle\(practicum\.taskIds\) : practicum\.taskIds\.slice\(\)/);
  assert.doesNotMatch(start, /getPool|getTasksByTopic|slice\(0,/);
});

test('«Деятельность», Практикум № 1: все 16 заданий темы', () => {
  const EGE = loadBank();
  const practicum = EGE.getPracticum('OBS-ACT-P01');
  assert.equal(practicum.taskIds.length, 16);
  assert.deepEqual([...practicum.taskIds].sort(), [...EGE.getPool('OBS', 'OBS-ACT').map((t) => t.id)].sort());
});
