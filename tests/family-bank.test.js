'use strict';

/**
 * Тема «Семья и брак» (раздел «Социальные отношения»): 30 авторских заданий
 * по социологии семьи (15 multiple, 5 exclude-two, 10 matching) и их ключи.
 * Ключи проверены содержательно; любое изменение ключа должно быть осознанным.
 * Задания о нормах права перенесены в docs/drafts/law-family/tasks.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBank } = require('./helpers/ege.js');

const EGE = loadBank();
const S = EGE.scoring;
const KEYS = {
  // multiple
  'SOC-FAM-002': '235', 'SOC-FAM-003': '45', 'SOC-FAM-004': '234', 'SOC-FAM-005': '125',
  'SOC-FAM-006': '245', 'SOC-FAM-007': '235', 'SOC-FAM-012': '1245', 'SOC-FAM-014': '1235',
  'SOC-FAM-016': '1245', 'SOC-FAM-032': '125', 'SOC-FAM-033': '345', 'SOC-FAM-034': '245',
  'SOC-FAM-035': '135', 'SOC-FAM-036': '135', 'SOC-FAM-037': '234',
  // exclude-two
  'SOC-FAM-017': '56', 'SOC-FAM-018': '14', 'SOC-FAM-019': '26', 'SOC-FAM-021': '24', 'SOC-FAM-038': '26',
  // matching
  'SOC-FAM-022': '22113', 'SOC-FAM-023': '23213', 'SOC-FAM-024': '21121', 'SOC-FAM-025': '12112',
  'SOC-FAM-026': '31212', 'SOC-FAM-031': '12122', 'SOC-FAM-039': '11221', 'SOC-FAM-040': '11122',
  'SOC-FAM-041': '21213', 'SOC-FAM-042': '21211'
};
const ids = Object.keys(KEYS);

/** Признаки проверки норм права в тексте задания (не в объяснениях). */
const LEGAL_MARKERS = [
  /кодекс/i, /ЗАГС/, /записи актов/i, /брачн\S* договор/i, /алимент/i, /Конституци/i,
  /брачн\S* возраст/i, /расторжени/i, /недееспособн/i, /опек/i, /попечител/i, /усыновл/i,
  /законодательств/i, /по закону/i, /нотариал/i, /в суде|судебн/i
];

test('тема «Семья и брак»: 31 задание — SOC-FAM-001 и 30 новых', () => {
  assert.equal(ids.length, 30);
  assert.deepEqual(Array.from(EGE.getTasksByTopic('SOC-FAM'), (t) => t.id).sort(), ['SOC-FAM-001', ...ids].sort());
});

test('в теме только социология семьи: формулировки не проверяют нормы права', () => {
  for (const task of EGE.getTasksByTopic('SOC-FAM')) {
    const texts = [task.question, task.instruction, ...(task.statements || []).map((s) => s.text),
      ...(task.items || []).map((i) => i.text), ...(task.options || [])].filter(Boolean);
    for (const text of texts) {
      for (const re of LEGAL_MARKERS) {
        assert.ok(!re.test(text), `${task.id}: «${text}» — правовой материал (${re})`);
      }
    }
  }
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
