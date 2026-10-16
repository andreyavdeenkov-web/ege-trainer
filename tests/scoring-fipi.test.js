'use strict';

/**
 * Оценивание по «Системе оценивания экзаменационной работы» демоверсии
 * КИМ ЕГЭ-2026 по обществознанию (часть 1); те же правила — в п. 10
 * спецификации КИМ ЕГЭ-2027 (проект).
 *
 * Задания 2, 4, 5, 7, 8, 10, 11, 14, 16 (выбор нескольких цифр, 2 балла):
 *   1 балл, «если только один из символов, указанных в ответе, не соответствует
 *   эталону (в том числе, если есть один лишний символ наряду с остальными верными)
 *   или только один символ отсутствует».
 * Задание 1 (два лишних) и задание 3 (соответствие) — 1 балл за полностью верный ответ.
 * Задания 6, 13, 15 (соответствие, 2 балла) — 1 балл, «если на любой одной позиции
 *   ответа записан не тот символ».
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/scoring.js');
const A = require('../js/attempt.js');
const { loadBank } = require('./helpers/ege.js');
const { metadataErrors } = require('./helpers/bank-rules.js');

/** Задание с выбором: ключ — номера верных суждений из шести. */
const multipleTask = (key, count = 6) => ({
  id: 'TST-MUL-001',
  statements: Array.from({ length: count }, (_, i) => ({ correct: key.includes(i + 1) }))
});

/** Соответствие А–Д с ключом key; kimTask — позиция в КИМ (или без неё). */
const matchingTask = (key, kimTask) => Object.assign({
  id: 'TST-MAT-001',
  type: 'matching',
  items: key.map((match) => ({ match })),
  options: ['первый', 'второй', 'третий']
}, kimTask === undefined ? {} : { kimTask });

/* ---------- Выбор нескольких цифр: ключ 1, 3, 5 ---------- */

const key135 = multipleTask([1, 3, 5]);

test('multiple: полное совпадение — 2 балла, порядок цифр не важен', () => {
  assert.equal(S.scoreTask(key135, [1, 3, 5]), 2);
  assert.equal(S.scoreTask(key135, [5, 3, 1]), 2);
});

test('multiple: замена одной цифры другой — 1 балл', () => {
  assert.equal(S.scoreTask(key135, [1, 4, 5]), 1);
  assert.equal(S.scoreTask(key135, [2, 3, 5]), 1);
  assert.equal(S.scoreTask(key135, [1, 3, 6]), 1);
  assert.equal(S.countTaskMistakes(key135, [1, 4, 5]), 1);
});

test('multiple: пропуск одной цифры — 1 балл', () => {
  assert.equal(S.scoreTask(key135, [1, 3]), 1);
  assert.equal(S.scoreTask(key135, [3, 5]), 1);
});

test('multiple: одна лишняя цифра при остальных верных — 1 балл', () => {
  assert.equal(S.scoreTask(key135, [1, 3, 5, 6]), 1);
  assert.equal(S.scoreTask(key135, [1, 2, 3, 5]), 1);
});

test('multiple: две ошибки любого вида — 0 баллов', () => {
  assert.equal(S.scoreTask(key135, [2, 4, 5]), 0, 'две замены');
  assert.equal(S.scoreTask(key135, [1]), 0, 'два пропуска');
  assert.equal(S.scoreTask(key135, [1, 2, 3, 5, 6]), 0, 'две лишние');
  assert.equal(S.scoreTask(key135, [1, 4]), 0, 'замена и пропуск');
  assert.equal(S.scoreTask(key135, [1, 3, 4, 6]), 0, 'замена и лишняя');
  assert.equal(S.scoreTask(key135, [2, 4, 6]), 0, 'всё неверно');
  assert.equal(S.scoreTask(key135, []), 0, 'пустой ответ');
});

test('multiple: те же правила при двух и при четырёх верных', () => {
  const key24 = multipleTask([2, 4], 5);
  assert.equal(S.scoreTask(key24, [2, 4]), 2);
  assert.equal(S.scoreTask(key24, [2, 5]), 1, 'замена');
  assert.equal(S.scoreTask(key24, [2]), 1, 'пропуск');
  assert.equal(S.scoreTask(key24, [1, 2, 4]), 1, 'лишняя');
  assert.equal(S.scoreTask(key24, [1, 3]), 0, 'две замены');
  const key1234 = multipleTask([1, 2, 3, 4], 5);
  assert.equal(S.scoreTask(key1234, [1, 2, 3, 5]), 1, 'замена');
  assert.equal(S.scoreTask(key1234, [1, 2, 3, 4, 5]), 1, 'лишняя');
  assert.equal(S.scoreTask(key1234, [1, 2]), 0, 'два пропуска');
});

/* ---------- Два лишних термина: ключ 2, 5 ---------- */

test('exclude-two (задание 1): 1 балл только за полностью верный ответ', () => {
  const task = { id: 'TST-EXC-001', type: 'exclude-two', statements: multipleTask([2, 5]).statements };
  assert.equal(S.getScoringModel(task), 'exclude-two');
  assert.equal(S.getMaxPoints(task), 1);
  assert.equal(S.scoreTask(task, [5, 2]), 1);
  assert.equal(S.scoreTask(task, [2, 4]), 0, 'замена — ноль, в отличие от multiple');
  assert.equal(S.scoreTask(task, [2]), 0);
});

/* ---------- Соответствие: две модели ---------- */

const key = [1, 2, 1, 3, 2];

test('matching без kimTask и на позициях 6, 13, 15 — модель за 2 балла', () => {
  for (const kim of [undefined, 6, 13, 15]) {
    const task = matchingTask(key, kim);
    assert.equal(S.getScoringModel(task), 'matching', `kimTask ${kim}`);
    assert.equal(S.getMaxPoints(task), 2);
    assert.equal(S.scoreTask(task, [1, 2, 1, 3, 2]), 2, 'полное совпадение');
    assert.equal(S.scoreTask(task, [1, 2, 1, 3, 1]), 1, 'одна неверная позиция');
    assert.equal(S.scoreTask(task, [2, 2, 1, 3, 1]), 0, 'две неверные позиции');
    assert.equal(S.scoreTask(task, [2, 1, 1, 3, 2]), 0, 'перестановка двух позиций');
  }
});

test('matching на позиции 3 — 1 балл только при полном совпадении', () => {
  const task = matchingTask(key, 3);
  assert.equal(S.getScoringModel(task), 'matching-1');
  assert.equal(S.getMaxPoints(task), 1);
  assert.equal(S.scoreTask(task, [1, 2, 1, 3, 2]), 1);
  assert.equal(S.scoreTask(task, [1, 2, 1, 3, 1]), 0, 'одна неверная позиция');
  assert.equal(S.scoreTask(task, [2, 1, 1, 3, 2]), 0);
});

test('kimTask не меняет модель заданий с выбором', () => {
  assert.equal(S.getScoringModel(Object.assign(multipleTask([1, 3, 5]), { kimTask: 2 })), 'multiple');
  assert.equal(S.getMaxPoints(Object.assign(multipleTask([1, 3, 5]), { kimTask: 4 })), 2);
});

test('попытка записывает балл и максимум по модели задания', () => {
  const one = Object.assign(matchingTask(key, 3), { id: 'TST-MAT-003' });
  const two = Object.assign(matchingTask(key), { id: 'TST-MAT-006' });
  const mul = Object.assign(multipleTask([1, 3, 5]), { id: 'TST-MUL-002' });
  const tasks = [one, two, mul];
  const byId = (id) => tasks.find((t) => t.id === id);
  const attempt = A.createAttempt({ taskIds: tasks.map((t) => t.id) });
  A.recordAnswer(attempt, one, [1, 2, 1, 3, 1]);
  A.recordAnswer(attempt, two, [1, 2, 1, 3, 1]);
  A.recordAnswer(attempt, mul, [1, 4, 5]);
  assert.deepEqual(attempt.answers.map((a) => [a.points, a.maxPoints]), [[0, 1], [1, 2], [1, 2]]);
  assert.equal(A.maxScore(attempt, byId), 5);
});

/* ---------- Проверка данных ---------- */

test('kimTask в данных должен подходить типу задания', () => {
  const EGE = loadBank();
  const errs = (task) => metadataErrors(EGE, task).filter((e) => e.startsWith('kimTask'));
  assert.deepEqual(errs(matchingTask(key, 3)), []);
  assert.deepEqual(errs(matchingTask(key, 13)), []);
  assert.equal(errs(matchingTask(key, 2)).length, 1, 'соответствие не бывает на позиции 2');
  assert.deepEqual(errs(Object.assign(multipleTask([1, 3]), { kimTask: 2 })), []);
  assert.equal(errs(Object.assign(multipleTask([1, 3]), { kimTask: 3 })).length, 1);
  assert.equal(errs(Object.assign(multipleTask([1, 3]), { kimTask: 9 })).length, 1, 'позиция 9 не моделируется');
});

test('данные существующих заданий не изменились: у них нет kimTask, соответствия — за 2 балла', () => {
  const EGE = loadBank();
  for (const task of EGE.tasks) {
    assert.equal(task.kimTask, undefined, task.id);
    if (S.getTaskType(task) === 'matching') assert.equal(S.getMaxPoints(task), 2, task.id);
  }
});
