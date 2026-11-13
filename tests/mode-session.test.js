'use strict';

/**
 * Режимы «Обучение» и «Экзамен» (js/mode-session.js): оценивание 0/1/2 по моделям ФИПИ,
 * пропуски, повторное выполнение, отсутствие ответов в данных до проверки, сохранение
 * и продолжение, разделение попыток и режимов, итоги и учебная аналитика.
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
    .filter((s) => s !== 'js/app.js' && s !== 'js/task-view.js' && s !== 'js/practicum-modes.js');
  for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  return context.EGE;
}

const EGE = load();
const M = EGE.modeSession;
const P = EGE.getPracticum('OBS-TYP-P01');
const T = (n) => EGE.getTask('OBS-TYP-' + String(n).padStart(3, '0'));
const plain = (x) => JSON.parse(JSON.stringify(x));
const SCOPE = EGE.attemptSave.scopeId('ege', { section: 'OBS', topic: 'OBS-TYP', practicum: 'OBS-TYP-P01' });

function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); }
  };
}

function session(mode, now) {
  return M.create({
    mode, practicum: P.id, scope: SCOPE, taskIds: P.taskIds, now,
    getTask: EGE.getTask, fingerprint: EGE.attemptSave.taskFingerprint
  });
}

const deps = (mode, finished) => ({
  getTask: EGE.getTask, fingerprint: EGE.attemptSave.taskFingerprint,
  taskIds: P.taskIds, mode, scope: SCOPE, finished: !!finished
});

const pts = (n, sel) => M.grade(T(n), sel).points;

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
  assert.equal(M.grade(T(1), [2, 4]).maxPoints, 1);
  assert.throws(() => M.normalize(T(1), [2, 4, 5]), /только 2/);
});

test('MATCH (позиция 3 КИМ) — 1 балл только при всех пяти верных; строгий порядок А–Д', () => {
  // № 7, ключ 1 2 1 2 2.
  assert.equal(pts(7, [1, 2, 1, 2, 2]), 1);
  assert.equal(pts(7, [2, 2, 1, 2, 2]), 0, 'одна неверная позиция');
  assert.equal(pts(7, [2, 1, 2, 1, 1]), 0, 'порядок важен');
  assert.equal(pts(7, [1, 2, 1, 2, null]), 0, 'незаполненная позиция — ошибка');
  assert.equal(M.grade(T(7), [1, 2, 1, 2, null]).mistakes, 1);
  assert.throws(() => M.normalize(T(7), [1, 2, 1]), /по числу позиций/);
});

test('пропущенное задание — «без ответа», 0 баллов', () => {
  for (const n of [1, 7, 15, 21]) {
    const g = M.grade(T(n), M.emptyResponse(T(n)));
    assert.equal(g.skipped, true, n);
    assert.equal(g.points, 0, n);
    assert.equal(g.level, 'skipped', n);
  }
});

test('обучение: задания по порядку, проверка, повтор; в итог идёт первая проверка', () => {
  const s = session('learn');
  assert.equal(M.canView(s, 1), false, 'вперёд к непроверенным нельзя');
  M.setResponse(s, T(1), [2, 3]);
  const g = M.check(s, T(1));
  assert.equal(g.points, 0);
  assert.ok(M.isChecked(s, T(1).id));
  assert.throws(() => M.setResponse(s, T(1), [2, 4]), /Повторить/);
  M.retry(s, T(1).id);
  assert.deepEqual(plain(M.getResponse(s, T(1))), [], 'повтор начинается с пустого ответа');
  M.setResponse(s, T(1), [2, 4]);
  assert.equal(M.check(s, T(1)).points, 1);
  assert.equal(M.triesOf(s, T(1).id).length, 2);
  assert.equal(M.canView(s, 1), true);
  assert.equal(M.canFinish(s), false, 'нельзя завершить, пока не все задания проверены');
  assert.throws(() => M.check(s, T(2)), /не заполнен/);
  // Остальные задания — верно с первой попытки.
  for (const id of P.taskIds.slice(1)) {
    const task = EGE.getTask(id);
    M.setResponse(s, task, Array.from(EGE.scoring.getCorrect(task)));
    M.check(s, task);
  }
  assert.ok(M.canFinish(s));
  M.finish(s, new Date(), EGE.getTask);
  const rows = M.results(s, EGE.getTask);
  assert.equal(rows[0].points, 0, 'первая проверка');
  assert.equal(rows[0].finalPoints, 1, 'после повтора');
  const a = M.analytics(rows, P.criteria);
  assert.equal(a.total.points, 34);
  assert.equal(a.finalScore, 35);
  assert.equal(a.retried, 1);
});

test('экзамен: свободный переход, изменение и пропуск ответов; ключей и баллов в сессии до завершения нет', () => {
  const s = session('exam');
  assert.ok(M.canView(s, 24), 'любое задание');
  M.setView(s, 24);
  M.setResponse(s, T(25), [1, 2, 3, 2, 1]);
  M.setResponse(s, T(15), [1, 2]);
  M.setResponse(s, T(15), [1, 3, 5]);          // изменён
  M.setResponse(s, T(16), [1]);
  M.setResponse(s, T(16), []);                 // очищен — снова без ответа
  assert.throws(() => M.check(s, T(15)), /только в обучении/);
  assert.equal(M.progressCount(s, EGE.getTask), 2);
  const raw = JSON.stringify(s);
  assert.doesNotMatch(raw, /points|correct|explanation|maxPoints/, 'до завершения в данных сессии только выбор ученика');
  assert.ok(M.canFinish(s), 'экзамен можно завершить с пропусками');
  M.finish(s, new Date(), EGE.getTask);
  assert.throws(() => M.setResponse(s, T(1), [2, 4]), /завершена/);
  const rows = M.results(s, EGE.getTask);
  const a = M.analytics(rows, P.criteria);
  assert.equal(a.total.points, 3);
  assert.equal(a.total.max, 35);
  assert.equal(a.total.full, 2);
  assert.equal(a.total.zero, 23);
  assert.equal(a.total.skipped, 23);
  assert.equal(rows[15].level, 'skipped');
});

test('аналитика: группы по форматам, критериям, уровням и действиям; общий балл без двойного учёта', () => {
  const s = session('exam');
  // Верно: № 1 (EXCL, 1 балл) и № 22 (COND, 2 балла); № 17 (MULTI) — одна ошибка.
  M.setResponse(s, T(1), [2, 4]);
  M.setResponse(s, T(22), [1, 3, 5, 6]);
  M.setResponse(s, T(17), [2, 3]);
  M.finish(s, new Date(), EGE.getTask);
  const a = M.analytics(M.results(s, EGE.getTask), P.criteria);
  assert.equal(a.total.points, 4);
  assert.equal(a.total.full, 2);
  assert.equal(a.total.partial, 1);
  assert.equal(a.total.tasks, 25);
  const g = (list, id) => list.find((x) => x.id === id);
  assert.deepEqual(Array.from(a.byFormat, (x) => x.id), ['EXCL', 'MATCH', 'MULTI', 'COND']);
  assert.deepEqual([g(a.byFormat, 'EXCL').points, g(a.byFormat, 'EXCL').max, g(a.byFormat, 'EXCL').tasks], [1, 6, 6]);
  assert.deepEqual([g(a.byFormat, 'MATCH').max, g(a.byFormat, 'MULTI').max, g(a.byFormat, 'COND').max], [9, 12, 8]);
  // Сумма по форматам = общий балл (у задания один формат).
  assert.equal(a.byFormat.reduce((sum, x) => sum + x.points, 0), a.total.points);
  assert.equal(a.byLevel.reduce((sum, x) => sum + x.max, 0), 35);
  // Критерии: шесть групп; № 22 (Ф, Э, С, Д) учтено в каждом своём критерии.
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
  const d = M.mistakeDetails(T(15), [1, 2, 3]);
  assert.deepEqual(plain(d.map((x) => [x.number, x.kind])), [[2, 'wrong'], [5, 'missed']]);
  assert.ok(d[0].statement.trap, 'у неверной позиции есть разметка ловушки');
  const m = M.mistakeDetails(T(7), [1, 2, 1, 1, null]);
  assert.deepEqual(plain(m.map((x) => [x.letter, x.chosen, x.expected])), [['Г', 1, 2], ['Д', null, 2]]);
});

test('сохранение: продолжение незавершённой сессии, режимы и попытки не смешиваются', () => {
  const st = memoryStorage();
  const learn = session('learn');
  M.setResponse(learn, T(1), [2, 4]);
  M.check(learn, T(1));
  M.setView(learn, 1);
  M.setResponse(learn, T(2), [4]);
  assert.ok(M.save(st, learn, { force: true }));
  const exam = session('exam');
  M.setResponse(exam, T(10), [3, 2, 1, 2, 3]);
  M.setView(exam, 9);
  assert.ok(M.save(st, exam, { force: true }));
  assert.notEqual(M.sessionKey('learn', SCOPE), M.sessionKey('exam', SCOPE));

  const l = M.load(st, deps('learn'));
  assert.equal(l.status, 'ok');
  assert.equal(l.session.id, learn.id);
  assert.equal(l.session.viewIndex, 1);
  assert.deepEqual(plain(M.getResponse(l.session, T(2))), [4]);
  assert.equal(M.triesOf(l.session, T(1).id)[0].points, 1);
  const e = M.load(st, deps('exam'));
  assert.equal(e.session.id, exam.id);
  assert.deepEqual(plain(e.session.responses['OBS-TYP-010']), [3, 2, 1, 2, 3]);
  assert.equal(e.session.viewIndex, 9);

  // Другая попытка той же области не затирается устаревшей вкладкой.
  const other = session('exam');
  assert.ok(M.save(st, other, { force: true }));
  M.setResponse(exam, T(11), [3, 1, 2, 3, 1]);
  assert.equal(M.save(st, exam), false, 'запись чужой попытки не перезаписывается');
  assert.equal(M.load(st, deps('exam')).session.id, other.id);
});

test('сохранение: изменённое задание, другой состав или повреждённая запись — не продолжаются', () => {
  const st = memoryStorage();
  const s = session('exam');
  M.setResponse(s, T(1), [2, 4]);
  M.save(st, s, { force: true });
  const changed = deps('exam');
  changed.fingerprint = (t) => (t.id === 'OBS-TYP-001' ? 'другое' : EGE.attemptSave.taskFingerprint(t));
  const r = M.load(st, changed);
  assert.equal(r.status, 'invalid');
  assert.equal(r.reason, 'tasks');
  assert.equal(st.getItem(M.sessionKey('exam', SCOPE)), null, 'запись удалена');

  M.save(st, s, { force: true });
  const comp = deps('exam');
  comp.taskIds = P.taskIds.slice(1);
  assert.equal(M.load(st, comp).reason, 'composition');

  st.setItem(M.sessionKey('exam', SCOPE), '{битая');
  assert.equal(M.load(st, deps('exam')).reason, 'corrupt');

  const bad = plain(session('exam'));
  bad.responses['OBS-TYP-001'] = [1, 2, 3];   // больше двух позиций в EXCL
  st.setItem(M.sessionKey('exam', SCOPE), JSON.stringify(bad));
  assert.equal(M.load(st, deps('exam')).reason, 'corrupt');

  const learn = plain(session('learn'));
  learn.tries['OBS-TYP-001'] = [{ selected: [2, 4], points: 0, maxPoints: 1, answeredAt: new Date().toISOString() }];
  st.setItem(M.sessionKey('learn', SCOPE), JSON.stringify(learn));
  assert.equal(M.load(st, deps('learn')).reason, 'scoring', 'баллы пересчитываются, сохранённым не верим');
});

test('завершение: результат и история попыток отдельно для каждого режима; незавершённая запись удаляется', () => {
  const st = memoryStorage();
  for (let k = 0; k < 2; k++) {
    const s = session('exam', new Date(Date.UTC(2026, 10, 10 + k)));
    if (k === 1) M.setResponse(s, T(1), [2, 4]);
    M.save(st, s, { force: true });
    M.finish(s, new Date(Date.UTC(2026, 10, 10 + k, 1)), EGE.getTask);
    const a = M.analytics(M.results(s, EGE.getTask), P.criteria);
    assert.equal(M.complete(st, s, M.summary(s, a)), 'saved');
    assert.equal(st.getItem(M.sessionKey('exam', SCOPE)), null);
  }
  const hist = M.loadHistory(st, 'exam', SCOPE);
  assert.equal(hist.length, 2);
  assert.deepEqual(plain(hist.map((h) => h.score)), [1, 0], 'новые попытки — первыми, итоги не смешиваются');
  assert.notEqual(hist[0].id, hist[1].id);
  assert.deepEqual(plain(M.loadHistory(st, 'learn', SCOPE)), [], 'история обучения отдельно');
  const res = M.loadResult(st, deps('exam', true));
  assert.equal(res.status, 'ok');
  assert.deepEqual(plain(res.changed), []);
  assert.equal(M.analytics(M.results(res.session, EGE.getTask), P.criteria).total.points, 1);

  // Задание изменилось после завершения: баллы — сохранённые при завершении, разбор недоступен.
  const changed = deps('exam', true);
  changed.fingerprint = (t) => (t.id === 'OBS-TYP-001' ? 'другое' : EGE.attemptSave.taskFingerprint(t));
  const r2 = M.loadResult(st, changed);
  assert.deepEqual(plain(r2.changed), ['OBS-TYP-001']);
  const rows = M.results(r2.session, EGE.getTask, r2.changed);
  assert.equal(rows[0].changed, true);
  assert.equal(rows[0].points, 1);
});

test('недоступное хранилище не мешает: сохранение и завершение возвращают отказ без исключений', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const s = session('exam');
  assert.equal(M.save(broken, s, { force: true }), false);
  assert.equal(M.save(null, s), false);
  assert.equal(M.load(broken, deps('exam')).status, 'none');
  M.finish(s, new Date(), EGE.getTask);
  assert.equal(M.complete(broken, s, { id: s.id }), 'failed');
});
