'use strict';

/**
 * Набор заданий тренировки: после выбора темы, раздела или «Все разделы»
 * в попытку входят все задания выбора — ограничения количества нет.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appCode = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

function loadBank() {
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of scripts.filter((s) => s !== 'js/app.js' && s !== 'js/task-view.js')) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

test('на стартовом экране нет выбора количества заданий', () => {
  assert.doesNotMatch(html, /count-options|Количество заданий/);
  assert.doesNotMatch(appCode, /COUNT_OPTIONS|countOptions|plannedCount|settings\.count/);
});

test('тренировка берёт весь набор выбора, без среза по количеству', () => {
  assert.match(appCode, /var pool = shuffle\(currentPool\(\)\);/);
  assert.match(appCode, /var n = currentPool\(\)\.length;/);
});

test('«Деятельность»: в наборе все 16 заданий', () => {
  const EGE = loadBank();
  const pool = EGE.getPool('OBS', 'OBS-ACT');
  assert.equal(pool.length, 16);
  assert.equal(new Set(pool.map((t) => t.id)).size, 16);
});

test('«Весь раздел» и «Все разделы» включают все задания', () => {
  const EGE = loadBank();
  let total = 0;
  for (const section of EGE.getAvailableSections()) {
    const topicsSum = EGE.getAvailableTopics(section.id)
      .reduce((sum, topic) => sum + EGE.getPool(section.id, topic.id).length, 0);
    assert.equal(EGE.getPool(section.id, 'all').length, topicsSum, section.id);
    total += topicsSum;
  }
  assert.equal(EGE.getPool('all', 'all').length, total);
});
