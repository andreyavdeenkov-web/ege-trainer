'use strict';

/** Олимпиады: критерии оценивания и gradeTask. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, defineCatalog, sampleTasks, taskWith, registerTestRules, officialScoring } = require('./helpers/olymp.js');

const [multiple, , shortText, , matching] = sampleTasks();

function setup() {
  const OLY = loadCore();
  registerTestRules(OLY);
  return OLY;
}

test('в ядре нет ни одного правила оценивания: их даёт только источник', () => {
  const OLY = loadCore();
  assert.deepEqual(OLY.scoringRules.list(), []);
});

test('scoring: null — вердикт без баллов', () => {
  const OLY = setup();
  const result = OLY.grade.gradeTask(multiple, [1, 3]);
  assert.equal(result.verdict, 'correct');
  assert.equal(result.points, null);
  assert.equal(result.maxPoints, null);
  assert.equal(result.scored, false);
  assert.deepEqual(result.correct, [1, 3]);
  assert.equal(OLY.grade.gradeTask(shortText, 'апокалиптика').verdict, 'incorrect');
});

test('пустой ответ: unanswered; 0 баллов только если критерии определены', () => {
  const OLY = setup();
  assert.deepEqual(
    [OLY.grade.gradeTask(multiple, []).verdict, OLY.grade.gradeTask(multiple, []).points],
    ['unanswered', null]
  );
  const scored = { ...multiple, scoring: officialScoring('test-all-or-nothing', 2) };
  const result = OLY.grade.gradeTask(scored, null);
  assert.equal(result.verdict, 'unanswered');
  assert.equal(result.points, 0);
  assert.equal(result.maxPoints, 2);
});

test('правило считает баллы; maxPoints не зависит от типа', () => {
  const OLY = setup();
  const twoPoints = { ...multiple, scoring: officialScoring('test-minus-per-mistake', 2, { penalty: 1 }) };
  const fivePoints = { ...multiple, scoring: officialScoring('test-minus-per-mistake', 5, { penalty: 2 }) };
  assert.equal(OLY.grade.gradeTask(twoPoints, [1, 3]).points, 2);
  assert.equal(OLY.grade.gradeTask(twoPoints, [1]).points, 1);
  assert.equal(OLY.grade.gradeTask(twoPoints, [2, 4]).points, 0);   // не ниже нуля
  assert.equal(OLY.grade.gradeTask(fivePoints, [1]).points, 3);
  const allOrNothing = { ...multiple, scoring: officialScoring('test-all-or-nothing', 2) };
  assert.equal(OLY.grade.gradeTask(allOrNothing, [1]).points, 0);
  const matchingScored = { ...matching, scoring: officialScoring('test-minus-per-mistake', 3, { penalty: 1 }) };
  assert.equal(OLY.grade.gradeTask(matchingScored, [1, 2, 3]).points, 1);
});

test('критерии позиции источника заменяют критерии задания', () => {
  const OLY = setup();
  const task = { ...multiple, scoring: officialScoring('test-all-or-nothing', 2) };
  assert.equal(OLY.grade.resolveScoring(task, null), task.scoring);
  assert.equal(OLY.grade.resolveScoring(task, { number: 1, taskId: task.id }), task.scoring);
  const item = { number: 1, taskId: task.id, scoring: officialScoring('test-all-or-nothing', 4) };
  assert.equal(OLY.grade.gradeTask(task, [1, 3], OLY.grade.resolveScoring(task, item)).points, 4);
  // Явный null у позиции: для этого варианта критерии неизвестны.
  const unknown = { number: 1, taskId: task.id, scoring: null };
  assert.equal(OLY.grade.gradeTask(task, [1, 3], OLY.grade.resolveScoring(task, unknown)).points, null);
});

test('validateScoring: полнота критериев и основание', () => {
  const OLY = setup();
  const v = (s, type = 'multiple-select') => OLY.scoringRules.validateScoring(s, type).join('; ');
  assert.equal(v(null), '');
  assert.equal(v(officialScoring('test-all-or-nothing', 2)), '');
  assert.match(v({ maxPoints: 2, rule: 'test-all-or-nothing', basis: 'official' }), /ссылка на документ/);
  assert.equal(v({ maxPoints: 2, rule: 'test-all-or-nothing', basis: 'author' }), '');
  assert.match(v({ maxPoints: 2, rule: 'test-all-or-nothing' }), /basis/);
  assert.match(v(officialScoring('test-all-or-nothing', 0)), /maxPoints/);
  assert.match(v(officialScoring('invented-rule', 2)), /неизвестное правило invented-rule/);
  assert.match(v(officialScoring('test-minus-per-mistake', 2, { penalty: 1 }), 'short-text'), /не применяется к типу short-text/);
  assert.match(v(officialScoring('test-minus-per-mistake', 2)), /penalty должно быть числом/);
  assert.match(v({ ...officialScoring('test-all-or-nothing', 2), points: 2 }), /неизвестное поле points/);
  assert.match(v(2), /объектом или null/);
});

test('задание и источник с неизвестным правилом не регистрируются', () => {
  const OLY = setup();
  defineCatalog(OLY);
  assert.throws(() => OLY.addTasks([taskWith({ scoring: officialScoring('invented-rule', 2) })]), /неизвестное правило/);
  OLY.addTasks([taskWith({ scoring: officialScoring('test-all-or-nothing', 2) })]);
  assert.throws(() => OLY.addSource({
    id: 'TST-2026-27-DEMO-9-1', olympiad: 'TST', subject: 'social', kind: 'demo',
    year: '2026/27', classes: [9], round: 1, title: 'x', answersBasis: 'official',
    items: [{ number: 1, taskId: 'TST-SOC-MOB-001', scoring: { maxPoints: 3 } }]
  }), /позиция 1: scoring/);
});

test('правило: регистрация и некорректный балл', () => {
  const OLY = setup();
  assert.throws(() => OLY.scoringRules.register('test-all-or-nothing', { supports: '*', score: () => 0 }), /уже зарегистрировано/);
  assert.throws(() => OLY.scoringRules.register('x', { supports: [], score: () => 0 }), /supports/);
  OLY.scoringRules.register('broken', { supports: '*', score: () => NaN });
  assert.throws(() => OLY.grade.gradeTask({ ...multiple, scoring: officialScoring('broken', 2) }, [1]), /некорректный балл/);
  OLY.scoringRules.register('too-much', { supports: '*', score: () => 10 });
  assert.equal(OLY.grade.gradeTask({ ...multiple, scoring: officialScoring('too-much', 2) }, [1]).points, 2);
});
