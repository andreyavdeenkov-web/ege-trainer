'use strict';

/**
 * Сохранение и восстановление незавершённой попытки (js/attempt-save.js):
 * области сохранения, проверка совместимости с текущими заданиями и правилами
 * оценивания, отбраковка повреждённых и изменённых записей.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, dataScripts } = require('./helpers/ege.js');

const CORE = ['js/registry.js', 'js/scoring.js', 'js/attempt.js', 'js/attempt-save.js'];

function load(extra) {
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of CORE.concat(extra)) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}
const loadMain = () => load(dataScripts);
const loadPreview = () => load(['data/preview/cognition-batch1.js']);

/** Хранилище в памяти с интерфейсом localStorage. */
function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); }
  };
}

const deps = (EGE, now) => ({ getTask: EGE.getTask, attempt: EGE.attempt, scoring: EGE.scoring, now });
const key = (EGE, task) => Array.from(EGE.scoring.getCorrect(task));

/** Попытка темы «Семья и брак»: первые три ответа — верный, с ошибкой, верный. */
function familyAttempt(EGE) {
  const A = EGE.attempt;
  const settings = { section: 'SOC', topic: 'SOC-FAM' };
  const ids = EGE.getPool('SOC', 'SOC-FAM').map((t) => t.id);
  const attempt = A.createAttempt({ settings, taskIds: ids });
  ids.slice(0, 3).forEach((id, i) => {
    const task = EGE.getTask(id);
    let sel = key(EGE, task);
    if (i === 1) {
      if (EGE.scoring.getTaskType(task) === 'matching') sel[0] = sel[0] === 1 ? 2 : 1;
      else sel = sel.length > 1 ? sel.slice(1) : [sel[0] === 1 ? 2 : 1];
      if (EGE.scoring.getTaskType(task) === 'exclude-two' && sel.length < 2) sel.push([1, 2, 3, 4, 5, 6].find((n) => !sel.includes(n)));
    }
    A.recordAnswer(attempt, task, sel);
  });
  return { attempt, scope: EGE.attemptSave.scopeId('ege', settings) };
}

function saveRecord(EGE, storage, attempt, scope, extra = {}) {
  const S = EGE.attemptSave;
  const record = S.buildRecord(Object.assign({ scope, attempt, viewIndex: 1, draft: null, getTask: EGE.getTask }, extra));
  assert.equal(S.write(storage, record), true);
  return record;
}

/** Переписывает сохранённую запись (имитация старой версии, порчи или подделки). */
function tamper(storage, scope, EGE, fn) {
  const k = EGE.attemptSave.storageKey(scope);
  const record = JSON.parse(storage.getItem(k));
  fn(record);
  storage.setItem(k, JSON.stringify(record));
}

test('сохранение и продолжение: порядок заданий, ответы, баллы, позиция, черновик', () => {
  const EGE = loadMain();
  const S = EGE.attemptSave;
  const storage = memoryStorage();
  const { attempt, scope } = familyAttempt(EGE);
  const current = EGE.getTask(attempt.taskIds[3]);
  const draft = EGE.scoring.getTaskType(current) === 'matching' ? current.items.map((_, i) => (i === 0 ? 1 : null)) : [1];
  saveRecord(EGE, storage, attempt, scope, { viewIndex: 1, draft });

  const result = S.load(storage, scope, deps(EGE));
  assert.equal(result.status, 'ok');
  const restored = result.state.attempt;
  assert.equal(restored.id, attempt.id);
  assert.equal(restored.startedAt, attempt.startedAt);
  assert.deepEqual(Array.from(restored.taskIds), Array.from(attempt.taskIds));
  assert.deepEqual(JSON.parse(JSON.stringify(restored.answers)), JSON.parse(JSON.stringify(attempt.answers)));
  assert.equal(EGE.attempt.totalScore(restored), EGE.attempt.totalScore(attempt));
  assert.equal(EGE.attempt.currentIndex(restored), 3);
  assert.equal(result.state.viewIndex, 1);
  assert.deepEqual(Array.from(result.state.draft), draft);
  // Восстановленную попытку можно продолжать: следующий ответ засчитывается.
  EGE.attempt.recordAnswer(restored, current, key(EGE, current));
  assert.equal(EGE.attempt.answeredCount(restored), 4);
});

test('области не смешиваются: предпросмотр, другие темы и режимы — отдельные ключи', () => {
  const EGE = loadMain();
  const S = EGE.attemptSave;
  const storage = memoryStorage();
  const { attempt, scope } = familyAttempt(EGE);
  saveRecord(EGE, storage, attempt, scope);

  assert.equal(scope, 'ege/SOC/SOC-FAM');
  assert.equal(S.storageKey(scope), 'ege-trainer:attempt:ege/SOC/SOC-FAM');
  assert.notEqual(S.storageKey(scope), 'ege-trainer:settings');
  for (const other of [S.scopeId('ege', { section: 'SOC', topic: 'all' }), S.scopeId('ege', { section: 'all', topic: 'all' }),
    S.scopeId('ege', { section: 'OBS', topic: 'OBS-ACT' }), S.scopeId('preview', { section: 'preview', topic: 'cognition-batch1' }),
    S.scopeId('preview', { section: 'SOC', topic: 'SOC-FAM' })]) {
    assert.notEqual(other, scope);
    assert.equal(S.load(storage, other, deps(EGE)).status, 'none', other);
  }
  // Запись, подложенная под чужой ключ, не принимается.
  storage.setItem(S.storageKey('ege/OBS/OBS-ACT'), storage.getItem(S.storageKey(scope)));
  assert.equal(S.load(storage, 'ege/OBS/OBS-ACT', deps(EGE)).reason, 'corrupt');
  assert.equal(S.load(storage, scope, deps(EGE)).status, 'ok');
});

test('предпросмотр: сохранение набора восстанавливается на странице предпросмотра', () => {
  const EGE = loadPreview();
  const S = EGE.attemptSave;
  const storage = memoryStorage();
  const settings = { section: 'preview', topic: EGE.preview.id };
  const attempt = EGE.attempt.createAttempt({ settings, taskIds: EGE.preview.taskIds });
  for (const id of EGE.preview.taskIds.slice(0, 5)) EGE.attempt.recordAnswer(attempt, EGE.getTask(id), key(EGE, EGE.getTask(id)));
  const scope = S.scopeId('preview', settings);
  saveRecord(EGE, storage, attempt, scope, { viewIndex: 5 });
  const result = S.load(storage, scope, deps(EGE));
  assert.equal(result.status, 'ok');
  assert.deepEqual(Array.from(result.state.attempt.taskIds), Array.from(EGE.preview.taskIds));
  assert.equal(EGE.attempt.totalScore(result.state.attempt), 9); // соответствие (1 балл) + 4 задания по 2
});

test('повреждённая запись отбрасывается и удаляется', () => {
  const EGE = loadMain();
  const S = EGE.attemptSave;
  const scope = 'ege/SOC/SOC-FAM';
  for (const raw of ['{не json', 'null', '42', '[]', JSON.stringify({ format: S.FORMAT, saveVersion: 1, scope })]) {
    const storage = memoryStorage();
    storage.setItem(S.storageKey(scope), raw);
    const result = S.load(storage, scope, deps(EGE));
    assert.equal(result.status, 'invalid', raw);
    assert.ok(result.message, raw);
    assert.equal(storage.getItem(S.storageKey(scope)), null, `${raw}: запись удалена`);
  }
});

const CASES = [
  ['другая версия формата', 'format', (r) => { r.saveVersion = 0; }],
  ['другая версия попытки', 'format', (r) => { r.attempt.schemaVersion = 99; }],
  ['старше 30 дней', 'expired', (r) => { r.savedAt = new Date(Date.now() - 31 * 864e5).toISOString(); }],
  ['завершённая попытка', 'corrupt', (r) => { r.attempt.finishedAt = new Date().toISOString(); }],
  ['ответ не на своё задание', 'corrupt', (r) => { r.attempt.answers[1].taskId = r.attempt.taskIds[2]; }],
  ['недопустимый номер варианта', 'corrupt', (r) => { r.attempt.answers[0].selected = [99]; }],
  ['завышенные баллы', 'scoring', (r) => { r.attempt.answers[1].points = r.attempt.answers[1].maxPoints; }],
  ['другой ключ', 'scoring', (r) => { r.attempt.answers[0].correct = [9]; }],
  ['другой максимум', 'scoring', (r) => { r.attempt.answers[0].maxPoints = 5; }],
  ['другая версия задания в ответе', 'tasks', (r) => { r.attempt.answers[0].taskVersion = 2; }],
  ['задание вне банка', 'tasks', (r) => { r.attempt.taskIds[5] = 'SOC-FAM-999'; r.tasks['SOC-FAM-999'] = 'x'; }],
  ['отпечаток задания не совпал', 'tasks', (r) => { r.tasks[r.attempt.taskIds[4]] = '00000000'; }]
];

for (const [name, reason, fn] of CASES) {
  test(`несовместимое сохранение не восстанавливается: ${name}`, () => {
    const EGE = loadMain();
    const storage = memoryStorage();
    const { attempt, scope } = familyAttempt(EGE);
    saveRecord(EGE, storage, attempt, scope);
    tamper(storage, scope, EGE, fn);
    const result = EGE.attemptSave.load(storage, scope, deps(EGE));
    assert.equal(result.status, 'invalid');
    assert.equal(result.reason, reason);
    assert.equal(result.message, EGE.attemptSave.REASONS[reason]);
    assert.equal(storage.getItem(EGE.attemptSave.storageKey(scope)), null);
  });
}

test('задание изменилось после сохранения (текст, ключ, версия) или снято с выдачи', () => {
  const edits = [
    (t) => { (t.statements || t.items)[0].text += ' (ред.)'; },
    (t) => { if (t.statements) t.statements[0].correct = !t.statements[0].correct; else t.items[0].match = t.items[0].match === 1 ? 2 : 1; },
    (t) => { t.version = 2; },
    (t) => { t.retired = true; }
  ];
  for (const edit of edits) {
    const EGE = loadMain();
    const storage = memoryStorage();
    const { attempt, scope } = familyAttempt(EGE);
    saveRecord(EGE, storage, attempt, scope);
    edit(EGE.getTask(attempt.taskIds[0]));
    assert.equal(EGE.attemptSave.load(storage, scope, deps(EGE)).reason, 'tasks', String(edit));
  }
});

test('правка объяснения не мешает продолжить попытку', () => {
  const EGE = loadMain();
  const storage = memoryStorage();
  const { attempt, scope } = familyAttempt(EGE);
  saveRecord(EGE, storage, attempt, scope);
  const task = EGE.getTask(attempt.taskIds[0]);
  (task.statements || task.items)[0].explanation += ' Уточнено.';
  assert.equal(EGE.attemptSave.load(storage, scope, deps(EGE)).status, 'ok');
});

test('изменение правил оценивания: сохранённые прежние баллы не выдаются за действительные', () => {
  const EGE = loadMain();
  const storage = memoryStorage();
  const { attempt, scope } = familyAttempt(EGE);
  saveRecord(EGE, storage, attempt, scope);
  // Имитация: оценивание стало другим — каждый ответ теперь стоит на балл меньше.
  const original = EGE.scoring.scoreTask;
  EGE.scoring.scoreTask = (task, sel, cor) => Math.max(0, original(task, sel, cor) - 1);
  assert.equal(EGE.attemptSave.load(storage, scope, deps(EGE)).reason, 'scoring');
});

test('позиция вне досягаемости и неверный черновик не восстанавливаются, ответы — да', () => {
  const EGE = loadMain();
  const storage = memoryStorage();
  const { attempt, scope } = familyAttempt(EGE);
  saveRecord(EGE, storage, attempt, scope, { viewIndex: 25, draft: [0, 'x'] });
  const result = EGE.attemptSave.load(storage, scope, deps(EGE));
  assert.equal(result.status, 'ok');
  assert.equal(result.state.viewIndex, 3, 'показывается текущее задание');
  assert.equal(result.state.draft, null);
  assert.equal(EGE.attempt.answeredCount(result.state.attempt), 3);
});

test('хранилище недоступно или переполнено — тренировка не ломается', () => {
  const EGE = loadMain();
  const S = EGE.attemptSave;
  const { attempt, scope } = familyAttempt(EGE);
  const record = S.buildRecord({ scope, attempt, viewIndex: 0, draft: null, getTask: EGE.getTask });
  assert.equal(S.write(null, record), false);
  assert.deepEqual(JSON.parse(JSON.stringify(S.load(null, scope, deps(EGE)))), { status: 'none' });
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(S.write(broken, record), false);
  assert.equal(S.load(broken, scope, deps(EGE)).status, 'none');
  assert.doesNotThrow(() => S.remove(broken, scope));
});

test('отпечаток задания: стабилен, зависит от формулировок и ключа, не от объяснений', () => {
  const EGE = loadMain();
  const S = EGE.attemptSave;
  for (const task of EGE.tasks) {
    const fp = S.taskFingerprint(task);
    assert.match(fp, /^[0-9a-f]{8}$/);
    assert.equal(S.taskFingerprint(JSON.parse(JSON.stringify(task))), fp, task.id);
  }
  const prints = new Set(EGE.tasks.map((t) => S.taskFingerprint(t)));
  assert.equal(prints.size, EGE.tasks.length, 'у разных заданий разные отпечатки');
});

test('две вкладки: устаревшее состояние не затирает более свежее, новая попытка — затирает явно', () => {
  const EGE = loadMain();
  const S = EGE.attemptSave;
  const storage = memoryStorage();
  const { attempt, scope } = familyAttempt(EGE);
  const build = (a) => S.buildRecord({ scope, attempt: a, viewIndex: 0, draft: null, getTask: EGE.getTask });
  assert.equal(S.write(storage, build(attempt)), true);

  // Та же попытка, но с меньшим числом ответов (старая вкладка закрывается) — не записывается.
  const older = JSON.parse(JSON.stringify(attempt));
  older.answers.pop();
  assert.equal(S.write(storage, build(older)), false);
  assert.equal(S.load(storage, scope, deps(EGE)).state.attempt.answers.length, 3);

  // Та же попытка с тем же числом ответов (смена позиции, черновик) — записывается.
  assert.equal(S.write(storage, build(attempt)), true);

  // Другая попытка той же области без force — не записывается; с force (новый старт) — записывается.
  const fresh = EGE.attempt.createAttempt({ settings: attempt.settings, taskIds: attempt.taskIds });
  assert.equal(S.write(storage, build(fresh)), false);
  assert.equal(S.write(storage, build(fresh), { force: true }), true);
  assert.equal(S.load(storage, scope, deps(EGE)).state.attempt.id, fresh.id);
});

test('попытка, сохранённая в прежней редакции заданий предпросмотра, не восстанавливается', () => {
  const { toRevision1, EDITED_IDS } = require('./helpers/cognition-r2.js');
  const source = fs.readFileSync(path.join(root, 'data/preview/cognition-batch1.js'), 'utf8');
  const revision1 = toRevision1(source);
  assert.notEqual(revision1, source);

  // Ученик начал попытку на странице с редакцией 1 и ответил на первые пять заданий (в том числе COG-008).
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of CORE) vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context);
  vm.runInContext(revision1, context);
  const OLD = context.EGE;
  assert.equal(OLD.getTask('OBS-COG-008').version, undefined);
  const storage = memoryStorage();
  const settings = { section: 'preview', topic: OLD.preview.id };
  const scope = OLD.attemptSave.scopeId('preview', settings);
  const attempt = OLD.attempt.createAttempt({ settings, taskIds: OLD.preview.taskIds });
  for (const id of OLD.preview.taskIds.slice(0, 5)) OLD.attempt.recordAnswer(attempt, OLD.getTask(id), key(OLD, OLD.getTask(id)));
  saveRecord(OLD, storage, attempt, scope, { viewIndex: 5 });

  // После публикации редакции 2 эту попытку продолжить нельзя: прежние баллы не выдаются за действительные.
  const NEW = loadPreview();
  assert.ok(EDITED_IDS.every((id) => NEW.getTask(id).version === 2));
  const result = NEW.attemptSave.load(storage, scope, deps(NEW));
  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'tasks');
  assert.equal(result.message, 'задания этой тренировки с тех пор обновились.');
  assert.equal(storage.getItem(NEW.attemptSave.storageKey(scope)), null);

  // Новая попытка в редакции 2 сохраняется и восстанавливается.
  const fresh = NEW.attempt.createAttempt({ settings, taskIds: NEW.preview.taskIds });
  for (const id of NEW.preview.taskIds.slice(0, 5)) NEW.attempt.recordAnswer(fresh, NEW.getTask(id), key(NEW, NEW.getTask(id)));
  saveRecord(NEW, storage, fresh, scope, { viewIndex: 5 });
  const restored = NEW.attemptSave.load(storage, scope, deps(NEW));
  assert.equal(restored.status, 'ok');
  assert.equal(restored.state.attempt.answers[3].taskId, 'OBS-COG-008');
  assert.equal(restored.state.attempt.answers[3].taskVersion, 2);
  assert.equal(NEW.attempt.totalScore(restored.state.attempt), 9);
});
