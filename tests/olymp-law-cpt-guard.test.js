'use strict';

/**
 * Защитные тесты практикума «Что такое право?» (LAW-CPT).
 *
 * Фиксируют поведение, которое не должно измениться при разработке новых
 * механик олимпиадного практикума: состав и ключи 24 заданий, проверку
 * ответов (только «верно» / «неверно», без баллов), правила попыток трека PR,
 * восстановление сохранённых попыток и порядок подключения скриптов.
 *
 * Эталоны — tests/fixtures/law-cpt-*.json и olympiad-scripts-baseline.json,
 * сняты с кода до начала разработки. Если тест упал — новая механика задела
 * LAW-CPT; эталон обновляется только по осознанному решению.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBank, pageScripts } = require('./helpers/olymp.js');

const snapshot = require('./fixtures/law-cpt-snapshot.json');
const attempts = require('./fixtures/law-cpt-attempts.json');
const baselineScripts = require('./fixtures/olympiad-scripts-baseline.json');

const OLY = loadBank();
const lawCpt = () => OLY.tasks.filter((t) => t.topic === 'LAW-CPT');

function describe(t) {
  return {
    id: t.id, olympiad: t.olympiad, topic: t.topic, block: t.block, order: t.order, level: t.level,
    type: t.type, version: t.version || 1, scoring: t.scoring,
    optionCount: Array.isArray(t.options) ? t.options.length : null,
    itemCount: Array.isArray(t.items) ? t.items.length : null,
    correct: OLY.types.get(t.type).getCorrect(t),
    hasTypicalMistake: !!t.typicalMistake
  };
}

test('LAW-CPT: 24 задания, порядок, типы, уровни и ключи совпадают с эталоном', () => {
  const current = lawCpt().map(describe);
  assert.equal(current.length, 24);
  assert.deepEqual(current, snapshot);
});

test('LAW-CPT: проверка даёт только «верно» / «неверно», баллы не начисляются', () => {
  for (const task of lawCpt()) {
    const type = OLY.types.get(task.type);
    const right = OLY.grade.gradeTask(task, type.getCorrect(task));
    assert.equal(right.verdict, 'correct', task.id);
    assert.equal(right.points, null, task.id);
    assert.equal(right.scored, false, task.id);

    const correct = type.getCorrect(task);
    let wrong;
    if (task.type === 'single-select') wrong = correct === 1 ? 2 : 1;
    else if (task.type === 'multiple-select') wrong = correct.length > 1 ? [correct[0]] : [correct[0] === 1 ? 2 : 1];
    else wrong = correct.map((x, i) => (i === 0 ? (x === 1 ? 2 : 1) : x));
    const result = OLY.grade.gradeTask(task, wrong);
    assert.equal(result.verdict, 'incorrect', task.id);
  }
});

test('Трек PR: правила попыток не изменились — одна попытка, сохранение в браузере', () => {
  assert.deepEqual(OLY.getAttemptPolicy('PR'), {
    allowRetake: false, allowRetryMistakes: false, allowRetrySkipped: false, persistAttempts: true
  });
});

test('LAW-CPT: сохранённые попытки (начатая и завершённая) восстанавливаются без потерь', () => {
  const scope = { olympiad: 'PR', subject: 'social', discipline: 'LAW', topic: 'LAW-CPT' };
  for (const key of ['inProgress', 'finished']) {
    const restored = OLY.ui.progress.restore(attempts[key], scope);
    assert.ok(restored, key);
    assert.deepEqual(restored, attempts[key], key);
  }
  const done = OLY.ui.progress.restore(attempts.finished, scope);
  assert.equal(OLY.ui.progress.topicState(done), 'completed');
  const draft = OLY.ui.progress.restore(attempts.inProgress, scope);
  assert.equal(OLY.ui.progress.topicState(draft), 'in-progress');
});

test('LAW-CPT: итоги завершённой попытки прежние', () => {
  const o = OLY.ui.session.outcome(attempts.finished);
  assert.equal(o.total, 24);
  assert.equal(o.correct, 13);
  assert.equal(o.incorrect, 7);
  assert.equal(o.skipped, 4);
  assert.equal(o.showPoints, false);
  const s = OLY.attempt.summary(attempts.finished);
  assert.equal(s.scoredCount, 0);
  assert.equal(s.unscoredCount, 20);
});

test('LAW-CPT: состояния заданий в полосе номеров — только прежние значения', () => {
  const allowed = ['correct', 'incorrect', 'draft', 'empty'];
  for (const key of ['inProgress', 'finished']) {
    for (const item of OLY.ui.session.navItems(attempts[key])) {
      assert.ok(allowed.includes(item.state), `${key}: ${item.taskId} → ${item.state}`);
    }
  }
});

test('olympiad.html: прежние скрипты подключены в прежнем относительном порядке', () => {
  const current = pageScripts();
  let last = -1;
  for (const src of baselineScripts) {
    const at = current.indexOf(src);
    assert.ok(at !== -1, `Скрипт ${src} больше не подключён`);
    assert.ok(at > last, `Скрипт ${src} подключён не в прежнем порядке`);
    last = at;
  }
});
