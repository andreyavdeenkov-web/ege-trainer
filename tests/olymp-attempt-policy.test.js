'use strict';

/**
 * Правила повторного прохождения (attemptPolicy) и сохранение попыток
 * (OLY.ui.progress). Практикум: одна попытка на тему, попытка сохраняется
 * и после завершения доступна только для просмотра. «Высшая проба»: прежнее
 * поведение — попытка в памяти страницы, повторы разрешены.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBank, loadCore, defineCatalog } = require('./helpers/olymp.js');

const PR_SCOPE = { olympiad: 'PR', subject: 'social', discipline: 'LAW', topic: 'LAW-CPT' };
const HP_SCOPE = { olympiad: 'HP', subject: 'social', discipline: 'POL', topic: 'POL-POW' };

/** Хранилище как localStorage: значения проходят через JSON, как в браузере. */
function memoryBackend() {
  const data = {};
  return {
    data,
    read: (key) => (key in data ? JSON.parse(data[key]) : null),
    write: (key, value) => { data[key] = JSON.stringify(value); }
  };
}

/** Тренировка по всей теме практикума в учебном порядке, как её начинает интерфейс. */
function startPracticum(OLY) {
  const tasks = OLY.ui.session.arrange('PR', OLY.ui.filters.buildPool(PR_SCOPE, {}));
  return OLY.attempt.createAttempt({
    mode: 'practice', olympiad: 'PR', subject: 'social',
    settings: { discipline: 'LAW', topic: 'LAW-CPT', filters: {} },
    taskIds: tasks.map((t) => t.id)
  });
}

/** Отвечает на каждое задание: на чётные — правильно, на нечётные — неверно. */
function answerAll(OLY, attempt) {
  const A = OLY.attempt;
  const answers = {};
  attempt.taskIds.forEach((id, i) => {
    const task = OLY.getTask(id);
    const type = OLY.types.get(task.type);
    const correct = type.getCorrect(task);
    let value;
    if (i % 2 === 0) value = correct;
    else if (task.type === 'single-select') value = correct === 1 ? 2 : 1;
    else if (task.type === 'multiple-select') value = [1, 2, 3, 4, 5, 6].slice(0, task.options.length).filter((n) => !correct.includes(n));
    else value = correct.map((n) => (n === 1 ? 2 : 1));
    A.setResponse(attempt, id, value);
    A.check(attempt, id);
    answers[id] = A.getResult(attempt, id).response;
  });
  return answers;
}

/* ---------- Настройка трека ---------- */

test('attemptPolicy: у практикума повторы выключены и попытки сохраняются, у «Высшей пробы» — прежние значения', () => {
  const OLY = loadBank();
  assert.deepEqual(OLY.getAttemptPolicy('PR'),
    { allowRetake: false, allowRetryMistakes: false, allowRetrySkipped: false, persistAttempts: true });
  assert.deepEqual(OLY.getAttemptPolicy('HP'), OLY.ATTEMPT_POLICY_DEFAULTS);
  assert.deepEqual(OLY.ATTEMPT_POLICY_DEFAULTS,
    { allowRetake: true, allowRetryMistakes: true, allowRetrySkipped: true, persistAttempts: false });
  assert.equal(OLY.getOlympiad('HP').attemptPolicy, undefined);
});

test('attemptPolicy проверяется: только известные настройки и только true/false', () => {
  const define = (attemptPolicy) => {
    const OLY = loadCore();
    defineCatalog(OLY);
    OLY.defineOlympiad({ id: 'TPR', kind: 'practicum', title: 'x', subjects: ['social'], attemptPolicy });
    return OLY;
  };
  assert.throws(() => define({ allowRetake: 'no' }), /allowRetake должно быть true или false/);
  assert.throws(() => define({ allowReset: false }), /неизвестная настройка allowReset/);
  assert.throws(() => define([]), /attemptPolicy должно быть объектом/);
  // Неуказанные настройки берутся по умолчанию — повторы включаются обратно одной строкой.
  const OLY = define({ allowRetake: true });
  assert.deepEqual(OLY.getAttemptPolicy('TPR'),
    { allowRetake: true, allowRetryMistakes: true, allowRetrySkipped: true, persistAttempts: false });
});

/* ---------- Практикум: одна попытка на тему ---------- */

test('завершённый практикум нельзя начать заново; начатый — тоже (только продолжить)', () => {
  const OLY = loadBank();
  const P = OLY.ui.progress;
  const policy = OLY.getAttemptPolicy('PR');
  const attempt = startPracticum(OLY);
  assert.equal(P.topicState(null), 'new');
  assert.equal(P.canStartNew(policy, null), true);
  assert.equal(P.topicState(attempt), 'in-progress');
  assert.equal(P.canStartNew(policy, attempt), false);
  answerAll(OLY, attempt);
  OLY.attempt.finish(attempt);
  assert.equal(P.topicState(attempt), 'completed');
  assert.equal(P.canStartNew(policy, attempt), false);
  // Тренировка всегда по всей теме: фильтр сложности не может «закрыть» часть заданий.
  assert.equal(P.wholeTopicOnly(policy), true);
  assert.equal(attempt.taskIds.length, 24);
});

test('«Повторить ошибки» и «Решить пропущенные» в практикуме недоступны', () => {
  const OLY = loadBank();
  const P = OLY.ui.progress;
  const policy = OLY.getAttemptPolicy('PR');
  assert.equal(P.canRetry(policy, 'mistakes'), false);
  assert.equal(P.canRetry(policy, 'skipped'), false);
  assert.equal(P.canRetry(policy, 'other'), false);
});

test('ответы завершённой попытки нельзя изменить — и после восстановления из хранилища', () => {
  const OLY = loadBank();
  const A = OLY.attempt;
  const store = OLY.ui.progress.createStore(memoryBackend());
  const attempt = startPracticum(OLY);
  const answers = answerAll(OLY, attempt);
  A.finish(attempt);
  store.save(PR_SCOPE, attempt);

  const restored = store.load(PR_SCOPE);
  const id = restored.taskIds[0];
  assert.equal(A.canEdit(restored, id), false);
  assert.throws(() => A.setResponse(restored, id, 1), /уже завершена/);
  assert.throws(() => A.check(restored, id), /уже завершена/);
  assert.equal(A.finish(restored).finishedAt, attempt.finishedAt, 'повторное завершение ничего не меняет');
  assert.deepEqual(A.getResult(restored, id).response, answers[id]);
});

test('после «перезагрузки» результаты завершённой темы открываются снова и совпадают с исходными', () => {
  const OLY = loadBank();
  const backend = memoryBackend();
  const attempt = startPracticum(OLY);
  answerAll(OLY, attempt);
  OLY.attempt.finish(attempt);
  OLY.ui.progress.createStore(backend).save(PR_SCOPE, attempt);

  // Новая страница: новый экземпляр банка и хранилища поверх тех же данных браузера.
  const OLY2 = loadBank();
  const P2 = OLY2.ui.progress;
  const store2 = P2.createStore(backend);
  const restored = store2.load(PR_SCOPE);
  assert.ok(restored, 'попытка восстановлена');
  assert.equal(P2.topicState(restored), 'completed');
  assert.equal(P2.canStartNew(OLY2.getAttemptPolicy('PR'), restored), false);
  assert.deepEqual(restored, OLY.attempt.snapshot(attempt));
  assert.deepEqual(OLY2.ui.session.outcome(restored), OLY.ui.session.outcome(attempt));
  assert.equal(OLY2.ui.session.outcome(restored).total, 24);
  // Открыть повторно — снова те же результаты.
  assert.deepEqual(store2.load(PR_SCOPE), restored);
});

test('начатая тема тоже восстанавливается: проверенные ответы зафиксированы, непроверенные можно продолжить', () => {
  const OLY = loadBank();
  const A = OLY.attempt;
  const backend = memoryBackend();
  const store = OLY.ui.progress.createStore(backend);
  const attempt = startPracticum(OLY);
  const [first, second] = attempt.taskIds;
  A.setResponse(attempt, first, OLY.types.get(OLY.getTask(first).type).getCorrect(OLY.getTask(first)));
  A.check(attempt, first);
  store.save(PR_SCOPE, attempt);

  const restored = OLY.ui.progress.createStore(backend).load(PR_SCOPE);
  assert.equal(OLY.ui.progress.topicState(restored), 'in-progress');
  assert.equal(OLY.ui.progress.canStartNew(OLY.getAttemptPolicy('PR'), restored), false);
  assert.throws(() => A.setResponse(restored, first, 1), /уже засчитан/);
  assert.equal(A.canEdit(restored, second), true);
  assert.equal(OLY.ui.session.nextUnchecked(restored, restored.taskIds.length - 1), 1);
});

test('review завершённой попытки: исходные ответы, правильные ответы, объяснения, разбор и типичные ошибки', () => {
  const OLY = loadBank();
  const backend = memoryBackend();
  const attempt = startPracticum(OLY);
  const answers = answerAll(OLY, attempt);
  OLY.attempt.finish(attempt);
  OLY.ui.progress.createStore(backend).save(PR_SCOPE, attempt);
  const restored = OLY.ui.progress.createStore(backend).load(PR_SCOPE);
  const S = OLY.ui.session;

  assert.deepEqual(S.subsetIds(restored, 'all'), restored.taskIds, 'в разборе все 24 задания');
  for (const id of restored.taskIds) {
    const task = OLY.getTask(id);
    const type = OLY.types.get(task.type);
    const result = OLY.attempt.getResult(restored, id);
    assert.deepEqual(result.response, answers[id], `${id}: исходный ответ`);
    assert.deepEqual(result.correct, type.getCorrect(task), `${id}: правильный ответ`);
    assert.notEqual(type.formatResponse(task, result.response), '—', `${id}: ответ показывается в разборе`);
    assert.ok(OLY.ui.views.has(task.type), `${id}: есть отрисовка разбора`);
    assert.ok(task.explanation, `${id}: общий разбор`);
    for (const part of task.items || task.options) assert.ok(part.explanation, `${id}: объяснение варианта или позиции`);
    if (result.verdict === 'incorrect' && task.level >= 2) assert.ok(task.typicalMistake, `${id}: типичная ошибка`);
  }
  const o = S.outcome(restored);
  assert.equal(o.correct + o.incorrect, 24);
  assert.ok(o.incorrect > 0 && o.correct > 0);
});

test('хранилище: попытки разных тем раздельно; чужие и повреждённые снимки не восстанавливаются', () => {
  const OLY = loadBank();
  const P = OLY.ui.progress;
  const backend = memoryBackend();
  const store = P.createStore(backend);
  assert.equal(store.load(PR_SCOPE), null);
  const attempt = startPracticum(OLY);
  store.save(PR_SCOPE, attempt);
  assert.deepEqual(Object.keys(backend.data), [P.STORAGE_KEY]);
  assert.deepEqual(Object.keys(JSON.parse(backend.data[P.STORAGE_KEY])), ['PR/LAW/LAW-CPT']);
  assert.equal(store.load({ ...PR_SCOPE, topic: 'LAW-FAM' }), null);

  const snap = OLY.attempt.snapshot(attempt);
  assert.equal(P.restore({ ...snap, schemaVersion: 99 }, PR_SCOPE), null);
  assert.equal(P.restore({ ...snap, olympiad: 'HP' }, PR_SCOPE), null);
  assert.equal(P.restore({ ...snap, taskIds: 'x' }, PR_SCOPE), null);
  assert.equal(P.restore('мусор', PR_SCOPE), null);
  // Задание, которого больше нет в банке, убирается вместе с ответом.
  const withGhost = { ...snap, taskIds: [...snap.taskIds, 'PR-LAW-CPT-999'], responses: { 'PR-LAW-CPT-999': { value: 1 } } };
  const restored = P.restore(withGhost, PR_SCOPE);
  assert.equal(restored.taskIds.length, 24);
  assert.deepEqual(restored.responses, {});
  // Недоступный localStorage (read → null) не ломает загрузку.
  assert.equal(P.createStore({ read: () => null, write: () => {} }).load(PR_SCOPE), null);
});

/* ---------- «Высшая проба» без изменений ---------- */

test('«Высшая проба»: повторы разрешены, попытки не сохраняются, фильтры и выход с подтверждением — как раньше', () => {
  const OLY = loadBank();
  const P = OLY.ui.progress;
  const policy = OLY.getAttemptPolicy('HP');
  const A = OLY.attempt;
  const attempt = A.createAttempt({
    mode: 'practice', olympiad: 'HP', subject: 'social',
    settings: { discipline: 'POL', topic: 'POL-POW', filters: {} },
    taskIds: OLY.ui.filters.buildPool(HP_SCOPE, {}).map((t) => t.id)
  });
  A.finish(attempt);
  assert.equal(P.canStartNew(policy, attempt), true, 'тему можно пройти заново');
  assert.equal(P.canRetry(policy, 'mistakes'), true);
  assert.equal(P.canRetry(policy, 'skipped'), true);
  assert.equal(policy.persistAttempts, false, 'попытки только в памяти страницы');
  assert.equal(P.leavesFreely(policy), false, 'выход из тренировки — с подтверждением');
  assert.equal(P.wholeTopicOnly(policy), false, 'фильтры и выбор количества на месте');
  assert.deepEqual(OLY.ui.filters.describe(HP_SCOPE, {}).map((g) => g.key), ['class', 'round', 'type']);
  // Порядок по-прежнему случайный, а не учебный.
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ids = attempt.taskIds;
  assert.notDeepEqual(OLY.ui.session.arrangeIds('HP', ids, random), ids);
});
