'use strict';

/**
 * Один практикум — одна попытка (js/attempt-save.js): результат практикума хранится
 * отдельной записью с копиями заданий, не пересчитывается, не устаревает и не
 * перезаписывается; незавершённая попытка практикума не устаревает, а запись, в которой
 * даны все ответы, принимается как завершённая. Страницы предпросмотра — как раньше.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, scripts } = require('./helpers/ege.js');

const LEGACY = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/legacy-attempts.json'), 'utf8')).records;

/** Всё, что подключает index.html, кроме интерфейса. */
function loadMain() {
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of scripts.filter((s) => s !== 'js/app.js' && s !== 'js/task-view.js')) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); }
  };
}

/** Хранилище, в которое ничего не записывается (переполнено). */
function fullStorage(initial = {}) {
  const s = memoryStorage(initial);
  s.setItem = () => { throw new Error('QuotaExceededError'); };
  return s;
}

const EGE = loadMain();
const S = EGE.attemptSave;
const A = EGE.attempt;
const plain = (x) => JSON.parse(JSON.stringify(x));

/** Как в js/app.js: настройки, область и проверка сохранения практикума. */
const settingsOf = (p) => ({ section: p.section, topic: p.topic, practicum: p.id });
const scopeOf = (p) => S.scopeId('ege', settingsOf(p));
const depsOf = (p, now) => ({
  getTask: EGE.getTask, attempt: A, scoring: EGE.scoring, now,
  taskIds: p.taskIds, anyOrder: !!p.shuffle, expires: false, allowComplete: true
});
const key = (task) => Array.from(EGE.scoring.getCorrect(task));

const COG = EGE.getPracticum('OBS-COG-P01');
const ACT = EGE.getPracticum('OBS-ACT-P01');

/** Попытка практикума: n ответов; первый — с ошибкой (если wrongFirst). */
function attemptOf(p, n, wrongFirst) {
  const attempt = A.createAttempt({ settings: settingsOf(p), taskIds: p.taskIds, now: new Date('2026-10-01T09:00:00Z') });
  attempt.taskIds.slice(0, n).forEach((id, i) => {
    const task = EGE.getTask(id);
    let sel = key(task);
    if (wrongFirst && i === 0) {
      if (EGE.scoring.getTaskType(task) === 'matching') sel[0] = sel[0] === 1 ? 2 : 1;
      else sel = [sel[0], [1, 2, 3, 4, 5, 6].find((x) => !sel.includes(x))];
    }
    A.recordAnswer(attempt, task, sel, new Date(Date.UTC(2026, 9, 1, 9, 1 + i)));
  });
  return attempt;
}

function finishedResult(p, wrongFirst) {
  const attempt = attemptOf(p, p.taskIds.length, wrongFirst);
  A.finishAttempt(attempt, new Date('2026-10-01T10:00:00Z'));
  return S.buildResult({ scope: scopeOf(p), attempt, getTask: EGE.getTask, now: new Date('2026-10-01T10:00:00Z') });
}

/* ---------- Запись и чтение результата ---------- */

test('результат: ответы, баллы, время и копии всех заданий; читается после «перезагрузки»', () => {
  const storage = memoryStorage();
  const record = finishedResult(COG, true);
  assert.equal(S.writeResult(storage, record), 'saved');
  assert.ok(storage.data.has(S.resultKey(scopeOf(COG))));
  assert.ok(!storage.data.has(S.storageKey(scopeOf(COG))), 'результат — отдельный ключ');

  const loaded = S.loadResult(storage, scopeOf(COG));
  assert.equal(loaded.status, 'ok');
  const r = loaded.result;
  assert.equal(r.attempt.finishedAt, '2026-10-01T10:00:00.000Z');
  assert.equal(r.attempt.answers.length, COG.taskIds.length);
  assert.equal(A.totalScore(r.attempt), A.totalScore(record.attempt));
  assert.ok(A.totalScore(r.attempt) < EGE.getPracticumMaxScore(COG), 'ошибка в первом задании сохранена');
  for (const id of COG.taskIds) {
    assert.deepEqual(plain(r.tasks[id].task), plain(EGE.getTask(id)), `${id}: копия задания целиком`);
    assert.equal(r.tasks[id].fingerprint, S.taskFingerprint(EGE.getTask(id)));
  }
});

test('записанный результат не перезаписывается: другая попытка, вторая вкладка, повторное завершение', () => {
  const storage = memoryStorage();
  const first = finishedResult(COG, true);
  assert.equal(S.writeResult(storage, first), 'saved');
  const second = finishedResult(COG, false);
  assert.equal(S.writeResult(storage, second), 'exists');
  assert.equal(S.writeResult(storage, first), 'exists');
  assert.equal(S.loadResult(storage, scopeOf(COG)).result.attempt.id, first.attempt.id);
});

test('при результате незавершённая запись той же области не пишется (вкладка с начатой попыткой)', () => {
  const storage = memoryStorage();
  S.writeResult(storage, finishedResult(COG, false));
  const attempt = attemptOf(COG, 3);
  const record = S.buildRecord({ scope: scopeOf(COG), attempt, viewIndex: 3, draft: null, getTask: EGE.getTask });
  assert.equal(S.write(storage, record, { force: true }), false);
  assert.equal(S.write(storage, record), false);
  assert.ok(!storage.data.has(S.storageKey(scopeOf(COG))));
  // Другой практикум пишется как обычно.
  const other = attemptOf(ACT, 2);
  assert.equal(S.write(storage, S.buildRecord({ scope: scopeOf(ACT), attempt: other, viewIndex: 2, draft: null, getTask: EGE.getTask }), { force: true }), true);
});

test('хранилище недоступно или переполнено: результат не записан — failed, без исключений', () => {
  assert.equal(S.writeResult(null, finishedResult(COG)), 'failed');
  const full = fullStorage();
  assert.equal(S.writeResult(full, finishedResult(COG)), 'failed');
  assert.equal(S.loadResult(full, scopeOf(COG)).status, 'none');
  assert.equal(S.loadResult(null, scopeOf(COG)).status, 'none');
  const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() {} };
  assert.equal(S.writeResult(broken, finishedResult(COG)), 'failed');
  assert.equal(S.loadResult(broken, scopeOf(COG)).status, 'none');
  assert.equal(S.hasResult(broken, scopeOf(COG)), false);
});

test('повреждённая запись результата не удаляется и не открывает новую попытку', () => {
  const scope = scopeOf(COG);
  const good = finishedResult(COG);
  const cases = [
    'не JSON',
    JSON.stringify(null),
    JSON.stringify(Object.assign({}, good, { format: 'другое' })),
    JSON.stringify(Object.assign({}, good, { scope: scopeOf(ACT) })),
    JSON.stringify(Object.assign({}, good, { attempt: Object.assign({}, good.attempt, { finishedAt: null }) })),
    JSON.stringify(Object.assign({}, good, { attempt: Object.assign({}, good.attempt, { answers: good.attempt.answers.slice(1) }) })),
    JSON.stringify(Object.assign({}, good, { tasks: {} }))
  ];
  for (const raw of cases) {
    const storage = memoryStorage({ [S.resultKey(scope)]: raw });
    assert.equal(S.loadResult(storage, scope).status, 'corrupt', raw.slice(0, 40));
    assert.equal(storage.getItem(S.resultKey(scope)), raw, 'запись осталась');
    assert.equal(S.hasResult(storage, scope), true);
    assert.equal(S.writeResult(storage, good), 'exists', 'поверх неё результат не пишется');
  }
});

test('незавершённая запись не пишется и поверх повреждённого результата', () => {
  const scope = scopeOf(COG);
  const storage = memoryStorage({ [S.resultKey(scope)]: 'не JSON' });
  const attempt = attemptOf(COG, 2);
  assert.equal(S.write(storage, S.buildRecord({ scope, attempt, viewIndex: 2, draft: null, getTask: EGE.getTask }), { force: true }), false);
});

/* ---------- Разбор: копия задания и исправления объяснений ---------- */

test('разбор: без изменений и после правки объяснения — текущее задание, после правки условия — копия', () => {
  const record = finishedResult(COG, true);
  const id = COG.taskIds[0];
  const original = EGE.getTask(id);
  assert.equal(S.reviewTask(record, id, EGE.getTask), original);

  // Исправлено объяснение (фактическая ошибка): ответы и ключ те же — показывается исправленный текст.
  const fixed = plain(original);
  fixed.statements[0].explanation = 'Верно. Исправленное объяснение с теоретической причиной.';
  const withFix = (x) => (x === id ? fixed : EGE.getTask(x));
  assert.equal(S.reviewTask(record, id, withFix), fixed);

  // Изменились формулировка или ключ — показывается то, что видел ученик.
  const changed = plain(original);
  changed.statements[0].text += ' (новая редакция)';
  const withChange = (x) => (x === id ? changed : EGE.getTask(x));
  assert.deepEqual(plain(S.reviewTask(record, id, withChange)), plain(original));
  const rekeyed = plain(original);
  rekeyed.statements.forEach((s) => { s.correct = !s.correct; });
  assert.deepEqual(plain(S.reviewTask(record, id, (x) => (x === id ? rekeyed : EGE.getTask(x)))), plain(original));

  // Задание удалено из банка — копия.
  assert.deepEqual(plain(S.reviewTask(record, id, () => null)), plain(original));
});

test('баллы результата не пересчитываются: зафиксированы на момент прохождения', () => {
  // Результат, записанный при прежних правилах: за первое задание засчитан 1 балл,
  // хотя текущее оценивание дало бы другой. Читается как записан, без пересчёта.
  const record = plain(finishedResult(COG, true));
  const first = record.attempt.answers[0];
  const now = first.points;
  first.points = now === 1 ? 0 : 1;
  const storage = memoryStorage({ [S.resultKey(scopeOf(COG))]: JSON.stringify(record) });
  const loaded = S.loadResult(storage, scopeOf(COG));
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.result.attempt.answers[0].points, first.points);
  assert.notEqual(loaded.result.attempt.answers[0].points, now);
});

/* ---------- Незавершённая попытка практикума ---------- */

test('практикум: незавершённая попытка не устаревает (expires: false), предпросмотр — как раньше (30 дней)', () => {
  const storage = memoryStorage();
  const attempt = attemptOf(COG, 4);
  const record = S.buildRecord({ scope: scopeOf(COG), attempt, viewIndex: 4, draft: null, getTask: EGE.getTask, now: new Date('2026-01-01T00:00:00Z') });
  S.write(storage, record, { force: true });
  const later = new Date('2026-06-01T00:00:00Z');
  const ok = S.load(storage, scopeOf(COG), depsOf(COG, later));
  assert.equal(ok.status, 'ok');
  assert.equal(ok.state.complete, false);
  assert.equal(ok.state.attempt.answers.length, 4);
  const old = S.load(storage, scopeOf(COG), Object.assign(depsOf(COG, later), { expires: undefined }));
  assert.equal(old.status, 'invalid');
  assert.equal(old.reason, 'expired');
});

test('все ответы даны, итоги не открыты (вкладку закрыли): запись принимается как завершённая', () => {
  const storage = memoryStorage();
  const attempt = attemptOf(COG, COG.taskIds.length, true);
  S.write(storage, S.buildRecord({ scope: scopeOf(COG), attempt, viewIndex: COG.taskIds.length - 1, draft: null, getTask: EGE.getTask }), { force: true });
  const loaded = S.load(storage, scopeOf(COG), depsOf(COG));
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.state.complete, true);
  assert.equal(loaded.state.draft, null);
  assert.equal(loaded.state.attempt.answers.length, COG.taskIds.length);
  // Без allowComplete (страницы предпросмотра, прежнее поведение) — запись повреждена.
  const strict = Object.assign(depsOf(COG), { allowComplete: undefined });
  assert.equal(S.restore(JSON.parse(storage.getItem(S.storageKey(scopeOf(COG)))), scopeOf(COG), strict).reason, 'corrupt');
});

test('фиксация из такой записи: сначала результат, затем удаление незавершённой (как в js/app.js)', () => {
  const storage = memoryStorage();
  const attempt = attemptOf(COG, COG.taskIds.length);
  S.write(storage, S.buildRecord({ scope: scopeOf(COG), attempt, viewIndex: 0, draft: null, getTask: EGE.getTask }), { force: true });
  const st = S.load(storage, scopeOf(COG), depsOf(COG)).state;
  A.finishAttempt(st.attempt);
  assert.equal(S.writeResult(storage, S.buildResult({ scope: scopeOf(COG), attempt: st.attempt, getTask: EGE.getTask })), 'saved');
  S.remove(storage, scopeOf(COG));
  assert.deepEqual([...storage.data.keys()], [S.resultKey(scopeOf(COG))]);

  // При переполненном хранилище незавершённая запись со всеми ответами остаётся источником.
  const full = fullStorage(Object.fromEntries(memoryStorage().data));
  const rec = S.buildRecord({ scope: scopeOf(ACT), attempt: attemptOf(ACT, ACT.taskIds.length), viewIndex: 0, draft: null, getTask: EGE.getTask });
  full.data.set(S.storageKey(scopeOf(ACT)), JSON.stringify(rec));
  const st2 = S.load(full, scopeOf(ACT), depsOf(ACT)).state;
  A.finishAttempt(st2.attempt);
  assert.equal(S.writeResult(full, S.buildResult({ scope: scopeOf(ACT), attempt: st2.attempt, getTask: EGE.getTask })), 'failed');
  assert.ok(full.data.has(S.storageKey(scopeOf(ACT))), 'незавершённая запись не удалена');
  assert.equal(S.load(full, scopeOf(ACT), depsOf(ACT)).state.complete, true, 'при следующем открытии фиксация повторится');
});

test('buildResult требует завершённую попытку и все задания', () => {
  const attempt = attemptOf(COG, COG.taskIds.length);
  assert.throws(() => S.buildResult({ scope: scopeOf(COG), attempt, getTask: EGE.getTask }), /не завершена/);
  A.finishAttempt(attempt);
  assert.throws(() => S.buildResult({ scope: scopeOf(COG), attempt, getTask: () => null }), /Нет задания/);
});

/* ---------- Совместимость с сохранёнными попытками ---------- */

test('незавершённые попытки, сохранённые прежней версией, продолжаются по новым правилам', () => {
  // Записи tests/fixtures/legacy-attempts.json сделаны кодом до практикумов; после переноса
  // в практикум (как в migrateLegacyAttempts) они читаются с expires: false и allowComplete.
  const actLegacy = LEGACY['ege/OBS/OBS-ACT'];
  assert.ok(actLegacy, 'в фикстуре есть попытка темы «Деятельность»');
  const storage = memoryStorage({ [S.storageKey(actLegacy.scope)]: JSON.stringify(actLegacy) });
  const res = S.migrate(storage, { from: 'ege/OBS/OBS-ACT', to: scopeOf(ACT), settings: { practicum: ACT.id }, deps: depsOf(ACT, new Date('2030-01-01T00:00:00Z')) });
  assert.equal(res.status, 'migrated');
  const st = S.load(storage, scopeOf(ACT), depsOf(ACT, new Date('2030-01-01T00:00:00Z')));
  assert.equal(st.status, 'ok', 'старше 30 дней — всё равно продолжается');
  assert.equal(st.state.complete, false);
});
