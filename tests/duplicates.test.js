'use strict';

/**
 * Защита от дублей: точные дубли и повтор источника — ошибка,
 * повторяющиеся суждения — предупреждение (выводится в отчёт теста, тест не падает).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBank } = require('./helpers/ege.js');
const D = require('./helpers/duplicates.js');

const EGE = loadBank();

test('в банке нет точных дублей заданий', () => {
  const pairs = D.exactDuplicates(EGE.tasks);
  assert.deepEqual(pairs, [], pairs.map((p) => p.join(' = ')).join('; '));
});

test('в банке нет двух заданий с одним и тем же местом в пособии', () => {
  const pairs = D.repeatedSources(EGE.tasks);
  assert.deepEqual(pairs, [], pairs.map((p) => p.join(' = ')).join('; '));
});

test('предупреждение: суждения, повторяющиеся в разных заданиях', (t) => {
  const repeated = D.repeatedStatements(EGE.tasks);
  for (const r of repeated) {
    t.diagnostic(`Предупреждение: суждение «${r.text}» встречается в заданиях ${r.ids.join(', ')}`);
  }
  // Частичные совпадения допустимы — тест только сообщает о них.
  assert.ok(Array.isArray(repeated));
});

/* ---------- Правила на примерах ---------- */

const base = {
  id: 'SOC-FAM-901',
  statements: [{ text: 'Семья — малая группа.' }, { text: 'Брак и семья тождественны.' }, { text: 'Третье суждение' }]
};

test('нормализация: регистр, ё, пунктуация и пробелы не влияют', () => {
  assert.equal(D.normalize('  Расширенная  СЕМЬЯ — «трёх» поколений! '), 'расширенная семья трех поколений');
});

test('точный дубль находится при другом порядке суждений и другой пунктуации', () => {
  const copy = {
    id: 'SOC-FAM-902',
    statements: [{ text: 'третье суждение' }, { text: 'семья  малая группа' }, { text: 'Брак и семья тождественны' }]
  };
  assert.deepEqual(D.exactDuplicates([base, copy]), [['SOC-FAM-901', 'SOC-FAM-902']]);
});

test('задание с частично совпадающими суждениями — не дубль, а предупреждение', () => {
  const partial = { id: 'SOC-FAM-903', statements: [{ text: 'Семья — малая группа.' }, { text: 'Другое' }, { text: 'Ещё одно' }] };
  assert.deepEqual(D.exactDuplicates([base, partial]), []);
  assert.deepEqual(D.repeatedStatements([base, partial]).map((r) => r.ids), [['SOC-FAM-901', 'SOC-FAM-903']]);
});

test('одинаковые тексты разных типов — не дубль', () => {
  const exclude = Object.assign({}, base, { id: 'SOC-FAM-904', type: 'exclude-two' });
  assert.deepEqual(D.exactDuplicates([base, exclude]), []);
});

test('дубль соответствия: позиции и варианты', () => {
  const m1 = { id: 'OBS-ACT-901', type: 'matching', items: [{ text: 'А' }, { text: 'Б' }], options: ['x', 'y'] };
  const m2 = { id: 'OBS-ACT-902', type: 'matching', items: [{ text: 'Б' }, { text: 'А' }], options: ['y', 'x'] };
  const m3 = { id: 'OBS-ACT-903', type: 'matching', items: [{ text: 'А' }, { text: 'Б' }], options: ['x', 'z'] };
  assert.deepEqual(D.exactDuplicates([m1, m2, m3]), [['OBS-ACT-901', 'OBS-ACT-902']]);
});

test('повтор источника: то же пособие и то же место', () => {
  const a = { id: 'SOC-FAM-905', source: { kind: 'original', title: 'Пособие', ref: 'с. 22, № 3' } };
  const b = { id: 'SOC-FAM-906', source: { kind: 'original', title: 'пособие', ref: 'С. 22, № 3' } };
  const c = { id: 'SOC-FAM-907', source: { kind: 'original', title: 'Пособие', ref: 'с. 22, № 4' } };
  const d = { id: 'SOC-FAM-908', source: { kind: 'author' } };
  assert.deepEqual(D.repeatedSources([a, b, c, d]), [['SOC-FAM-905', 'SOC-FAM-906']]);
});
