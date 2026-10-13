'use strict';

/**
 * «Начать заново» для тренажёра «Классификация правовых норм» (LAW-NKL).
 *
 * Повторное прохождение разрешает настройка темы allowRestart, а не attemptPolicy трека:
 * правило одной попытки для LAW-CPT и других тем практикума не меняется. Сброс удаляет из
 * хранилища попытку только LAW-NKL. Поведение интерфейса (кнопка, подтверждение, отмена,
 * новая попытка) проверяет браузерный сценарий tests/e2e/law-nkl-restart.e2e.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadBank, loadCore, defineCatalog } = require('./helpers/olymp.js');

const root = path.join(__dirname, '..');
const PAGE = 'olympiad-nrm-simple.html';
const NKL = { olympiad: 'PR', subject: 'social', discipline: 'LAW', topic: 'LAW-NKL' };
const CPT = { olympiad: 'PR', subject: 'social', discipline: 'LAW', topic: 'LAW-CPT' };
const CONFIRM_TEXT = 'Все ответы и баллы текущей попытки будут удалены. Начать заново?';

function memoryBackend() {
  const data = {};
  return {
    data,
    read: (key) => (key in data ? JSON.parse(data[key]) : null),
    write: (key, value) => { data[key] = JSON.stringify(value); }
  };
}

/** Попытка по всей теме в учебном порядке, как её начинает интерфейс. */
function start(OLY, scope) {
  const tasks = OLY.ui.session.arrange('PR', OLY.ui.filters.buildPool(scope, {}));
  return OLY.attempt.createAttempt({
    mode: 'practice', olympiad: 'PR', subject: 'social',
    settings: { discipline: scope.discipline, topic: scope.topic, filters: {} },
    taskIds: tasks.map((t) => t.id)
  });
}

test('allowRestart задана только у LAW-NKL; общее правило трека PR прежнее', () => {
  const OLY = loadBank(PAGE);
  assert.equal(OLY.getTopic('social', 'LAW-NKL').allowRestart, true);
  for (const id of ['LAW-CPT', 'LAW-NRM', 'LAW-NRA', 'LAW-NRB', 'LAW-NRC', 'LAW-NRD']) {
    assert.equal(OLY.getTopic('social', id).allowRestart, undefined, id);
  }
  const policy = OLY.getAttemptPolicy('PR');
  assert.equal(policy.allowRetake, false);
  assert.equal(policy.allowRetryMistakes, false);
  assert.equal(policy.allowRetrySkipped, false);
});

test('реестр принимает allowRestart только как true / false', () => {
  const OLY = loadCore();
  defineCatalog(OLY);
  assert.throws(() => OLY.defineSubject({
    id: 'law-test', title: 'Право (тест)',
    disciplines: [{ id: 'LAW', title: 'Право', topics: [{ id: 'LAW-XYZ', title: 'Тема', allowRestart: 'да' }] }]
  }), /allowRestart должно быть true или false/);
});

test('canRestart: только для темы с allowRestart и только после полного завершения', () => {
  const OLY = loadBank(PAGE);
  const P = OLY.ui.progress;
  const nkl = OLY.getTopic('social', 'LAW-NKL');
  const cpt = OLY.getTopic('social', 'LAW-CPT');
  const attempt = start(OLY, NKL);
  assert.equal(P.canRestart(nkl, null), false, 'попытки нет');
  assert.equal(P.canRestart(nkl, attempt), false, 'попытка начата, но не завершена');
  OLY.attempt.finish(attempt);
  assert.equal(P.canRestart(nkl, attempt), true, 'попытка завершена');

  const other = start(OLY, CPT);
  OLY.attempt.finish(other);
  assert.equal(P.canRestart(cpt, other), false, 'LAW-CPT: повтор по-прежнему запрещён');
  assert.equal(P.canStartNew(OLY.getAttemptPolicy('PR'), other), false);
});

test('сброс удаляет только попытку LAW-NKL: LAW-CPT и другие записи хранилища сохраняются', () => {
  const OLY = loadBank(PAGE);
  const backend = memoryBackend();
  const store = OLY.ui.progress.createStore(backend);
  const nkl = start(OLY, NKL);
  const cpt = start(OLY, CPT);
  OLY.attempt.finish(nkl);
  store.save(NKL, nkl);
  store.save(CPT, cpt);
  // Посторонняя запись другой страницы (например, рабочего банка LAW-NRM) — тоже не трогаем.
  const all = backend.read(OLY.ui.progress.STORAGE_KEY);
  all['PR/LAW/LAW-NRM'] = { marker: 'другая тема' };
  backend.write(OLY.ui.progress.STORAGE_KEY, all);

  store.remove(NKL);
  const after = backend.read(OLY.ui.progress.STORAGE_KEY);
  assert.deepEqual(Object.keys(after).sort(), ['PR/LAW/LAW-CPT', 'PR/LAW/LAW-NRM']);
  assert.equal(store.load(NKL), null);
  assert.deepEqual(store.load(CPT).taskIds, cpt.taskIds);
  assert.deepEqual(after['PR/LAW/LAW-NRM'], { marker: 'другая тема' });

  // Новая попытка после сброса: тему можно начать с нуля.
  assert.equal(OLY.ui.progress.canStartNew(OLY.getAttemptPolicy('PR'), store.load(NKL)), true);
  // Повторное удаление и недоступное хранилище не приводят к ошибке.
  store.remove(NKL);
  OLY.ui.progress.createStore({ read() { throw new Error('нет доступа'); }, write() { throw new Error('нет доступа'); } }).remove(NKL);
});

test('разметка итогового экрана: кнопка «Начать заново» и подтверждение — скрыты по умолчанию, на всех страницах', () => {
  for (const page of ['olympiad.html', 'olympiad-demo.html', 'olympiad-work.html', PAGE]) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<button type="button" class="btn btn--ghost btn--lg" id="restart-btn" hidden>Начать заново<\/button>/, page);
    assert.match(html, /<div class="exit-bar" id="restart-bar" role="alertdialog" aria-labelledby="restart-text" hidden>/, page);
    assert.ok(html.includes('<p class="exit-bar__text" id="restart-text">' + CONFIRM_TEXT + '</p>'), page);
    assert.match(html, /id="restart-cancel">Отмена<\/button>/, page);
    assert.match(html, /id="restart-ok">Начать заново<\/button>/, page);
  }
});
