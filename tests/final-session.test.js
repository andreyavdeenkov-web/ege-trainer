'use strict';

/**
 * Итоговый практикум (js/final-session.js): оценивание 0/1/2 по моделям ФИПИ, пропуски,
 * изменение ответов, отсутствие ключей в данных до завершения, сохранение и продолжение,
 * разделение попыток и отделение от тренировочных практикумов, итоги и учебная аналитика.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root } = require('./helpers/ege.js');

function load() {
  const context = vm.createContext({});
  context.globalThis = context;
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])
    .filter((s) => s !== 'js/app.js' && s !== 'js/task-view.js' && s !== 'js/final-practicum.js');
  for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  return context.EGE;
}

const EGE = load();
const F = EGE.finalSession;
const P = EGE.getPracticum('OBS-TYP-F01');
const T = (n) => EGE.getTask('OBS-TYP-' + String(n).padStart(3, '0'));
const plain = (x) => JSON.parse(JSON.stringify(x));
const SCOPE = EGE.attemptSave.scopeId('ege', { section: 'OBS', topic: 'OBS-TYP', practicum: 'OBS-TYP-F01' });

function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); }
  };
}

function session(now) {
  return F.create({
    practicum: P.id, scope: SCOPE, taskIds: P.taskIds, now,
    getTask: EGE.getTask, fingerprint: EGE.attemptSave.taskFingerprint
  });
}

const deps = () => ({ getTask: EGE.getTask, fingerprint: EGE.attemptSave.taskFingerprint, taskIds: P.taskIds, scope: SCOPE });
const pts = (n, sel) => F.grade(T(n), sel).points;

test('MULTI и COND: 2 — полный ответ, 1 — ровно одна ошибка (замена, лишняя, пропуск), 0 — две и более', () => {
  // № 15, ключ 1 3 5.
  assert.equal(pts(15, [1, 3, 5]), 2);
  assert.equal(pts(15, [5, 3, 1]), 2, 'порядок ввода не важен');
  assert.equal(pts(15, [1, 4, 5]), 1, 'одна цифра заменена');
  assert.equal(pts(15, [1, 3]), 1, 'одна пропущена');
  assert.equal(pts(15, [1, 3, 5, 2]), 1, 'одна лишняя');
  assert.equal(pts(15, [1, 4]), 0);
  assert.equal(pts(15, [1]), 0);
  assert.equal(pts(15, [1, 2, 3, 4, 5]), 0, 'все позиции: ключ внутри, но две лишние — не правильный ответ');
  // COND № 24, ключ 2 5.
  assert.equal(pts(24, [2, 5]), 2);
  assert.equal(pts(24, [2, 5, 6]), 1);
  assert.equal(pts(24, [1, 2, 3, 4, 5, 6]), 0);
});

test('EXCL (позиция 1 КИМ) — 1 балл только за обе выпадающие; больше двух позиций выбрать нельзя', () => {
  assert.equal(pts(1, [2, 4]), 1);
  assert.equal(pts(1, [2, 3]), 0);
  assert.equal(pts(1, [2]), 0);
  assert.equal(F.grade(T(1), [2, 4]).maxPoints, 1);
  assert.throws(() => F.normalize(T(1), [2, 4, 5]), /только 2/);
});

test('MATCH (позиция 3 КИМ) — 1 балл только при всех пяти верных; строгий порядок А–Д', () => {
  // № 7, ключ 1 2 1 2 2.
  assert.equal(pts(7, [1, 2, 1, 2, 2]), 1);
  assert.equal(pts(7, [2, 2, 1, 2, 2]), 0, 'одна неверная позиция');
  assert.equal(pts(7, [2, 1, 2, 1, 1]), 0, 'порядок важен');
  assert.equal(pts(7, [1, 2, 1, 2, null]), 0, 'незаполненная позиция — ошибка');
  assert.equal(F.grade(T(7), [1, 2, 1, 2, null]).mistakes, 1);
  assert.throws(() => F.normalize(T(7), [1, 2, 1]), /по числу позиций/);
});

test('пропущенное задание — «без ответа», 0 баллов', () => {
  for (const n of [1, 7, 15, 21]) {
    const g = F.grade(T(n), F.emptyResponse(T(n)));
    assert.equal(g.skipped, true, n);
    assert.equal(g.points, 0, n);
    assert.equal(g.level, 'skipped', n);
  }
});

test('итоговая работа: свободный переход, изменение, очистка и пропуск ответов; ключей и баллов до завершения нет', () => {
  const s = session();
  assert.ok(F.canView(s, 24), 'любое задание в любом порядке');
  assert.ok(F.setView(s, 24));
  assert.equal(F.setView(s, 25), false);
  F.setResponse(s, T(25), [1, 2, 3, 2, 1]);
  F.setResponse(s, T(15), [1, 2]);
  F.setResponse(s, T(15), [1, 3, 5]);          // изменён
  F.setResponse(s, T(16), [1]);
  F.setResponse(s, T(16), []);                 // очищен — снова без ответа
  assert.equal(F.answeredCount(s, EGE.getTask), 2);
  assert.equal(F.unanswered(s, EGE.getTask).length, 23);
  assert.ok(!F.unanswered(s, EGE.getTask).includes(15));
  assert.doesNotMatch(JSON.stringify(s), /points|correct|explanation|maxPoints|scores/,
    'до завершения в данных попытки только выбор ученика');
  F.finish(s, new Date(), EGE.getTask);
  assert.throws(() => F.setResponse(s, T(1), [2, 4]), /завершена/);
  assert.throws(() => F.finish(s), /завершена/);
  const rows = F.results(s, EGE.getTask);
  const a = F.analytics(rows, P.criteria);
  assert.equal(a.total.points, 3);
  assert.equal(a.total.max, 35);
  assert.equal(a.total.full, 2);
  assert.equal(a.total.zero, 23);
  assert.equal(a.total.skipped, 23);
  assert.equal(rows[15].level, 'skipped');
});

test('аналитика: группы по форматам, критериям, уровням и действиям; общий балл без двойного учёта', () => {
  const s = session();
  // Верно: № 1 (EXCL, 1 балл) и № 22 (COND, 2 балла); № 17 (MULTI) — одна ошибка.
  F.setResponse(s, T(1), [2, 4]);
  F.setResponse(s, T(22), [1, 3, 5, 6]);
  F.setResponse(s, T(17), [2, 3]);
  F.finish(s, new Date(), EGE.getTask);
  const a = F.analytics(F.results(s, EGE.getTask), P.criteria);
  assert.equal(a.total.points, 4);
  assert.equal(a.total.full, 2);
  assert.equal(a.total.partial, 1);
  assert.equal(a.total.tasks, 25);
  const g = (list, id) => list.find((x) => x.id === id);
  assert.deepEqual(Array.from(a.byFormat, (x) => x.id), ['EXCL', 'MATCH', 'MULTI', 'COND']);
  assert.deepEqual([g(a.byFormat, 'EXCL').points, g(a.byFormat, 'EXCL').max, g(a.byFormat, 'EXCL').tasks], [1, 6, 6]);
  assert.deepEqual([g(a.byFormat, 'MATCH').max, g(a.byFormat, 'MULTI').max, g(a.byFormat, 'COND').max], [9, 12, 8]);
  assert.equal(a.byFormat.reduce((sum, x) => sum + x.points, 0), a.total.points, 'у задания один формат');
  assert.equal(a.byLevel.reduce((sum, x) => sum + x.max, 0), 35, 'у задания один уровень');
  assert.deepEqual(Array.from(a.byCriterion, (x) => x.id), ['nature', 'factor', 'economy', 'social', 'politics', 'spiritual']);
  for (const c of ['factor', 'economy', 'social', 'spiritual']) assert.ok(g(a.byCriterion, c).points >= 2, c);
  assert.equal(g(a.byCriterion, 'nature').points, 0);
  assert.ok(a.byCriterion.reduce((sum, x) => sum + x.points, 0) > a.total.points, 'группы пересекаются, итог — один раз');
  // Действия: № 12 (узнавание и различение) входит в обе группы.
  assert.deepEqual(Array.from(a.byAction, (x) => x.id), ['recognition', 'understanding', 'distinction']);
  assert.equal(a.byAction.reduce((sum, x) => sum + x.tasks, 0), 26);
  assert.equal(g(a.byAction, 'recognition').tasks, 7);
  assert.equal(g(a.byAction, 'understanding').tasks, 6);
  assert.equal(g(a.byAction, 'distinction').tasks, 13);
});

test('разбор ошибки: лишняя и пропущенная позиции, неверное соответствие', () => {
  const d = F.mistakeDetails(T(15), [1, 2, 3]);
  assert.deepEqual(plain(d.map((x) => [x.number, x.kind])), [[2, 'wrong'], [5, 'missed']]);
  assert.ok(d[0].statement.trap, 'у неверной позиции есть разметка ловушки');
  const m = F.mistakeDetails(T(7), [1, 2, 1, 1, null]);
  assert.deepEqual(plain(m.map((x) => [x.letter, x.chosen, x.expected])), [['Г', 1, 2], ['Д', null, 2]]);
});

test('сохранение: продолжение незавершённой работы; запись отдельно от тренировочных практикумов', () => {
  const st = memoryStorage();
  const s = session();
  F.setResponse(s, T(10), [3, 2, 1, 2, 3]);
  F.setResponse(s, T(1), [2]);
  F.setView(s, 9);
  assert.ok(F.save(st, s, { force: true }));
  assert.deepEqual([...st.data.keys()], ['ege-trainer:final:' + SCOPE]);
  assert.ok(!F.sessionKey(SCOPE).startsWith(EGE.attemptSave.KEY_PREFIX), 'не ключ тренировочной попытки');
  assert.ok(!F.resultKey(SCOPE).startsWith(EGE.attemptSave.RESULT_PREFIX), 'не ключ результата тренировочного практикума');

  const l = F.load(st, deps());
  assert.equal(l.status, 'ok');
  assert.equal(l.session.id, s.id);
  assert.equal(l.session.viewIndex, 9);
  assert.deepEqual(plain(F.getResponse(l.session, T(10))), [3, 2, 1, 2, 3]);
  assert.deepEqual(plain(F.getResponse(l.session, T(1))), [2]);

  // Другая попытка той же области не затирается устаревшей вкладкой.
  const other = session();
  assert.ok(F.save(st, other, { force: true }));
  F.setResponse(s, T(11), [3, 1, 2, 3, 1]);
  assert.equal(F.save(st, s), false, 'запись чужой попытки не перезаписывается');
  assert.equal(F.load(st, deps()).session.id, other.id);
});

test('сохранение: изменённое задание, другой состав или повреждённая запись — не продолжаются', () => {
  const st = memoryStorage();
  const s = session();
  F.setResponse(s, T(1), [2, 4]);
  F.save(st, s, { force: true });
  const changed = deps();
  changed.fingerprint = (t) => (t.id === 'OBS-TYP-001' ? 'другое' : EGE.attemptSave.taskFingerprint(t));
  const r = F.load(st, changed);
  assert.equal(r.status, 'invalid');
  assert.equal(r.reason, 'tasks');
  assert.equal(st.getItem(F.sessionKey(SCOPE)), null, 'запись удалена');

  F.save(st, s, { force: true });
  const comp = deps();
  comp.taskIds = P.taskIds.slice(1);
  assert.equal(F.load(st, comp).reason, 'composition');

  st.setItem(F.sessionKey(SCOPE), '{битая');
  assert.equal(F.load(st, deps()).reason, 'corrupt');

  const bad = plain(session());
  bad.responses['OBS-TYP-001'] = [1, 2, 3];   // больше двух позиций в EXCL
  st.setItem(F.sessionKey(SCOPE), JSON.stringify(bad));
  assert.equal(F.load(st, deps()).reason, 'corrupt');
});

test('завершение: результат и история попыток не смешиваются; незавершённая запись удаляется', () => {
  const st = memoryStorage();
  for (let k = 0; k < 2; k++) {
    const s = session(new Date(Date.UTC(2026, 10, 10 + k)));
    if (k === 1) F.setResponse(s, T(1), [2, 4]);
    F.save(st, s, { force: true });
    F.finish(s, new Date(Date.UTC(2026, 10, 10 + k, 1)), EGE.getTask);
    const a = F.analytics(F.results(s, EGE.getTask), P.criteria);
    assert.equal(F.complete(st, s, F.summary(s, a)), 'saved');
    assert.equal(st.getItem(F.sessionKey(SCOPE)), null);
  }
  const hist = F.loadHistory(st, SCOPE);
  assert.equal(hist.length, 2);
  assert.deepEqual(plain(hist.map((h) => h.score)), [1, 0], 'новые попытки — первыми, итоги не смешиваются');
  assert.notEqual(hist[0].id, hist[1].id);
  const res = F.loadResult(st, deps());
  assert.equal(res.status, 'ok');
  assert.deepEqual(plain(res.changed), []);
  assert.equal(F.analytics(F.results(res.session, EGE.getTask), P.criteria).total.points, 1);

  // Задание изменилось после завершения: баллы — сохранённые при завершении, разбор недоступен.
  const changed = deps();
  changed.fingerprint = (t) => (t.id === 'OBS-TYP-001' ? 'другое' : EGE.attemptSave.taskFingerprint(t));
  const r2 = F.loadResult(st, changed);
  assert.deepEqual(plain(r2.changed), ['OBS-TYP-001']);
  const rows = F.results(r2.session, EGE.getTask, r2.changed);
  assert.equal(rows[0].changed, true);
  assert.equal(rows[0].points, 1);
});

test('недоступное хранилище не мешает: сохранение и завершение возвращают отказ без исключений', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const s = session();
  assert.equal(F.save(broken, s, { force: true }), false);
  assert.equal(F.save(null, s), false);
  assert.equal(F.load(broken, deps()).status, 'none');
  F.finish(s, new Date(), EGE.getTask);
  assert.equal(F.complete(broken, s, { id: s.id }), 'failed');
});

test('повторные попытки: история хранит каждую, сводка — первая, последняя, лучшая и динамика', () => {
  const st = memoryStorage();
  const answers = [[], [[1, [2, 4]], [15, [1, 3, 5]]], [[1, [2, 4]]], [[1, [2, 4]], [15, [1, 3, 5]], [7, [1, 2, 1, 2, 2]]]];
  answers.forEach((list, k) => {
    const s = session(new Date(Date.UTC(2026, 10, 1 + k)));
    list.forEach(([n, sel]) => F.setResponse(s, T(n), sel));
    F.finish(s, new Date(Date.UTC(2026, 10, 1 + k, 1)), EGE.getTask);
    F.complete(st, s, F.summary(s, F.analytics(F.results(s, EGE.getTask), P.criteria)));
  });
  const sum = F.progressSummary(F.loadHistory(st, SCOPE));
  assert.equal(sum.count, 4);
  assert.deepEqual(plain(sum.attempts.map((a) => a.score)), [0, 3, 1, 4], 'по порядку прохождения');
  assert.equal(sum.first.score, 0);
  assert.equal(sum.last.score, 4);
  assert.equal(sum.best.score, 4);
  assert.equal(sum.bestIndex, 3);
  assert.equal(sum.sinceFirst, 4);
  assert.equal(sum.sincePrevious, 3);
  assert.equal(F.progressSummary([]), null);
});

test('история не теряет первую попытку при переполнении', () => {
  const st = memoryStorage();
  const fake = (i) => ({ id: 'a' + i, score: i, max: 35, finishedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() });
  let list = [];
  for (let i = 0; i < F.HISTORY_LIMIT; i++) list.unshift(fake(i));
  st.setItem(F.historyKey(SCOPE), JSON.stringify(list));
  const s = session();
  F.finish(s, new Date(), EGE.getTask);
  F.complete(st, s, F.summary(s, F.analytics(F.results(s, EGE.getTask), P.criteria)));
  const hist = F.loadHistory(st, SCOPE);
  assert.equal(hist.length, F.HISTORY_LIMIT);
  assert.equal(hist[0].id, s.id, 'новая — первой в списке');
  assert.equal(hist[hist.length - 1].id, 'a0', 'самая первая попытка сохранена');
});
