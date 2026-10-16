'use strict';

/**
 * Предпросмотр «Познание» — предварительный банк из 19 заданий (preview-poznanie.html):
 * десять утверждённых заданий из data/preview/cognition-batch1.js и девять новых
 * (data/preview/cognition-poznanie.js). Состав, порядок, ключи, согласованные
 * формулировки, оценивание и изоляция от основного каталога и предпросмотра из 20 заданий.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, loadBank } = require('./helpers/ege.js');
const { metadataErrors, newTaskErrors } = require('./helpers/bank-rules.js');

const PAGE = 'preview-poznanie.html';
const DATA = 'data/preview/cognition-poznanie.js';

const APPROVED = ['OBS-COG-002', 'OBS-COG-003', 'OBS-COG-006', 'OBS-COG-008', 'OBS-COG-016',
  'OBS-COG-017', 'OBS-COG-019', 'OBS-COG-025', 'OBS-COG-026', 'OBS-COG-028'];
const NEW = ['OBS-COG-031', 'OBS-COG-032', 'OBS-COG-033', 'OBS-COG-034', 'OBS-COG-035',
  'OBS-COG-036', 'OBS-COG-037', 'OBS-COG-038', 'OBS-COG-039'];

/** Согласованный тематический порядок и ключи (редакционное согласование, третий круг). */
const ORDER_AND_KEYS = [
  ['OBS-COG-031', '134'], ['OBS-COG-002', '12331'],
  ['OBS-COG-032', '235'], ['OBS-COG-008', '135'], ['OBS-COG-033', '13231'],
  ['OBS-COG-003', '134'], ['OBS-COG-034', '145'], ['OBS-COG-035', '234'], ['OBS-COG-039', '21321'], ['OBS-COG-019', '14323'],
  ['OBS-COG-016', '245'], ['OBS-COG-017', '12332'],
  ['OBS-COG-036', '124'],
  ['OBS-COG-037', '125'], ['OBS-COG-025', '135'], ['OBS-COG-026', '246'], ['OBS-COG-006', '135'], ['OBS-COG-038', '24'], ['OBS-COG-028', '16']
];

function pageScripts(page) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
}

function loadPage(page = PAGE) {
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of pageScripts(page).filter((s) => !['js/task-view.js', 'js/app.js'].includes(s))) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

const tasksOf = (EGE) => Array.from(EGE.preview.taskIds, (id) => EGE.getTask(id));
const keyOf = (EGE, task) => EGE.scoring.getCorrect(task).join('');
const parts = (task) => task.statements || task.items;

test('страница: тот же движок, утверждённые задания и новый набор, без основного банка', () => {
  assert.deepEqual(pageScripts(PAGE), ['js/registry.js', 'js/scoring.js', 'js/attempt.js', 'js/attempt-save.js',
    'data/preview/cognition-batch1.js', DATA, 'js/task-view.js', 'js/app.js']);
  assert.match(fs.readFileSync(path.join(root, PAGE), 'utf8'), /<meta name="robots" content="noindex, nofollow">/);
});

test('основной каталог и предпросмотр из 20 заданий не затронуты', () => {
  for (const page of ['index.html', 'preview-cognition.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.ok(!html.includes(DATA), `${page} не подключает новый набор`);
    assert.ok(!html.includes(PAGE), `${page} не ссылается на новую страницу`);
  }
  const main = loadBank();
  assert.ok(main.tasks.every((t) => !t.id.startsWith('OBS-COG')));
  const twenty = loadPage('preview-cognition.html');
  assert.equal(twenty.preview.id, 'cognition-batch1');
  assert.equal(twenty.preview.taskIds.length, 20);
  assert.equal(twenty.tasks.length, 20);
});

test('состав: 19 заданий в тематическом порядке — 10 утверждённых и 9 новых, ключи согласованы', () => {
  const EGE = loadPage();
  assert.equal(EGE.preview.id, 'poznanie-19');
  assert.deepEqual(Array.from(EGE.preview.taskIds), ORDER_AND_KEYS.map(([id]) => id));
  assert.equal(new Set(EGE.preview.taskIds).size, 19, 'ID не повторяются');
  assert.deepEqual([...EGE.preview.taskIds].filter((id) => APPROVED.includes(id)).sort(), APPROVED);
  assert.deepEqual([...EGE.preview.taskIds].filter((id) => NEW.includes(id)).sort(), NEW);
  for (const [id, key] of ORDER_AND_KEYS) assert.equal(keyOf(EGE, EGE.getTask(id)), key, id);
});

test('новые ID не заняты: ни в основном банке, ни в предпросмотре из 20 заданий', () => {
  const taken = new Set([...loadBank().tasks, ...loadPage('preview-cognition.html').tasks].map((t) => t.id));
  for (const id of NEW) assert.ok(!taken.has(id), id);
});

test('утверждённые задания берутся из cognition-batch1.js, новый файл их не переопределяет', () => {
  const source = fs.readFileSync(path.join(root, DATA), 'utf8');
  for (const id of APPROVED) assert.ok(!source.includes(`id: '${id}'`), `${id} не должен определяться в ${DATA}`);
  const twenty = loadPage('preview-cognition.html');
  const nineteen = loadPage();
  for (const id of APPROVED) {
    assert.deepEqual(JSON.parse(JSON.stringify(nineteen.getTask(id))), JSON.parse(JSON.stringify(twenty.getTask(id))), id);
  }
});

test('модели и баллы по системе оценивания ЕГЭ-2026: 14 × 2 + 5 соответствий × 1 = 33', () => {
  const EGE = loadPage();
  const S = EGE.scoring;
  const tasks = tasksOf(EGE);
  assert.equal(tasks.filter((t) => S.getTaskType(t) === 'multiple').length, 14);
  const matching = tasks.filter((t) => S.getTaskType(t) === 'matching');
  assert.deepEqual(matching.map((t) => t.id), ['OBS-COG-002', 'OBS-COG-033', 'OBS-COG-039', 'OBS-COG-019', 'OBS-COG-017']);
  assert.ok(matching.every((t) => t.kimTask === 3 && S.getMaxPoints(t) === 1));
  const A = EGE.attempt;
  const attempt = A.createAttempt({ settings: { section: 'preview', topic: EGE.preview.id }, taskIds: EGE.preview.taskIds });
  assert.equal(A.maxScore(attempt, EGE.getTask), 33);
  for (const task of tasks) A.recordAnswer(attempt, task, Array.from(S.getCorrect(task)));
  assert.equal(A.totalScore(attempt), 33);
});

test('новые задания: схема банка, формат ЕГЭ, объяснение у каждого варианта', () => {
  const EGE = loadPage();
  for (const id of NEW) {
    const task = EGE.getTask(id);
    assert.deepEqual(metadataErrors(EGE, task), [], id);
    assert.deepEqual(newTaskErrors(EGE, task), [], id);
    assert.equal(parts(task).length, 5, `${id}: пять вариантов`);
    if (task.type === 'matching') {
      // Объяснение начинается с названия формы, к которой отнесена позиция.
      task.items.forEach((item, i) => {
        const option = task.options[item.match - 1];
        assert.ok(item.explanation.startsWith(option[0].toUpperCase() + option.slice(1) + '.'), `${id}, позиция ${i + 1}`);
      });
    }
  }
});

test('ключи разнообразны: ни одного одинакового ключа в соседних заданиях, 135 — не чаще трёх раз', () => {
  const EGE = loadPage();
  const keys = tasksOf(EGE).map((t) => keyOf(EGE, t));
  for (let i = 1; i < keys.length; i++) {
    assert.notEqual(keys[i], keys[i - 1], `задания ${i} и ${i + 1}`);
  }
  assert.ok(keys.filter((k) => k === '135').length <= 3);
});

test('согласованные формулировки и порядок вариантов новых заданий', () => {
  const EGE = loadPage();
  const text = (id, n) => parts(EGE.getTask(id))[n - 1].text;
  // OBS-COG-033: два примера заменены.
  assert.equal(text('OBS-COG-033', 3), 'Посетитель музея видит картину целиком, различая изображённые на ней фигуры и предметы.');
  assert.equal(text('OBS-COG-033', 4), 'Знакомая мелодия продолжала звучать в памяти человека после окончания концерта.');
  assert.deepEqual(Array.from(EGE.getTask('OBS-COG-033').options), ['ощущение', 'восприятие', 'представление']);
  assert.deepEqual(Array.from(EGE.getTask('OBS-COG-039').options), ['понятие', 'суждение', 'умозаключение']);
  // OBS-COG-035: неполная индукция «не гарантирует», без «только полная индукция».
  const induction = parts(EGE.getTask('OBS-COG-035')).find((s) => s.text.startsWith('Любое индуктивное'));
  assert.match(induction.explanation, /не гарантирует достоверности/);
  assert.doesNotMatch(induction.explanation, /только полная индукция/);
  // OBS-COG-036: скептицизм и агностицизм.
  assert.equal(text('OBS-COG-036', 2), 'Скептицизм выражается в сомнении в возможности получения достоверного знания.');
  assert.equal(text('OBS-COG-036', 4), 'Агностицизм ограничивает возможности достоверного познания мира, прежде всего его сущности.');
  assert.equal(text('OBS-COG-036', 5), 'Агностицизм отрицает существование мира, независимого от сознания человека.');
  // OBS-COG-037: абсолютная истина и её элементы.
  const absolute = parts(EGE.getTask('OBS-COG-037'))[4];
  assert.equal(absolute.text, 'Абсолютная истина включает достоверно установленные положения, которые не могут быть опровергнуты дальнейшим развитием познания.');
  assert.match(absolute.explanation, /исчерпывающее знание/);
  assert.match(absolute.explanation, /её элементы/);
  // OBS-COG-038: третья редакция с двумя последними правками.
  assert.equal(text('OBS-COG-038', 2), 'Практика позволяет проверять истинность знаний посредством их применения в деятельности человека.');
  assert.equal(text('OBS-COG-038', 4), 'Возможности практики как критерия истины исторически ограничены.');
  const untested = parts(EGE.getTask('OBS-COG-038'))[4];
  assert.match(untested.explanation, /само по себе не доказывает ложность знания/);
  assert.doesNotMatch(untested.explanation, /остаётся гипотезой/);
  // OBS-COG-038 не дублирует OBS-COG-028: нет мнения большинства, авторитета, логической стройности, рекламы.
  for (const s of parts(EGE.getTask('OBS-COG-038'))) {
    assert.doesNotMatch(s.text, /большинств|распространени|авторитет|непротиворечив|реклам/i, s.text);
  }
  // В формулировках вариантов нет примеров через «например» (примеры — в объяснениях).
  for (const id of NEW) for (const s of parts(EGE.getTask(id))) assert.doesNotMatch(s.text, /например/i, id);
});

test('перестановка вариантов в 032, 034, 035, 037: объяснения стоят у своих вариантов', () => {
  const EGE = loadPage();
  const expectations = {
    'OBS-COG-032': [false, true, true, false, true],
    'OBS-COG-034': [true, false, false, true, true],
    'OBS-COG-035': [false, true, true, true, false],
    'OBS-COG-037': [true, true, false, false, true]
  };
  for (const [id, flags] of Object.entries(expectations)) {
    parts(EGE.getTask(id)).forEach((s, i) => {
      assert.equal(s.correct, flags[i], `${id}, суждение ${i + 1}`);
      assert.ok(s.explanation.startsWith(s.correct ? 'Верно.' : 'Неверно.'), `${id}, суждение ${i + 1}: объяснение`);
    });
  }
  // Объяснение относится именно к своему суждению (ключевые слова).
  const pairs = [
    ['OBS-COG-032', 1, /условие чувственного познания/], ['OBS-COG-032', 4, /Целостный образ — это восприятие/],
    ['OBS-COG-034', 3, /формы мышления/], ['OBS-COG-034', 4, /Языковая форма понятия/],
    ['OBS-COG-035', 1, /Это дедукция/], ['OBS-COG-035', 5, /Неполная индукция/],
    ['OBS-COG-037', 4, /иначе она была бы заблуждением/], ['OBS-COG-037', 5, /её элементы/]
  ];
  for (const [id, n, re] of pairs) assert.match(parts(EGE.getTask(id))[n - 1].explanation, re, `${id}, ${n}`);
});

test('редакционные правки PR #21: объяснения 032 (суждение 2) и 038 (суждение 5)', () => {
  const EGE = loadPage();
  const sensory = parts(EGE.getTask('OBS-COG-032'))[1];
  assert.equal(sensory.text, 'Чувственное познание позволяет получать информацию об отдельных свойствах и внешних признаках предметов.');
  assert.match(sensory.explanation, /Выявление существенных причинно-следственных связей и закономерностей связано прежде всего с рациональным познанием\.$/);
  assert.doesNotMatch(sensory.explanation, /не раскрывает/);
  assert.equal(parts(EGE.getTask('OBS-COG-038'))[4].explanation,
    'Неверно. Отсутствие практической проверки само по себе не доказывает ложность знания. Возможности такой проверки зависят от исторического уровня развития практики.');
  assert.doesNotMatch(fs.readFileSync(path.join(root, DATA), 'utf8'), /об атомах|атомист|не было ложным/);
});

test('правила оценивания на странице соответствуют типам заданий набора', () => {
  const EGE = loadPage();
  const S = EGE.scoring;
  const html = fs.readFileSync(path.join(root, PAGE), 'utf8');
  const rules = html.match(/<details class="panel rules rules--set">[\s\S]*?<\/details>/)[0];
  const models = new Set(tasksOf(EGE).map((t) => S.getScoringModel(t)));
  assert.deepEqual([...models].sort(), ['matching-1', 'multiple'], 'в наборе только суждения и соответствие модели 3');
  // Нерелевантное для набора не упоминается: «два лишних термина» и соответствие на 2 балла.
  assert.doesNotMatch(rules, /выпадающих|два термина/);
  assert.doesNotMatch(rules, /одна ошибка — 1, две и более — 0/);
  // Есть объяснение обеих моделей и итог набора.
  assert.match(rules, /Задания с выбором верных суждений<\/strong> — максимум 2 балла/);
  assert.match(rules, /модель задания 3 ЕГЭ\) — максимум 1 балл/);
  assert.match(rules, /1 балл — только если все позиции указаны верно/);
  const max = tasksOf(EGE).reduce((sum, t) => sum + S.getMaxPoints(t), 0);
  assert.match(rules, new RegExp(`всего ${max} балла`));
  const counts = [...models].map((m) => tasksOf(EGE).filter((t) => S.getScoringModel(t) === m).length);
  assert.match(rules, new RegExp(`${counts[[...models].indexOf('multiple')]} заданий с выбором суждений и ${counts[[...models].indexOf('matching-1')]} заданий на соответствие`));
  // Экраны задания и итогов совпадают с основным тренажёром.
  const quiz = (h) => h.match(/<section class="screen" id="screen-quiz"[\s\S]*?<\/section>/)[0];
  assert.equal(quiz(html), quiz(fs.readFileSync(path.join(root, 'index.html'), 'utf8')));
});
