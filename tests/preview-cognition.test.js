'use strict';

/**
 * Предпросмотр партии 1 «Познание» и «Наука и научное познание» (preview-cognition.html).
 * Проверяет, что набор перенесён полностью и без изменений ключей и что задания
 * оцениваются существующим движком. Сами задания с переходом на практикумы хранятся
 * в основном банке (data/tasks/society/cognition.js и science.js) — страница
 * подключает эти файлы и свой набор, без остального банка.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, dataScripts, loadBank, contentHash } = require('./helpers/ege.js');
const { metadataErrors, newTaskErrors } = require('./helpers/bank-rules.js');

const PREVIEW_HTML = 'preview-cognition.html';
const PREVIEW_DATA = 'data/preview/cognition-batch1.js';
const TASK_FILES = ['data/tasks/society/cognition.js', 'data/tasks/society/science.js'];

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

test('страница предпросмотра: тот же движок, только задания набора и сам набор, без остального банка', () => {
  const scripts = previewScripts();
  assert.deepEqual(scripts, ['js/registry.js', 'js/scoring.js', 'js/attempt.js', 'js/attempt-save.js',
    ...TASK_FILES, PREVIEW_DATA, 'js/task-view.js', 'js/app.js']);
  assert.ok(!scripts.includes('data/practicums.js'), 'реестр практикумов на странице предпросмотра не нужен');
  const html = fs.readFileSync(path.join(root, PREVIEW_HTML), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});

test('разметка предпросмотра не отстаёт от index.html: экраны задания и итогов, правила оценивания', () => {
  const block = (html, re) => (html.match(re) || [null])[0];
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const previewHtml = fs.readFileSync(path.join(root, PREVIEW_HTML), 'utf8');
  for (const re of [/<details class="panel rules">[\s\S]*?<\/details>/, /<section class="screen" id="screen-quiz"[\s\S]*?<\/section>/]) {
    assert.ok(block(indexHtml, re), String(re));
    assert.equal(block(previewHtml, re), block(indexHtml, re), String(re));
  }
});

test('главная страница: наборы предпросмотра не подключены, «Наука» без практикума скрыта', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!indexHtml.includes('data/preview/'), 'index.html не должен подключать data/preview/');
  assert.ok(!indexHtml.includes(PREVIEW_HTML), 'на index.html не должно быть ссылки на предпросмотр');
  assert.ok(!dataScripts.some((s) => s.includes('preview')));
  for (const file of TASK_FILES) assert.ok(dataScripts.includes(file), file);

  const EGE = loadBank();
  assert.equal(EGE.preview, undefined);
  assert.equal(EGE.getTasksByTopic('OBS-COG').length, 19);
  // Задания «Науки и научного познания» сохранены, но неполный набор не публикуется.
  assert.equal(EGE.getTasksByTopic('OBS-SCI').length, 10);
  assert.equal(EGE.getPracticumsByTopic('OBS-SCI').length, 0);
  assert.deepEqual(Array.from(EGE.getAvailableTopics('OBS'), (t) => t.id), ['OBS-ACT', 'OBS-COG', 'OBS-SCK']);
});

test('набор: ровно 20 утверждённых заданий в постоянном порядке, ключи не изменились', () => {
  const EGE = loadPreview();
  assert.deepEqual(Array.from(EGE.preview.taskIds), Object.keys(APPROVED_KEYS));
  // На странице — только задания тем «Познание» и «Наука»: 20 из набора и 9 заданий OBS-COG-031…039.
  assert.equal(EGE.tasks.length, 29);
  assert.ok(EGE.tasks.every((t) => t.topic === 'OBS-COG' || t.topic === 'OBS-SCI'));
  for (const task of tasksOf(EGE)) {
    assert.equal(EGE.scoring.getCorrect(task).join(''), APPROVED_KEYS[task.id], task.id);
    assert.ok(task.topic === 'OBS-COG' || task.topic === 'OBS-SCI', task.id);
    assert.ok(task.id.startsWith(task.topic + '-'), task.id);
  }
});

test('задания набора — те же объекты основного банка: без дублей и без расхождений', () => {
  const bank = loadBank();
  const page = loadPreview();
  for (const id of Object.keys(APPROVED_KEYS)) {
    assert.equal(bank.tasks.filter((t) => t.id === id).length, 1, `${id} в основном банке ровно один раз`);
    assert.equal(contentHash(page.getTask(id)), contentHash(bank.getTask(id)), id);
  }
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

test('баллы по системе оценивания ЕГЭ-2026: модели 1 и 3 — 1 балл, модели 2 и 4 — 2/1/0', () => {
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
      // Соответствие на позиции 3 КИМ — 1 балл только за полностью верный ответ.
      assert.equal(task.kimTask, 3);
      assert.equal(S.getScoringModel(task), 'matching-1');
      assert.equal(max, 1);
      const one = key.slice();
      one[0] = one[0] === 1 ? 2 : 1;
      assert.equal(S.scoreTask(task, one, key), 0, `${task.id}: одна неверная позиция`);
    } else {
      assert.equal(max, 2);
      assert.equal(S.scoreTask(task, key.slice(1), key), 1, `${task.id}: пропущен один верный`);
      const extra = [1, 2, 3, 4, 5, 6].slice(0, task.statements.length).find((n) => !key.includes(n));
      assert.equal(S.scoreTask(task, key.concat(extra).sort(), key), 1, `${task.id}: один лишний`);
      assert.equal(S.scoreTask(task, key.slice(1).concat(extra).sort(), key), 1, `${task.id}: одна цифра заменена другой`);
      assert.equal(S.scoreTask(task, key.slice(2).concat(extra).sort(), key), 0, `${task.id}: замена и пропуск — две ошибки`);
    }
  }
});

test('попытка предпросмотра: все 20 заданий по порядку, итог 34 из 34', () => {
  const EGE = loadPreview();
  const A = EGE.attempt;
  const attempt = A.createAttempt({ settings: { section: 'preview', topic: EGE.preview.id }, taskIds: EGE.preview.taskIds });
  assert.equal(A.maxScore(attempt, EGE.getTask), 34); // 1 + 5 × 1 + 14 × 2
  for (const task of tasksOf(EGE)) A.recordAnswer(attempt, task, Array.from(EGE.scoring.getCorrect(task)));
  assert.ok(A.isComplete(attempt));
  assert.equal(A.totalScore(attempt), 34);
  assert.equal(A.mistakeIndexes(attempt).length, 0);
});

/* ---------- Редакция 2: согласованные формулировки (tests/helpers/cognition-r2.js) ---------- */

const { EDITS, EDITED_IDS } = require('./helpers/cognition-r2.js');

test('редакция 2: семь позиций содержат согласованные формулировки, правильность не изменилась', () => {
  const EGE = loadPreview();
  const source = fs.readFileSync(path.join(root, PREVIEW_DATA), 'utf8');
  assert.equal(EDITS.length, 7);
  for (const e of EDITS) {
    const task = EGE.getTask(e.id);
    const part = (task.statements || task.items)[e.position - 1];
    assert.equal(part.text, e.after, `${e.id}, позиция ${e.position}`);
    if (e.match !== undefined) assert.equal(part.match, e.match, `${e.id}: категория соответствия`);
    else assert.equal(part.correct, e.correct, `${e.id}: правильность суждения`);
    assert.ok(!source.includes(e.before), `${e.id}: прежняя формулировка осталась в данных`);
    assert.doesNotMatch(part.text, /например/i, `${e.id}: пример — в объяснении, а не в суждении`);
  }
});

test('редакция 2: номер редакции только у изменённых заданий, ID и порядок прежние', () => {
  const EGE = loadPreview();
  for (const task of tasksOf(EGE)) {
    assert.equal(task.version || 1, EDITED_IDS.includes(task.id) ? 2 : 1, task.id);
  }
  assert.deepEqual(Array.from(EGE.preview.taskIds), Object.keys(APPROVED_KEYS));
});

test('редакция 2: объяснения соответствуют новым формулировкам', () => {
  const EGE = loadPreview();
  const expl = (id, n) => (EGE.getTask(id).statements || EGE.getTask(id).items)[n - 1].explanation;
  assert.match(expl('OBS-COG-008', 1), /^Верно\./);
  assert.match(expl('OBS-COG-008', 1), /оптических иллюзиях/);
  assert.match(expl('OBS-COG-008', 3), /^Верно\./);
  assert.match(expl('OBS-COG-008', 3), /ультразвук/);
  assert.match(expl('OBS-COG-016', 4), /^Верно\./);
  assert.match(expl('OBS-COG-016', 4), /не только принадлежностью к научному познанию/);
  assert.match(expl('OBS-COG-016', 4), /систематизаци/);
  assert.match(expl('OBS-COG-025', 3), /^Верно\./);
  assert.match(expl('OBS-COG-025', 3), /остаётся истинным для своих условий/);
  assert.match(expl('OBS-COG-025', 3), /неприменимым/);
  assert.match(expl('OBS-COG-028', 3), /^Неверно\./);
  assert.match(expl('OBS-COG-028', 3), /не является практическим подтверждением/);
  assert.match(expl('OBS-COG-028', 3), /не заменяет эмпирическую проверку/);
  assert.match(expl('OBS-COG-017', 5), /^Научное знание\./);
  assert.match(expl('OBS-COG-017', 5), /важное требование научного исследования/);
  assert.match(expl('OBS-COG-017', 5), /сопоставимых условиях/);
  assert.match(expl('OBS-COG-025', 5), /^Верно\./);
  assert.match(expl('OBS-COG-025', 5), /исторического контекста/);
  assert.match(expl('OBS-COG-025', 5), /а не об их нравственной оценке/);
});

test('OBS-COG-025: суждения 1–4 прежние, ключ 135, повтора между суждениями 1, 3 и 5 нет', () => {
  const EGE = loadPreview();
  const task = EGE.getTask('OBS-COG-025');
  assert.equal(task.question, 'Выберите верные суждения о конкретности истины.');
  assert.deepEqual(Array.from(task.statements, (s) => s.text), [
    'Конкретность истины означает, что истинность знания зависит от условий места и времени, к которым оно относится.',
    'Конкретность истины означает, что каждый человек сам решает, что для него истинно.',
    'Знание, истинное в одних условиях, может оказаться неприменимым в других условиях.',
    'Конкретность истины несовместима с её объективностью.',
    'Принцип конкретности истины предполагает учёт исторических условий при познании общественных явлений и процессов.'
  ]);
  assert.equal(EGE.scoring.getCorrect(task).join(''), '135');
  assert.ok(!task.statements.some((s) => /границах|Научные положения/.test(s.text)), 'прежнее суждение 5 удалено');
});
