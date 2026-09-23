'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/scoring.js');
const A = require('../js/attempt.js');

// Правильный ответ у обоих заданий: 1, 3.
const tasks = {
  'SOC-STR-001': {
    id: 'SOC-STR-001',
    statements: [{ correct: true }, { correct: false }, { correct: true }, { correct: false }]
  },
  'SOC-MOB-001': {
    id: 'SOC-MOB-001',
    version: 3,
    statements: [{ correct: true }, { correct: false }, { correct: true }]
  },
  'SOC-FAM-001': {
    id: 'SOC-FAM-001',
    statements: [{ correct: true }, { correct: false }, { correct: true }]
  }
};

function newAttempt() {
  return A.createAttempt({
    settings: { section: 'SOC', topic: 'all', count: '5' },
    taskIds: ['SOC-STR-001', 'SOC-MOB-001', 'SOC-FAM-001'],
    now: new Date('2026-09-23T10:00:00Z')
  });
}

test('новая попытка: поля и начальное состояние', () => {
  const a = newAttempt();
  assert.equal(a.schemaVersion, 1);
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  assert.equal(a.startedAt, '2026-09-23T10:00:00.000Z');
  assert.equal(a.finishedAt, null);
  assert.deepEqual(a.settings, { section: 'SOC', topic: 'all', count: '5' });
  assert.deepEqual(a.answers, []);
  assert.equal(A.currentIndex(a), 0);
  assert.equal(A.totalScore(a), 0);
  assert.equal(A.maxScore(a, (id) => tasks[id]), 6);
  assert.equal(A.answeredMaxScore(a), 0);
});

test('ответ записывается с ID задания, выбором, правильным ответом и баллом', () => {
  const a = newAttempt();
  const answer = A.recordAnswer(a, tasks['SOC-STR-001'], [3, 1, 3], new Date('2026-09-23T10:01:00Z'));
  assert.deepEqual(answer, {
    taskId: 'SOC-STR-001',
    taskVersion: 1,
    position: 1,
    selected: [1, 3],
    correct: [1, 3],
    points: 2,
    maxPoints: 2,
    answeredAt: '2026-09-23T10:01:00.000Z'
  });
  const second = A.recordAnswer(a, tasks['SOC-MOB-001'], [1]);
  assert.equal(second.taskVersion, 3);
  assert.equal(second.points, 1);
  assert.equal(A.totalScore(a), 3);
  assert.deepEqual(A.mistakeIndexes(a), [1]);
});

test('оценивание 2/1/0 не изменилось', () => {
  const a = newAttempt();
  assert.equal(A.recordAnswer(a, tasks['SOC-STR-001'], [1, 3]).points, 2);
  assert.equal(A.recordAnswer(a, tasks['SOC-MOB-001'], [1, 2, 3]).points, 1);
  assert.equal(A.recordAnswer(a, tasks['SOC-FAM-001'], [2]).points, 0);
});

test('засчитанный ответ нельзя изменить или записать повторно', () => {
  const a = newAttempt();
  A.recordAnswer(a, tasks['SOC-STR-001'], [1, 3]);
  assert.throws(() => A.recordAnswer(a, tasks['SOC-STR-001'], [2]), /уже засчитан/);
  assert.equal(a.answers.length, 1);
  assert.deepEqual(a.answers[0].selected, [1, 3]);
});

test('нельзя отвечать на задание не по порядку и нельзя пустой ответ', () => {
  const a = newAttempt();
  assert.throws(() => A.recordAnswer(a, tasks['SOC-FAM-001'], [1]), /нельзя отвечать/);
  assert.throws(() => A.recordAnswer(a, tasks['SOC-STR-001'], []), /Не выбрано/);
  assert.throws(() => A.recordAnswer(a, tasks['SOC-STR-001'], [7]), /Некорректный номер/);
  assert.equal(a.answers.length, 0);
});

test('открывать можно только выполненные задания и текущее', () => {
  const a = newAttempt();
  assert.equal(A.canView(a, 0), true);
  assert.equal(A.canView(a, 1), false);
  A.recordAnswer(a, tasks['SOC-STR-001'], [1, 3]);
  assert.equal(A.canView(a, 0), true);
  assert.equal(A.canView(a, 1), true);
  assert.equal(A.canView(a, 2), false);
  assert.equal(A.canView(a, -1), false);
  assert.equal(A.lastReachableIndex(a), 1);
});

test('после выполнения всех заданий попытка завершается один раз', () => {
  const a = newAttempt();
  A.recordAnswer(a, tasks['SOC-STR-001'], [1, 3]);
  A.recordAnswer(a, tasks['SOC-MOB-001'], [1, 3]);
  A.recordAnswer(a, tasks['SOC-FAM-001'], [1, 3]);
  assert.equal(A.isComplete(a), true);
  assert.equal(A.currentIndex(a), -1);
  assert.equal(A.lastReachableIndex(a), 2);
  assert.throws(() => A.recordAnswer(a, tasks['SOC-FAM-001'], [1]), /уже засчитан|выполнены/);

  A.finishAttempt(a, new Date('2026-09-23T10:05:00Z'));
  A.finishAttempt(a, new Date('2026-09-23T11:00:00Z'));
  assert.equal(a.finishedAt, '2026-09-23T10:05:00.000Z');
  assert.throws(() => A.recordAnswer(a, tasks['SOC-STR-001'], [1]), /завершена/);
});

test('попытка сериализуется в JSON без потерь, копия независима', () => {
  const a = newAttempt();
  A.recordAnswer(a, tasks['SOC-STR-001'], [1]);
  const copy = A.snapshot(a);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.deepEqual(copy, a);
  copy.answers[0].points = 99;
  copy.taskIds.push('X');
  assert.equal(a.answers[0].points, 1);
  assert.equal(a.taskIds.length, 3);
});

test('набор заданий фиксируется при старте и не может содержать повторов', () => {
  const ids = ['SOC-STR-001', 'SOC-MOB-001'];
  const a = A.createAttempt({ taskIds: ids });
  ids.push('SOC-FAM-001');
  assert.deepEqual(a.taskIds, ['SOC-STR-001', 'SOC-MOB-001']);
  assert.throws(() => A.createAttempt({ taskIds: ['SOC-STR-001', 'SOC-STR-001'] }), /повторяются/);
  assert.throws(() => A.createAttempt({ taskIds: [] }), /нет заданий/);
  assert.notEqual(A.createAttempt({ taskIds: ids }).id, a.id);
});

test('точки расширения onAnswer и onFinish по умолчанию существуют', () => {
  const store = globalThis.EGE.attemptStore;
  assert.equal(typeof store.onAnswer, 'function');
  assert.equal(typeof store.onFinish, 'function');
});
