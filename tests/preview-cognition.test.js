'use strict';

/**
 * Предпросмотр партии 1 «Познание» и «Научное познание» (preview-cognition.html).
 * Проверяет, что набор перенесён полностью и без изменений ключей, что задания
 * оцениваются существующим движком и что основной каталог (index.html) не затронут.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, dataScripts, loadBank } = require('./helpers/ege.js');
const { metadataErrors, newTaskErrors } = require('./helpers/bank-rules.js');

const PREVIEW_HTML = 'preview-cognition.html';
const PREVIEW_DATA = 'data/preview/cognition-batch1.js';

/** Ключи партии 1, утверждённые автором (docs/drafts/cognition/stage-1-2.md, редакция 8). */
const APPROVED_KEYS = {
  'OBS-COG-002': '12331', 'OBS-COG-003': '134', 'OBS-COG-006': '135', 'OBS-COG-008': '135',
  'OBS-COG-016': '245', 'OBS-COG-017': '12332', 'OBS-COG-019': '14323', 'OBS-COG-025': '135',
  'OBS-COG-026': '246', 'OBS-COG-028': '16',
  'OBS-SCI-004': '125', 'OBS-SCI-007': '346', 'OBS-SCI-010': '12312', 'OBS-SCI-013': '235',
  'OBS-SCI-016': '21321', 'OBS-SCI-017': '134', 'OBS-SCI-025': '134', 'OBS-SCI-027': '245',
  'OBS-SCI-029': '35', 'OBS-SCI-030': '245'
};

/** Скрипты страницы предпросмотра в порядке подключения. */
function previewScripts() {
  const html = fs.readFileSync(path.join(root, PREVIEW_HTML), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
}

function loadPreview() {
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of previewScripts().filter((s) => !['js/task-view.js', 'js/app.js'].includes(s))) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

const tasksOf = (EGE) => EGE.preview.taskIds.map((id) => EGE.getTask(id));

test('страница предпросмотра: тот же движок, только набор предпросмотра, без основного банка', () => {
  const scripts = previewScripts();
  assert.deepEqual(scripts, ['js/registry.js', 'js/scoring.js', 'js/attempt.js', PREVIEW_DATA, 'js/task-view.js', 'js/app.js']);
  const html = fs.readFileSync(path.join(root, PREVIEW_HTML), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});

test('основной каталог не затронут: index.html не подключает предпросмотр, темы без заданий скрыты', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!indexHtml.includes('data/preview/'), 'index.html не должен подключать data/preview/');
  assert.ok(!indexHtml.includes(PREVIEW_HTML), 'на index.html не должно быть ссылки на предпросмотр');
  assert.ok(!dataScripts.some((s) => s.includes('preview')));

  const EGE = loadBank();
  assert.equal(EGE.preview, undefined);
  assert.equal(EGE.getTasksByTopic('OBS-COG').length, 0);
  assert.equal(EGE.getTasksByTopic('OBS-SCI').length, 0);
  assert.deepEqual(Array.from(EGE.getAvailableTopics('OBS'), (t) => t.id), ['OBS-GEN', 'OBS-ACT']);
  assert.ok(EGE.tasks.every((t) => !t.id.startsWith('OBS-COG') && !t.id.startsWith('OBS-SCI')));
});

test('набор: ровно 20 утверждённых заданий в постоянном порядке, ключи не изменились', () => {
  const EGE = loadPreview();
  assert.deepEqual(Array.from(EGE.preview.taskIds), Object.keys(APPROVED_KEYS));
  assert.equal(EGE.tasks.length, 20, 'на странице предпросмотра нет других заданий');
  for (const task of tasksOf(EGE)) {
    assert.equal(EGE.scoring.getCorrect(task).join(''), APPROVED_KEYS[task.id], task.id);
    assert.ok(task.topic === 'OBS-COG' || task.topic === 'OBS-SCI', task.id);
    assert.ok(task.id.startsWith(task.topic + '-'), task.id);
  }
});

test('ID набора не пересекаются с основным банком', () => {
  const bank = new Set(loadBank().tasks.map((t) => t.id));
  for (const id of Object.keys(APPROVED_KEYS)) assert.ok(!bank.has(id), id);
});

test('все четыре модели КИМ представлены и отображаются существующими типами', () => {
  const EGE = loadPreview();
  const byModel = {};
  for (const task of tasksOf(EGE)) {
    (byModel[task.kimTask] = byModel[task.kimTask] || []).push(task);
  }
  assert.deepEqual(Object.keys(byModel).sort(), ['1', '2', '3', '4']);
  const typeOf = (t) => EGE.scoring.getTaskType(t);
  assert.ok(byModel[1].every((t) => typeOf(t) === 'exclude-two'));
  assert.ok(byModel[2].every((t) => typeOf(t) === 'multiple' && t.choiceOf === undefined));
  assert.ok(byModel[3].every((t) => typeOf(t) === 'matching'));
  assert.ok(byModel[4].every((t) => typeOf(t) === 'multiple' && t.choiceOf === 'items'));
  assert.deepEqual(Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, v.length])),
    { 1: 1, 2: 9, 3: 5, 4: 5 });
});

test('схема 2 банка: метаданные, формат ЕГЭ и объяснения каждого варианта', () => {
  const EGE = loadPreview();
  for (const task of tasksOf(EGE)) {
    assert.deepEqual(metadataErrors(EGE, task), [], task.id);
    assert.deepEqual(newTaskErrors(EGE, task), [], task.id);
    assert.equal(task.draft, undefined, `${task.id}: служебное поле draft не переносится`);
  }
});

test('заключительные редакционные уточнения COG-006 и COG-028 внесены', () => {
  const EGE = loadPreview();
  const cog006 = EGE.getTask('OBS-COG-006').statements[5];
  assert.equal(cog006.correct, false);
  assert.match(cog006.explanation, /дало закону теоретическое объяснение/);
  assert.match(cog006.explanation, /формулировка закона была уточнена/);
  assert.match(cog006.explanation, /не опровергло закономерность/);

  const cog028 = EGE.getTask('OBS-COG-028').statements[5];
  assert.equal(cog028.correct, true);
  assert.match(cog028.explanation, /позволяет надёжнее оценить его действие/);
  assert.match(cog028.explanation, /такие различия нужно учитывать/);
  assert.doesNotMatch(cog028.explanation, /исключ/);
});

test('баллы по правилам движка: верный ответ — максимум, одна ошибка — 1, две — 0', () => {
  const EGE = loadPreview();
  const S = EGE.scoring;
  for (const task of tasksOf(EGE)) {
    const key = Array.from(S.getCorrect(task));
    const max = S.getMaxPoints(task);
    assert.equal(S.scoreTask(task, key, key), max, `${task.id}: верный ответ`);

    if (S.getTaskType(task) === 'exclude-two') {
      assert.equal(max, 1);
      const wrong = [1, 2, 3, 4, 5, 6].find((n) => !key.includes(n));
      assert.equal(S.scoreTask(task, [key[0], wrong], key), 0, `${task.id}: одна ошибка`);
    } else if (S.getTaskType(task) === 'matching') {
      assert.equal(max, 2);
      const one = key.slice();
      one[0] = one[0] === 1 ? 2 : 1;
      assert.equal(S.scoreTask(task, one, key), 1, `${task.id}: одна неверная позиция`);
      const two = one.slice();
      two[1] = two[1] === 1 ? 2 : 1;
      assert.equal(S.scoreTask(task, two, key), 0, `${task.id}: две неверные позиции`);
    } else {
      assert.equal(max, 2);
      assert.equal(S.scoreTask(task, key.slice(1), key), 1, `${task.id}: пропущен один верный`);
      const extra = [1, 2, 3, 4, 5, 6].slice(0, task.statements.length).find((n) => !key.includes(n));
      assert.equal(S.scoreTask(task, key.concat(extra).sort(), key), 1, `${task.id}: один лишний`);
      assert.equal(S.scoreTask(task, key.slice(1).concat(extra).sort(), key), 0, `${task.id}: замена (две ошибки по правилам движка)`);
    }
  }
});

test('попытка предпросмотра: все 20 заданий по порядку, итог 39 из 39', () => {
  const EGE = loadPreview();
  const A = EGE.attempt;
  const attempt = A.createAttempt({ settings: { section: 'preview', topic: EGE.preview.id }, taskIds: EGE.preview.taskIds });
  assert.equal(A.maxScore(attempt, EGE.getTask), 39);
  for (const task of tasksOf(EGE)) A.recordAnswer(attempt, task, Array.from(EGE.scoring.getCorrect(task)));
  assert.ok(A.isComplete(attempt));
  assert.equal(A.totalScore(attempt), 39);
  assert.equal(A.mistakeIndexes(attempt).length, 0);
});
