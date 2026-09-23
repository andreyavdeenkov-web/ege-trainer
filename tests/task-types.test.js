'use strict';

/** Типы заданий exclude-two и matching: оценивание и запись ответа в попытку. */
const test = require('node:test');
const assert = require('node:assert/strict');
const scoring = require('../js/scoring.js');
const A = require('../js/attempt.js');

// «Выпадают» 2 и 5 (как в OBS-ACT-001).
const exclude = {
  id: 'OBS-ACT-001',
  type: 'exclude-two',
  statements: [
    { correct: false }, { correct: true }, { correct: false },
    { correct: false }, { correct: true }, { correct: false }
  ]
};

// Ключ А—2, Б—4, В—1, Г—3, Д—5 (как в OBS-ACT-009).
const matching = {
  id: 'OBS-ACT-009',
  type: 'matching',
  oneToOne: true,
  items: [{ match: 2 }, { match: 4 }, { match: 1 }, { match: 3 }, { match: 5 }],
  options: ['a', 'b', 'c', 'd', 'e']
};

// Соответствие с повторами: вариантов меньше, чем позиций.
const matchingRepeat = {
  id: 'OBS-ACT-901',
  type: 'matching',
  items: [{ match: 1 }, { match: 2 }, { match: 1 }, { match: 2 }],
  options: ['x', 'y']
};

const multiple = { id: 'OBS-ACT-002', statements: [{ correct: false }, { correct: true }, { correct: true }] };

test('тип задания: по умолчанию multiple', () => {
  assert.equal(scoring.getTaskType(multiple), 'multiple');
  assert.equal(scoring.getTaskType(exclude), 'exclude-two');
  assert.equal(scoring.getTaskType(matching), 'matching');
});

test('правильный ответ: номера суждений или номера вариантов по позициям', () => {
  assert.deepEqual(scoring.getCorrect(multiple), [2, 3]);
  assert.deepEqual(scoring.getCorrect(exclude), [2, 5]);
  assert.deepEqual(scoring.getCorrect(matching), [2, 4, 1, 3, 5]);
});

test('multiple через scoreTask оценивается как раньше', () => {
  const correct = [1, 3, 5];
  const task = { statements: [{ correct: true }, { correct: false }, { correct: true }, { correct: false }, { correct: true }, { correct: false }] };
  for (const sel of [[1, 3, 5], [1, 3], [1, 3, 5, 6], [1, 4, 5], [1]]) {
    assert.equal(scoring.scoreTask(task, sel), scoring.scoreAnswer(sel, correct), `ответ ${sel}`);
  }
});

test('exclude-two: 2 балла — обе позиции верны', () => {
  assert.equal(scoring.scoreTask(exclude, [2, 5]), 2);
  assert.equal(scoring.scoreTask(exclude, [5, 2]), 2);
});

test('exclude-two: одна неверная цифра — одна ошибка, 1 балл', () => {
  assert.equal(scoring.countTaskMistakes(exclude, [2, 4]), 1);
  assert.equal(scoring.scoreTask(exclude, [2, 4]), 1);
  assert.equal(scoring.scoreTask(exclude, [1, 5]), 1);
  // Недостающая цифра — тоже одна ошибка.
  assert.equal(scoring.scoreTask(exclude, [2]), 1);
});

test('exclude-two: обе цифры неверны — 0 баллов', () => {
  assert.equal(scoring.countTaskMistakes(exclude, [1, 3]), 2);
  assert.equal(scoring.scoreTask(exclude, [1, 3]), 0);
  assert.equal(scoring.scoreTask(exclude, [4, 6]), 0);
});

test('matching: все соответствия верны — 2 балла', () => {
  assert.equal(scoring.countTaskMistakes(matching, [2, 4, 1, 3, 5]), 0);
  assert.equal(scoring.scoreTask(matching, [2, 4, 1, 3, 5]), 2);
});

test('matching: ошибка — каждая позиция с неверным номером', () => {
  // Переставлены Б и В — две ошибки.
  assert.equal(scoring.countTaskMistakes(matching, [2, 1, 4, 3, 5]), 2);
  assert.equal(scoring.scoreTask(matching, [2, 1, 4, 3, 5]), 0);
  // Незаполненная позиция — одна ошибка.
  assert.equal(scoring.countTaskMistakes(matching, [2, 4, 1, 3, null]), 1);
  assert.equal(scoring.scoreTask(matching, [2, 4, 1, 3, null]), 1);
  // Всё неверно — балл не уходит ниже нуля.
  assert.equal(scoring.countTaskMistakes(matching, [1, 2, 3, 4, 4]), 5);
  assert.equal(scoring.scoreTask(matching, [1, 2, 3, 4, 4]), 0);
});

test('matching с повторами: одна ошибка — 1 балл', () => {
  assert.equal(scoring.scoreTask(matchingRepeat, [1, 2, 1, 2]), 2);
  assert.equal(scoring.scoreTask(matchingRepeat, [1, 2, 2, 2]), 1);
  assert.equal(scoring.scoreTask(matchingRepeat, [2, 1, 1, 2]), 0);
});

test('matching: порядок позиций важен, в отличие от выбора суждений', () => {
  assert.equal(scoring.scoreTask(matching, [5, 3, 1, 4, 2]), 0);
});

test('форматирование ответа с учётом типа', () => {
  assert.equal(scoring.formatTaskAnswer(matching, [2, 4, 1, 3, 5]),
    'А — 2, Б — 4, В — 1, Г — 3, Д — 5');
  assert.equal(scoring.formatTaskAnswer(matching, [2, null]), 'А — 2, Б — ?');
  assert.equal(scoring.formatTaskAnswer(exclude, [5, 2]), '2, 5');
  assert.equal(scoring.formatTaskAnswer(multiple, []), '—');
  assert.equal(scoring.letter(1), 'А');
  assert.equal(scoring.letter(5), 'Д');
});

function attemptWith(...tasks) {
  return A.createAttempt({ taskIds: tasks.map((t) => t.id), now: new Date('2026-09-23T10:00:00Z') });
}

test('попытка: exclude-two записывается как обычный выбор', () => {
  const a = attemptWith(exclude);
  const answer = A.recordAnswer(a, exclude, [5, 2], new Date('2026-09-23T10:01:00Z'));
  assert.deepEqual(answer, {
    taskId: 'OBS-ACT-001', taskVersion: 1, position: 1,
    selected: [2, 5], correct: [2, 5], points: 2, maxPoints: 2,
    answeredAt: '2026-09-23T10:01:00.000Z'
  });
});

test('попытка: exclude-two требует ровно две позиции', () => {
  const a = attemptWith(exclude);
  assert.throws(() => A.recordAnswer(a, exclude, [2]), /ровно 2/);
  assert.throws(() => A.recordAnswer(a, exclude, [1, 2, 5]), /ровно 2/);
  assert.equal(a.answers.length, 0);
  assert.equal(A.recordAnswer(a, exclude, [2, 4]).points, 1);
});

test('попытка: matching записывает номера по позициям без сортировки', () => {
  const a = attemptWith(matching);
  const answer = A.recordAnswer(a, matching, [2, 4, 1, 5, 3]);
  assert.deepEqual(answer.selected, [2, 4, 1, 5, 3]);
  assert.deepEqual(answer.correct, [2, 4, 1, 3, 5]);
  assert.equal(answer.points, 0);
  assert.equal(answer.maxPoints, 2);
  assert.deepEqual(A.mistakeIndexes(a), [0]);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});

test('попытка: matching — все позиции заполнены, номера допустимы, без повторов при oneToOne', () => {
  const a = attemptWith(matching);
  assert.throws(() => A.recordAnswer(a, matching, [2, 4, 1]), /каждой позиции/);
  assert.throws(() => A.recordAnswer(a, matching, [2, 4, 1, 3, null]), /позиции Д/);
  assert.throws(() => A.recordAnswer(a, matching, [2, 4, 1, 3, 6]), /Некорректный номер варианта/);
  assert.throws(() => A.recordAnswer(a, matching, [2, 2, 1, 3, 5]), /только один раз/);
  assert.throws(() => A.recordAnswer(a, matching, 'abc'), /каждой позиции/);
  assert.equal(a.answers.length, 0);
});

test('попытка: matching без oneToOne допускает повторы', () => {
  const a = attemptWith(matchingRepeat);
  assert.equal(A.recordAnswer(a, matchingRepeat, [1, 2, 2, 2]).points, 1);
});

test('попытка из заданий разных типов: сумма и максимум баллов', () => {
  const a = attemptWith(multiple, exclude, matching);
  A.recordAnswer(a, multiple, [2, 3]);
  A.recordAnswer(a, exclude, [2, 4]);
  A.recordAnswer(a, matching, [2, 4, 1, 3, 5]);
  assert.equal(A.totalScore(a), 5);
  assert.equal(A.maxScore(a), 6);
  assert.deepEqual(A.mistakeIndexes(a), [1]);
});
