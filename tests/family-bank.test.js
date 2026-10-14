'use strict';

/**
 * Тема «Семья и брак»: 30 авторских заданий SOC-FAM-002…031
 * (15 multiple, 5 exclude-two, 10 matching) и их ключи.
 * Ключи проверены содержательно; любое изменение ключа должно быть осознанным.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBank } = require('./helpers/ege.js');

const EGE = loadBank();
const S = EGE.scoring;
const ids = Array.from({ length: 30 }, (_, i) => 'SOC-FAM-' + String(i + 2).padStart(3, '0'));

const KEYS = {
  'SOC-FAM-002': '235', 'SOC-FAM-003': '45', 'SOC-FAM-004': '234', 'SOC-FAM-005': '125',
  'SOC-FAM-006': '245', 'SOC-FAM-007': '235', 'SOC-FAM-008': '145', 'SOC-FAM-009': '23',
  'SOC-FAM-010': '235', 'SOC-FAM-011': '1245', 'SOC-FAM-012': '1245', 'SOC-FAM-013': '2345',
  'SOC-FAM-014': '1235', 'SOC-FAM-015': '345', 'SOC-FAM-016': '1245',
  'SOC-FAM-017': '56', 'SOC-FAM-018': '14', 'SOC-FAM-019': '26', 'SOC-FAM-020': '25', 'SOC-FAM-021': '24',
  'SOC-FAM-022': '22113', 'SOC-FAM-023': '23213', 'SOC-FAM-024': '21121', 'SOC-FAM-025': '12112',
  'SOC-FAM-026': '31212', 'SOC-FAM-027': '21121', 'SOC-FAM-028': '22211', 'SOC-FAM-029': '22211',
  'SOC-FAM-030': '11221', 'SOC-FAM-031': '12122'
};

test('тема «Семья и брак»: 31 задание, из них 30 новых', () => {
  assert.equal(EGE.getTasksByTopic('SOC-FAM').length, 31);
  for (const id of ids) assert.ok(EGE.getTask(id), `нет задания ${id}`);
  assert.equal(EGE.getTask('SOC-FAM-032'), null);
});

test('новые задания: 15 multiple, 5 exclude-two, 10 matching', () => {
  const count = {};
  for (const id of ids) {
    const type = S.getTaskType(EGE.getTask(id));
    count[type] = (count[type] || 0) + 1;
  }
  assert.deepEqual(count, { multiple: 15, 'exclude-two': 5, matching: 10 });
});

test('новые задания: авторские, со сложностью; номера в соответствии могут повторяться', () => {
  for (const id of ids) {
    const task = EGE.getTask(id);
    assert.equal(task.source.kind, 'author', id);
    assert.ok([1, 2, 3].includes(task.difficulty), id);
    if (S.getTaskType(task) === 'matching') {
      assert.notEqual(task.oneToOne, true, `${id}: в заданиях ЕГЭ на соответствие номера могут повторяться`);
      assert.ok(task.options.length <= 3, `${id}: 2–3 варианта во втором столбце`);
    }
  }
});

test('ключи новых заданий', () => {
  for (const id of ids) {
    assert.equal(Array.from(S.getCorrect(EGE.getTask(id))).join(''), KEYS[id], id);
  }
});

test('в ключах нет закономерности по позициям', () => {
  const matchingFirst = new Set(ids.filter((id) => S.getTaskType(EGE.getTask(id)) === 'matching')
    .map((id) => KEYS[id][0]));
  assert.ok(matchingFirst.size > 1, 'в соответствиях позиция А не всегда с одним номером');
  const multipleKeys = ids.filter((id) => S.getTaskType(EGE.getTask(id)) === 'multiple').map((id) => KEYS[id]);
  assert.ok(new Set(multipleKeys.map((k) => k.length)).size === 3, 'верных ответов то 2, то 3, то 4');
  assert.ok(multipleKeys.every((k) => k !== '12' && k !== '123' && k !== '1234'), 'верные не идут подряд с первого номера');
});

test('полностью верный ответ на всю тему — максимум баллов', () => {
  const pool = EGE.getPool('SOC', 'SOC-FAM');
  const total = pool.reduce((sum, t) => sum + S.scoreTask(t, S.getCorrect(t)), 0);
  assert.equal(total, 16 * 2 + 5 * 1 + 10 * 2);
});
