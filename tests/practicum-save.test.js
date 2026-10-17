'use strict';

/**
 * Сохранение незавершённых попыток практикумов (js/attempt-save.js):
 * у каждого практикума своя запись, попытки разных практикумов не перезаписывают
 * друг друга, восстанавливается прогресс; попытки, сохранённые до появления
 * практикумов (tests/fixtures/legacy-attempts.json — записаны кодом main),
 * безопасно переносятся в практикум или остаются нетронутыми.
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

const EGE = loadMain();
const S = EGE.attemptSave;
const A = EGE.attempt;
const KEY = (scope) => S.storageKey(scope);
/** Объект из контекста vm — в обычный (для deepEqual). */
const plain = (x) => JSON.parse(JSON.stringify(x));

/** Как в js/app.js: настройки, область и проверка сохранения практикума. */
const settingsOf = (p) => ({ section: p.section, topic: p.topic, practicum: p.id });
const scopeOf = (p) => S.scopeId('ege', settingsOf(p));
const depsOf = (p, now) => ({
  getTask: EGE.getTask, attempt: A, scoring: EGE.scoring, now,
  taskIds: p.taskIds, anyOrder: !!p.shuffle
});
const key = (task) => Array.from(EGE.scoring.getCorrect(task));

/** Попытка практикума с n верными ответами (порядок — как у приложения). */
function startAndAnswer(p, n, order) {
  const attempt = A.createAttempt({ settings: settingsOf(p), taskIds: order || p.taskIds });
  for (const id of attempt.taskIds.slice(0, n)) A.recordAnswer(attempt, EGE.getTask(id), key(EGE.getTask(id)));
  return attempt;
}

function save(storage, p, attempt, extra = {}) {
  const record = S.buildRecord(Object.assign({ scope: scopeOf(p), attempt, viewIndex: A.lastReachableIndex(attempt), draft: null, getTask: EGE.getTask }, extra));
  assert.equal(S.write(storage, record, { force: true }), true);
  return record;
}

const COG = EGE.getPracticum('OBS-COG-P01');
const ACT = EGE.getPracticum('OBS-ACT-P01');
const FAM = EGE.getPracticum('SOC-FAM-P01');
const FAM2 = EGE.getPracticum('SOC-FAM-P02');
const FAM_OLD = EGE.getPracticum('SOC-FAM-R01');

/* ---------- Области сохранения ---------- */

test('у каждого практикума своя область сохранения', () => {
  assert.equal(scopeOf(COG), 'ege/OBS/OBS-COG/OBS-COG-P01');
  assert.equal(scopeOf(ACT), 'ege/OBS/OBS-ACT/OBS-ACT-P01');
  assert.equal(KEY(scopeOf(COG)), 'ege-trainer:attempt:ege/OBS/OBS-COG/OBS-COG-P01');
  // Прежние области (тема целиком, предпросмотр) не совпадают с областями практикумов.
  assert.equal(S.scopeId('ege', { section: 'OBS', topic: 'OBS-ACT' }), 'ege/OBS/OBS-ACT');
  assert.notEqual(scopeOf(COG), S.scopeId('preview', { section: 'preview', topic: 'poznanie-19' }));
  const scopes = EGE.practicums.map(scopeOf);
  assert.equal(new Set(scopes).size, scopes.length);
});

test('попытка помнит свой практикум; попытки без практикума записываются как раньше', () => {
  const a = A.createAttempt({ settings: settingsOf(COG), taskIds: COG.taskIds });
  assert.deepEqual(JSON.parse(JSON.stringify(a.settings)), { section: 'OBS', topic: 'OBS-COG', practicum: 'OBS-COG-P01' });
  const old = A.createAttempt({ settings: { section: 'SOC', topic: 'SOC-FAM' }, taskIds: ['SOC-FAM-001'] });
  assert.deepEqual(Object.keys(old.settings), ['section', 'topic']);
});

/* ---------- Независимое сохранение ---------- */

test('познание → выход после 5-го задания → деятельность → возврат к познанию с того же места', () => {
  const storage = memoryStorage();
  // 1. Практикум № 1 по познанию: пять ответов, на экране шестое задание, в нём отметка.
  const cog = startAndAnswer(COG, 5);
  save(storage, COG, cog, { viewIndex: 5, draft: [1] });
  // 2. Практикум по деятельности (задания перемешаны), два ответа.
  const actOrder = [...ACT.taskIds].reverse();
  const act = startAndAnswer(ACT, 2, actOrder);
  save(storage, ACT, act);
  assert.equal(storage.data.size, 2, 'две независимые записи');

  // 3. Возврат к познанию: прогресс на месте, деятельность его не перезаписала.
  const back = S.load(storage, scopeOf(COG), depsOf(COG));
  assert.equal(back.status, 'ok');
  assert.equal(back.state.attempt.id, cog.id);
  assert.equal(A.answeredCount(back.state.attempt), 5);
  assert.equal(back.state.viewIndex, 5);
  assert.deepEqual(Array.from(back.state.draft), [1]);
  assert.equal(A.totalScore(back.state.attempt), A.totalScore(cog));
  assert.deepEqual(Array.from(back.state.attempt.taskIds), Array.from(COG.taskIds));
  // Продолжение: шестой ответ засчитывается.
  A.recordAnswer(back.state.attempt, EGE.getTask(COG.taskIds[5]), key(EGE.getTask(COG.taskIds[5])));
  assert.equal(A.answeredCount(back.state.attempt), 6);

  // Деятельность тоже на месте, в своём порядке.
  const actBack = S.load(storage, scopeOf(ACT), depsOf(ACT));
  assert.equal(actBack.status, 'ok');
  assert.deepEqual(Array.from(actBack.state.attempt.taskIds), actOrder);
  assert.equal(A.answeredCount(actBack.state.attempt), 2);
});

test('новая попытка одного практикума не трогает сохранение другого; завершение удаляет только свою запись', () => {
  const storage = memoryStorage();
  save(storage, COG, startAndAnswer(COG, 3));
  const fam = startAndAnswer(FAM, 1);
  save(storage, FAM, fam);
  // «Начать заново» в семье: новая попытка с force.
  save(storage, FAM, startAndAnswer(FAM, 0));
  assert.equal(S.load(storage, scopeOf(COG), depsOf(COG)).state.attempt.answers.length, 3);
  S.remove(storage, scopeOf(FAM));
  assert.equal(S.load(storage, scopeOf(FAM), depsOf(FAM)).status, 'none');
  assert.equal(S.load(storage, scopeOf(COG), depsOf(COG)).status, 'ok');
});

test('запись одного практикума под ключом другого не принимается', () => {
  const storage = memoryStorage();
  save(storage, COG, startAndAnswer(COG, 2));
  storage.setItem(KEY(scopeOf(ACT)), storage.getItem(KEY(scopeOf(COG))));
  const result = S.load(storage, scopeOf(ACT), depsOf(ACT));
  assert.equal(result.status, 'invalid');
  assert.equal(storage.getItem(KEY(scopeOf(ACT))), null);
  assert.equal(S.load(storage, scopeOf(COG), depsOf(COG)).status, 'ok');
});

/* ---------- Состав практикума ---------- */

test('практикум с фиксированным порядком: попытка в другом порядке или составе не продолжается', () => {
  for (const order of [[...COG.taskIds].reverse(), COG.taskIds.slice(0, 18), [...COG.taskIds, 'OBS-COG-031'].slice(1)]) {
    const storage = memoryStorage();
    save(storage, COG, startAndAnswer(COG, 1, order));
    assert.equal(S.load(storage, scopeOf(COG), depsOf(COG)).reason, 'composition');
  }
});

test('практикум с перемешиванием: любой порядок того же состава продолжается, другой состав — нет', () => {
  const storage = memoryStorage();
  const shuffled = [...ACT.taskIds.slice(8), ...ACT.taskIds.slice(0, 8)];
  save(storage, ACT, startAndAnswer(ACT, 4, shuffled));
  assert.equal(S.load(storage, scopeOf(ACT), depsOf(ACT)).status, 'ok');

  const other = memoryStorage();
  save(other, ACT, startAndAnswer(ACT, 1, ACT.taskIds.slice(0, 15)));
  assert.equal(S.load(other, scopeOf(ACT), depsOf(ACT)).reason, 'composition');
});

/* ---------- Совместимость со старыми сохранениями ---------- */

const NOW = new Date('2026-10-16T12:00:00.000Z');
const legacyStorage = (scopes) => memoryStorage(Object.fromEntries(scopes.map((s) => [KEY(s), JSON.stringify(LEGACY[s])])));
const migrateTo = (storage, p) => S.migrate(storage, {
  from: S.scopeId('ege', { section: p.section, topic: p.topic }),
  to: scopeOf(p),
  settings: { practicum: p.id },
  deps: depsOf(p, NOW)
});

test('фикстура: записи сделаны прежней версией (без практикума в настройках и области)', () => {
  for (const [scope, record] of Object.entries(LEGACY)) {
    assert.equal(record.scope, scope);
    assert.equal(record.saveVersion, 1);
    assert.equal(record.attempt.settings.practicum, undefined);
    assert.equal(scope.split('/').length, 3);
  }
});

test('попытка темы «Деятельность» до практикумов переносится в Практикум № 1 без потерь', () => {
  const storage = legacyStorage(['ege/OBS/OBS-ACT']);
  const before = LEGACY['ege/OBS/OBS-ACT'];
  assert.deepEqual(plain(migrateTo(storage, ACT)), { status: 'migrated' });

  assert.equal(storage.getItem(KEY('ege/OBS/OBS-ACT')), null, 'прежняя запись перенесена');
  const result = S.load(storage, scopeOf(ACT), depsOf(ACT, NOW));
  assert.equal(result.status, 'ok');
  const a = result.state.attempt;
  assert.equal(a.id, before.attempt.id);
  assert.equal(a.startedAt, before.attempt.startedAt);
  assert.deepEqual(Array.from(a.taskIds), before.attempt.taskIds, 'порядок заданий прежний');
  assert.deepEqual(JSON.parse(JSON.stringify(a.answers)), before.attempt.answers, 'ответы и баллы прежние');
  assert.equal(a.settings.practicum, 'OBS-ACT-P01');
  assert.equal(result.state.viewIndex, before.viewIndex);
  // Повторный перенос (при каждом открытии страницы) ничего не меняет.
  const after = new Map(storage.data);
  assert.equal(migrateTo(storage, ACT).status, 'skipped');
  assert.deepEqual(storage.data, after);
});

test('попытка темы «Семья и брак» до практикумов переносится в прежний набор (31 задание) без потерь', () => {
  const before = LEGACY['ege/SOC/SOC-FAM'];
  const storage = legacyStorage(['ege/SOC/SOC-FAM']);
  // В новые практикумы (16 и 15 заданий) попытка из 31 задания не подходит по составу.
  for (const p of [FAM, FAM2]) {
    const probe = legacyStorage(['ege/SOC/SOC-FAM']);
    assert.equal(S.load(probe, scopeOf(p), depsOf(p, NOW)).status, 'none');
    assert.equal(S.migrate(probe, { from: 'ege/SOC/SOC-FAM', to: scopeOf(p), settings: { practicum: p.id }, deps: depsOf(p, NOW) }).reason,
      'composition', p.id);
    assert.equal(probe.getItem(KEY('ege/SOC/SOC-FAM')), JSON.stringify(before), `${p.id}: запись не тронута`);
  }
  // Перенос делает приложение — в прежний набор, у которого legacyTopicAttempts.
  for (const p of EGE.practicums.filter((x) => x.legacyTopicAttempts)) migrateTo(storage, p);
  assert.equal(storage.getItem(KEY('ege/SOC/SOC-FAM')), null);
  assert.deepEqual([...storage.data.keys()], [KEY('ege/SOC/SOC-FAM/SOC-FAM-R01')]);
  const result = S.load(storage, scopeOf(FAM_OLD), depsOf(FAM_OLD, NOW));
  assert.equal(result.status, 'ok');
  const a = result.state.attempt;
  assert.equal(a.id, before.attempt.id);
  assert.deepEqual(Array.from(a.taskIds), before.attempt.taskIds, 'порядок заданий прежний');
  assert.deepEqual(plain(a.answers), before.attempt.answers, 'ответы и баллы прежние');
  assert.equal(a.settings.practicum, 'SOC-FAM-R01');
  assert.equal(A.answeredCount(a), 3);
  assert.equal(A.totalScore(a), 4);
  // Восстановленную попытку можно довести до конца.
  for (let i = 3; i < 31; i++) A.recordAnswer(a, EGE.getTask(a.taskIds[i]), key(EGE.getTask(a.taskIds[i])));
  assert.ok(A.isComplete(a));
});

test('«Семья и брак»: Практикум № 1, № 2 и прежний набор сохраняются независимо', () => {
  const storage = legacyStorage(['ege/SOC/SOC-FAM']);
  migrateTo(storage, FAM_OLD);
  const p1 = startAndAnswer(FAM, 4, [...FAM.taskIds].reverse());
  save(storage, FAM, p1);
  const p2 = startAndAnswer(FAM2, 2);
  save(storage, FAM2, p2);
  assert.deepEqual([...storage.data.keys()].sort(), [
    KEY('ege/SOC/SOC-FAM/SOC-FAM-P01'), KEY('ege/SOC/SOC-FAM/SOC-FAM-P02'), KEY('ege/SOC/SOC-FAM/SOC-FAM-R01')]);

  const r1 = S.load(storage, scopeOf(FAM), depsOf(FAM, NOW));
  const r2 = S.load(storage, scopeOf(FAM2), depsOf(FAM2, NOW));
  const old = S.load(storage, scopeOf(FAM_OLD), depsOf(FAM_OLD, NOW));
  assert.equal(r1.state.attempt.id, p1.id);
  assert.equal(A.answeredCount(r1.state.attempt), 4);
  assert.deepEqual(Array.from(r1.state.attempt.taskIds), [...FAM.taskIds].reverse());
  assert.equal(r2.state.attempt.id, p2.id);
  assert.equal(A.answeredCount(r2.state.attempt), 2);
  assert.equal(old.state.attempt.id, LEGACY['ege/SOC/SOC-FAM'].attempt.id);
  assert.equal(A.answeredCount(old.state.attempt), 3);

  // Завершение прежнего набора удаляет только его запись (как у любого практикума).
  S.remove(storage, scopeOf(FAM_OLD));
  assert.equal(S.load(storage, scopeOf(FAM), depsOf(FAM, NOW)).status, 'ok');
  assert.equal(S.load(storage, scopeOf(FAM2), depsOf(FAM2, NOW)).status, 'ok');
  // Записи практикумов не подменяют друг друга: P01 под ключом P02 не принимается.
  storage.setItem(KEY(scopeOf(FAM2)), storage.getItem(KEY(scopeOf(FAM))));
  assert.equal(S.load(storage, scopeOf(FAM2), depsOf(FAM2, NOW)).status, 'invalid');
  assert.equal(S.load(storage, scopeOf(FAM), depsOf(FAM, NOW)).status, 'ok');
});

test('прежний набор: попытка иного состава (не все 31 задание) не продолжается', () => {
  const storage = memoryStorage();
  save(storage, FAM_OLD, startAndAnswer(FAM_OLD, 1, FAM.taskIds));
  assert.equal(S.load(storage, scopeOf(FAM_OLD), depsOf(FAM_OLD)).reason, 'composition');
});

test('старые записи без подходящего практикума не удаляются и не меняются', () => {
  const scopes = ['ege/OBS/all', 'ege/all/all', 'ege/SOC/SOC-STR'];
  const storage = legacyStorage(scopes);
  const snapshot = new Map(storage.data);
  for (const p of EGE.practicums.filter((x) => x.legacyTopicAttempts)) migrateTo(storage, p);
  assert.deepEqual(storage.data, snapshot);
});

test('перенос не портит данные: состав не совпал, запись изменена, в практикуме уже есть своя попытка', () => {
  // Состав не совпал: в старой попытке темы было меньше заданий, чем в практикуме.
  const shorter = JSON.parse(JSON.stringify(LEGACY['ege/OBS/OBS-ACT']));
  shorter.attempt.taskIds = shorter.attempt.taskIds.slice(0, 15);
  let storage = memoryStorage({ [KEY('ege/OBS/OBS-ACT')]: JSON.stringify(shorter) });
  assert.deepEqual(plain(migrateTo(storage, ACT)), { status: 'kept', reason: 'composition' });
  assert.equal(storage.getItem(KEY('ege/OBS/OBS-ACT')), JSON.stringify(shorter));
  assert.equal(storage.getItem(KEY(scopeOf(ACT))), null);

  // Баллы в записи не совпадают с текущим оцениванием.
  const forged = JSON.parse(JSON.stringify(LEGACY['ege/OBS/OBS-ACT']));
  forged.attempt.answers[1].points = 2;
  storage = memoryStorage({ [KEY('ege/OBS/OBS-ACT')]: JSON.stringify(forged) });
  assert.equal(migrateTo(storage, ACT).reason, 'scoring');
  assert.equal(storage.getItem(KEY('ege/OBS/OBS-ACT')), JSON.stringify(forged));

  // Повреждённая запись.
  storage = memoryStorage({ [KEY('ege/OBS/OBS-ACT')]: '{oops' });
  assert.equal(migrateTo(storage, ACT).status, 'kept');
  assert.equal(storage.getItem(KEY('ege/OBS/OBS-ACT')), '{oops');

  // У практикума уже есть своя попытка — она главнее, обе записи не трогаются.
  storage = legacyStorage(['ege/OBS/OBS-ACT']);
  save(storage, ACT, startAndAnswer(ACT, 1));
  const own = storage.getItem(KEY(scopeOf(ACT)));
  assert.equal(migrateTo(storage, ACT).status, 'skipped');
  assert.equal(storage.getItem(KEY(scopeOf(ACT))), own);
  assert.ok(storage.getItem(KEY('ege/OBS/OBS-ACT')));
});

test('перенос при ошибке хранилища: прежняя запись остаётся, новая не появляется', () => {
  const storage = legacyStorage(['ege/OBS/OBS-ACT']);
  const raw = storage.getItem(KEY('ege/OBS/OBS-ACT'));
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(migrateTo(storage, ACT).status, 'kept');
  assert.equal(storage.getItem(KEY('ege/OBS/OBS-ACT')), raw);
  assert.equal(storage.getItem(KEY(scopeOf(ACT))), null);
  assert.equal(S.migrate(null, { from: 'a', to: 'b' }).status, 'none');
});

/* ---------- Все старые записи сразу (как в браузере ученика после обновления сайта) ---------- */

/** Скрипты страницы предпросмотра (без интерфейса) в новой версии. */
function loadPage(page) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const context = vm.createContext({});
  context.globalThis = context;
  for (const [, src] of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    if (src === 'js/app.js' || src === 'js/task-view.js') continue;
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

test('попытки страниц предпросмотра, сохранённые прежней версией, продолжаются после переноса заданий в банк', () => {
  for (const [page, scope, answered] of [
    ['preview-poznanie.html', 'preview/preview/poznanie-19', 6],
    ['preview-cognition.html', 'preview/preview/cognition-batch1', 4]
  ]) {
    const P = loadPage(page);
    const storage = legacyStorage([scope]);
    const result = P.attemptSave.load(storage, scope, {
      getTask: P.getTask, attempt: P.attempt, scoring: P.scoring, now: NOW, taskIds: P.preview.taskIds
    });
    assert.equal(result.status, 'ok', page);
    assert.equal(P.attempt.answeredCount(result.state.attempt), answered, page);
    assert.deepEqual(plain(result.state.attempt.answers), LEGACY[scope].attempt.answers, `${page}: ответы и баллы прежние`);
  }
});

test('обновление сайта: все старые записи сразу — переносятся только подходящие, ни одна не теряется', () => {
  const scopes = Object.keys(LEGACY);
  const storage = legacyStorage(scopes);
  const before = new Map(storage.data);
  // То же, что делает главная страница при открытии (js/app.js, migrateLegacyAttempts).
  for (const p of EGE.practicums.filter((x) => x.legacyTopicAttempts && EGE.isPracticumContinuable(x))) migrateTo(storage, p);

  const moved = { 'ege/OBS/OBS-ACT': 'ege/OBS/OBS-ACT/OBS-ACT-P01', 'ege/SOC/SOC-FAM': 'ege/SOC/SOC-FAM/SOC-FAM-R01' };
  assert.equal(storage.data.size, before.size, 'число записей не изменилось');
  for (const scope of scopes) {
    if (moved[scope]) {
      assert.equal(storage.getItem(KEY(scope)), null, `${scope}: перенесена`);
      const target = moved[scope];
      const p = EGE.getPracticum(target.split('/').pop());
      const result = S.load(storage, target, depsOf(p, NOW));
      assert.equal(result.status, 'ok', target);
      assert.deepEqual(plain(result.state.attempt.answers), LEGACY[scope].attempt.answers, `${target}: ответы прежние`);
    } else {
      assert.equal(storage.getItem(KEY(scope)), before.get(KEY(scope)), `${scope}: не тронута`);
    }
  }
  // Повторное открытие страницы ничего не меняет.
  const after = new Map(storage.data);
  for (const p of EGE.practicums.filter((x) => x.legacyTopicAttempts)) migrateTo(storage, p);
  assert.deepEqual(storage.data, after);
});
