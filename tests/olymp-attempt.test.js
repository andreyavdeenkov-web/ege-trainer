'use strict';

/** Олимпиады: попытка в режимах practice (тренировка) и mock (пробный тур). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, defineCatalog, sampleTasks, registerTestRules, officialScoring } = require('./helpers/olymp.js');

const T0 = new Date('2026-09-24T10:00:00.000Z');
const T1 = new Date('2026-09-24T10:05:00.000Z');

function setup() {
  const OLY = loadCore();
  registerTestRules(OLY);
  defineCatalog(OLY);
  const tasks = sampleTasks();
  tasks[0].scoring = officialScoring('test-minus-per-mistake', 2, { penalty: 1 });   // multiple-select
  OLY.addTasks(tasks);
  OLY.addSource({
    id: 'TST-2026-27-DEMO-9-1', olympiad: 'TST', subject: 'social', kind: 'demo',
    year: '2026/27', classes: [9], round: 1, title: 'Демоверсия · 9 класс · I тур',
    answersBasis: 'official', playable: true,
    items: [
      { number: 1, taskId: 'TST-PHI-HIS-001' },
      { number: 2, taskId: 'TST-SOC-MOB-001' },
      { number: 3, taskId: 'TST-SOC-FAM-001', scoring: officialScoring('test-all-or-nothing', 3) }
    ]
  });
  return OLY;
}

function practice(OLY) {
  return OLY.attempt.createAttempt({
    mode: 'practice', olympiad: 'TST', subject: 'social', now: T0,
    settings: { discipline: 'SOC', topic: 'SOC-MOB', filters: { class: 'all', round: 'all' } },
    taskIds: ['TST-SOC-MOB-001', 'TST-SOC-MOB-002', 'TST-PHI-HIS-001']
  });
}

function mock(OLY) {
  return OLY.attempt.createAttempt({ mode: 'mock', settings: { sourceId: 'TST-2026-27-DEMO-9-1' }, now: T0 });
}

test('createAttempt: проверки', () => {
  const OLY = setup();
  const A = OLY.attempt;
  assert.throws(() => A.createAttempt({ mode: 'exam' }), /Неизвестный режим/);
  assert.throws(() => A.createAttempt({ mode: 'practice', olympiad: 'TST', subject: 'social', taskIds: [] }), /нет заданий/);
  assert.throws(() => A.createAttempt({ mode: 'practice', olympiad: 'TST', subject: 'social',
    taskIds: ['TST-SOC-MOB-001', 'TST-SOC-MOB-001'] }), /повторяются/);
  assert.throws(() => A.createAttempt({ mode: 'practice', olympiad: 'TST', subject: 'social',
    taskIds: ['TST-SOC-MOB-999'] }), /Неизвестное задание/);
  assert.throws(() => A.createAttempt({ mode: 'practice', olympiad: 'HP', subject: 'social',
    taskIds: ['TST-SOC-MOB-001'] }), /другой олимпиаде/);
  assert.throws(() => A.createAttempt({ mode: 'mock', settings: { sourceId: 'TST-NOPE' } }), /Неизвестный источник/);
});

test('practice: свободная навигация, пропуск и явная проверка', () => {
  const OLY = setup();
  const A = OLY.attempt;
  const attempt = practice(OLY);
  // Черновики можно вводить в любом порядке и менять до проверки.
  A.setResponse(attempt, 'TST-PHI-HIS-001', 'эсхатология', T0);
  A.setResponse(attempt, 'TST-SOC-MOB-001', [2], T0);
  A.setResponse(attempt, 'TST-SOC-MOB-001', [3, 1], T0);
  assert.deepEqual(A.getResponse(attempt, 'TST-SOC-MOB-001'), [1, 3]);
  assert.equal(A.isChecked(attempt, 'TST-SOC-MOB-001'), false);
  assert.equal(A.getResult(attempt, 'TST-SOC-MOB-001'), null);   // до проверки ответ не раскрывается

  // Проверка третьего задания раньше первого — допустима.
  const r3 = A.check(attempt, 'TST-PHI-HIS-001', T1);
  assert.equal(r3.verdict, 'correct');
  assert.equal(r3.points, null);                                   // критерии не определены
  const r1 = A.check(attempt, 'TST-SOC-MOB-001', T1);
  assert.deepEqual([r1.verdict, r1.points, r1.maxPoints], ['correct', 2, 2]);
  assert.deepEqual(r1.correct, [1, 3]);
});

test('practice: после проверки ответ read-only', () => {
  const OLY = setup();
  const A = OLY.attempt;
  const attempt = practice(OLY);
  A.setResponse(attempt, 'TST-SOC-MOB-001', [1]);
  A.check(attempt, 'TST-SOC-MOB-001');
  assert.equal(A.canEdit(attempt, 'TST-SOC-MOB-001'), false);
  assert.equal(A.canEdit(attempt, 'TST-SOC-MOB-002'), true);
  assert.throws(() => A.setResponse(attempt, 'TST-SOC-MOB-001', [1, 3]), /уже засчитан/);
  assert.throws(() => A.check(attempt, 'TST-SOC-MOB-001'), /уже засчитан/);
});

test('practice: пустой ответ проверить нельзя; чужое задание — ошибка', () => {
  const OLY = setup();
  const A = OLY.attempt;
  const attempt = practice(OLY);
  assert.throws(() => A.check(attempt, 'TST-SOC-MOB-002'), /Нет ответа/);
  A.setResponse(attempt, 'TST-PHI-HIS-001', '   ');
  assert.throws(() => A.check(attempt, 'TST-PHI-HIS-001'), /Нет ответа/);
  assert.throws(() => A.setResponse(attempt, 'TST-SOC-FAM-001', [1, 2, 3]), /нет в попытке/);
  assert.throws(() => A.setResponse(attempt, 'TST-SOC-MOB-002', 7), /Некорректный номер варианта/);
});

test('practice: завершение — непроверенные задания пропущены', () => {
  const OLY = setup();
  const A = OLY.attempt;
  const attempt = practice(OLY);
  A.setResponse(attempt, 'TST-SOC-MOB-001', [1]);
  A.check(attempt, 'TST-SOC-MOB-001');
  A.setResponse(attempt, 'TST-SOC-MOB-002', 1);                     // черновик без проверки
  A.finish(attempt, T1);
  assert.equal(attempt.finishedAt, T1.toISOString());
  assert.equal(A.isChecked(attempt, 'TST-SOC-MOB-002'), false);
  assert.deepEqual(A.summary(attempt), {
    total: 3, correct: 0, incorrect: 1, skipped: 2,
    points: 1, maxPoints: 2, scoredCount: 1, unscoredCount: 0
  });
  assert.throws(() => A.setResponse(attempt, 'TST-SOC-MOB-002', 2), /завершена/);
  assert.throws(() => A.check(attempt, 'TST-SOC-MOB-002'), /завершена/);
});

test('mock: задания и порядок берутся из источника', () => {
  const OLY = setup();
  const attempt = mock(OLY);
  assert.equal(attempt.mode, 'mock');
  assert.equal(attempt.olympiad, 'TST');
  assert.deepEqual(attempt.settings, { sourceId: 'TST-2026-27-DEMO-9-1' });
  assert.deepEqual(attempt.taskIds, ['TST-PHI-HIS-001', 'TST-SOC-MOB-001', 'TST-SOC-FAM-001']);
});

test('mock: ответы меняются до завершения, отдельной проверки нет', () => {
  const OLY = setup();
  const A = OLY.attempt;
  const attempt = mock(OLY);
  A.setResponse(attempt, 'TST-SOC-FAM-001', [2, 1, 3]);
  A.setResponse(attempt, 'TST-SOC-MOB-001', [2]);
  A.setResponse(attempt, 'TST-SOC-MOB-001', [1, 3]);                // вернулся и исправил
  assert.throws(() => A.check(attempt, 'TST-SOC-MOB-001'), /только в тренировке/);
  assert.deepEqual(attempt.results, {});                            // до завершения ничего не оценено
});

test('mock: finish оценивает всё, учитывает критерии позиции источника', () => {
  const OLY = setup();
  const A = OLY.attempt;
  const attempt = mock(OLY);
  A.setResponse(attempt, 'TST-SOC-MOB-001', [1]);
  A.setResponse(attempt, 'TST-SOC-FAM-001', [2, 1, 3]);
  // TST-PHI-HIS-001 без ответа.
  A.finish(attempt, T1);

  const his = A.getResult(attempt, 'TST-PHI-HIS-001');
  assert.deepEqual([his.verdict, his.points, his.scored], ['unanswered', null, false]);
  const mob = A.getResult(attempt, 'TST-SOC-MOB-001');
  assert.deepEqual([mob.verdict, mob.points, mob.maxPoints], ['incorrect', 1, 2]);
  const fam = A.getResult(attempt, 'TST-SOC-FAM-001');
  // У задания scoring: null, но позиция источника задаёт критерии варианта.
  assert.deepEqual([fam.verdict, fam.points, fam.maxPoints], ['correct', 3, 3]);

  assert.deepEqual(A.summary(attempt), {
    total: 3, correct: 1, incorrect: 1, skipped: 1,
    points: 4, maxPoints: 5, scoredCount: 2, unscoredCount: 1
  });
  assert.throws(() => A.setResponse(attempt, 'TST-PHI-HIS-001', 'эсхатология'), /завершена/);
  const before = JSON.stringify(attempt);
  A.finish(attempt, new Date('2027-01-01T00:00:00Z'));                // повторный вызов ничего не меняет
  assert.equal(JSON.stringify(attempt), before);
});

test('mock: неполный ответ на matching оценивается, пустые позиции — ошибки', () => {
  const OLY = setup();
  const A = OLY.attempt;
  const attempt = mock(OLY);
  A.setResponse(attempt, 'TST-SOC-FAM-001', [2, null, null]);
  A.finish(attempt);
  const fam = A.getResult(attempt, 'TST-SOC-FAM-001');
  assert.equal(fam.verdict, 'incorrect');
  assert.equal(fam.details.mistakes, 2);
  assert.equal(fam.points, 0);
});

test('попытка сериализуется в JSON без потерь; результат хранит версию задания', () => {
  const OLY = setup();
  const A = OLY.attempt;
  const attempt = practice(OLY);
  A.setResponse(attempt, 'TST-SOC-MOB-001', [1, 3], T0);
  A.check(attempt, 'TST-SOC-MOB-001', T1);
  const restored = JSON.parse(JSON.stringify(attempt));
  assert.deepEqual(restored, attempt);
  assert.deepEqual(A.snapshot(attempt), attempt);
  assert.notEqual(A.snapshot(attempt), attempt);
  assert.equal(restored.schemaVersion, 1);
  assert.equal(restored.kind, 'olympiad');
  assert.equal(restored.results['TST-SOC-MOB-001'].taskVersion, 1);
  assert.equal(restored.results['TST-SOC-MOB-001'].checkedAt, T1.toISOString());
  // Восстановленную попытку можно продолжить.
  A.setResponse(restored, 'TST-SOC-MOB-002', 2);
  assert.equal(A.check(restored, 'TST-SOC-MOB-002').verdict, 'correct');
});

test('изменение ответа снаружи не портит попытку', () => {
  const OLY = setup();
  const A = OLY.attempt;
  const attempt = practice(OLY);
  const draft = [1];
  A.setResponse(attempt, 'TST-SOC-MOB-001', draft);
  draft.push(3);
  assert.deepEqual(A.getResponse(attempt, 'TST-SOC-MOB-001'), [1]);
  A.getResponse(attempt, 'TST-SOC-MOB-001').push(4);
  assert.deepEqual(A.getResponse(attempt, 'TST-SOC-MOB-001'), [1]);
});
