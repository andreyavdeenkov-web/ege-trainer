'use strict';

/**
 * Оценка доводов (argument-check) и составное задание (compound) практикума «Норма права»:
 * независимые решения о правильности и связи с выводом, ½ за неверное основание
 * неправильности, равноправные интерпретации; поэтапное раскрытие частей,
 * запрет ответов на неоткрытые части, баллы по частям, попытка и восстановление.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadCore, loadBank } = require('./helpers/olymp.js');

const root = path.join(__dirname, '..');

function loadCoreTypes() {
  const OLY = loadCore();
  for (const src of ['nrm-rows', 'short-answer', 'argument-check', 'compound'].map((t) => 'js/olymp/types/' + t + '.js').concat('js/olymp/rules/components.js')) {
    const code = fs.readFileSync(path.join(root, src), 'utf8');
    vm.runInThisContext('(function (window, globalThis) {\n' + code + '\n})', { filename: src })(undefined, { OLY });
  }
  OLY.defineSubject({
    id: 'social', title: 'Обществознание',
    disciplines: [{ id: 'LAW', title: 'Право', sections: [{ id: 'theory', title: 'Теория права' }], topics: [
      { id: 'LAW-NRM', title: 'Норма права', section: 'theory', blocks: [{ id: 'b', title: 'Блок' }] }
    ] }]
  });
  OLY.defineOlympiad({ id: 'TPR', kind: 'practicum', title: 'Тестовый практикум', subjects: ['social'] });
  return OLY;
}

const BASE = { olympiad: 'TPR', subject: 'social', discipline: 'LAW', section: 'theory', topic: 'LAW-NRM', block: 'b', order: 1, level: 3, tags: ['т'], question: 'Вопрос.', explanation: 'Разбор.' };

function arg(id, truth, link, extra) {
  const wrong = { truth: {}, link: {} };
  [0, 1, 2].forEach((i) => { if (i !== truth) wrong.truth[i] = 'правильность ' + i; });
  [0, 1, 2, 3].forEach((i) => { if (i !== link) wrong.link[i] = 'связь ' + i; });
  return Object.assign({ id, text: 'Довод ' + id, key: { truth, link }, wrong, explanation: 'разбор ' + id }, extra || {});
}

function argTask(overrides) {
  return Object.assign({}, BASE, {
    id: 'TPR-LAW-NRM-995', type: 'argument-check',
    issue: 'Норма ли это?', conclusion: 'Это не норма.',
    arguments: [arg('a', 0, 0), arg('b', 1, 2), arg('c', 0, 1, { linkAlt: [3], interpretations: 'граница спорна' })],
    scoring: { maxPoints: 6, rule: 'components', basis: 'author' }
  }, overrides || {});
}

function register(task) {
  const OLY = loadCoreTypes();
  OLY.addTasks([task]);
  return { OLY, task: OLY.getTask(task.id), type: OLY.types.get(task.type) };
}

/* ---------- argument-check ---------- */

test('argument-check: правильность и связь — независимые баллы; ½ за неверное основание неправильности', () => {
  const { OLY, task, type } = register(argTask());
  let g = OLY.grade.gradeTask(task, type.getCorrect(task));
  assert.equal(g.verdict, 'correct');
  assert.equal(g.points, 6);
  // b: неверен по фактам, а ученик — «неверен по праву»: ½; связь верна — 1.
  g = OLY.grade.gradeTask(task, { a: { t: 0, l: 0 }, b: { t: 2, l: 2 }, c: { t: 0, l: 1 } });
  assert.deepEqual([g.details.arguments.b.truth, g.details.arguments.b.truthPoints, g.details.arguments.b.linkPoints], ['partial', 0.5, 1]);
  assert.equal(g.points, 5.5);
  // Ошибка в правильности не снимает балл за связь.
  g = OLY.grade.gradeTask(task, { a: { t: 1, l: 0 }, b: { t: 1, l: 2 }, c: { t: 0, l: 1 } });
  assert.deepEqual([g.details.arguments.a.truthPoints, g.details.arguments.a.linkPoints], [0, 1]);
  assert.equal(g.points, 5);
  // «Верен» вместо «неверен» — 0 без частичного балла.
  g = OLY.grade.gradeTask(task, { a: { t: 0, l: 0 }, b: { t: 0, l: 2 }, c: { t: 0, l: 1 } });
  assert.equal(g.details.arguments.b.truth, 'wrong');
});

test('argument-check: равноправная интерпретация связи — полный балл', () => {
  const { OLY, task } = register(argTask());
  const g = OLY.grade.gradeTask(task, { a: { t: 0, l: 0 }, b: { t: 1, l: 2 }, c: { t: 0, l: 3 } });
  assert.equal(g.details.arguments.c.link, 'ok');
  assert.equal(g.points, 6);
});

test('argument-check: ошибки данных и структура ответа', () => {
  const cases = [
    [{ arguments: [arg('a', 0, 0), arg('b', 1, 2)] }, /не меньше трёх доводов/],
    [{ arguments: [arg('a', 0, 0), arg('b', 1, 2), arg('c', 0, 1, { linkAlt: [3] })] }, /границы интерпретаций/],
    [{ arguments: [arg('a', 0, 0), arg('b', 1, 2), Object.assign(arg('c', 0, 1), { wrong: { truth: { 1: 'x', 2: 'y' }, link: { 0: 'x', 2: 'y' } } })] }, /нет объяснения ошибки для связи «Не относится к вопросу»/],
    [{ arguments: [arg('a', 0, 0), arg('b', 1, 2), arg('c', 0, 1, { linkPartial: [1] })] }, /linkPartial/],
    [{ conclusion: '' }, /нет conclusion/],
    [{ scoring: { maxPoints: 5, rule: 'components', basis: 'author' } }, /сумме баллов элементов: 6/]
  ];
  for (const [overrides, message] of cases) {
    const OLY = loadCoreTypes();
    assert.throws(() => OLY.addTasks([argTask(overrides)]), message);
  }
  const { task, type } = register(argTask());
  assert.throws(() => type.cleanResponse(task, { z: { t: 0 } }), /Неизвестный довод/);
  assert.throws(() => type.cleanResponse(task, { a: { t: 5 } }), /неверный вариант правильности/);
  assert.deepEqual(type.cleanResponse(task, { a: { t: 0 } }).a, { t: 0, l: null });
  assert.ok(!type.isComplete(task, { a: { t: 0, l: null } }));
});

/* ---------- compound ---------- */

function compoundTask(overrides) {
  return Object.assign({}, BASE, {
    id: 'TPR-LAW-NRM-996', type: 'compound',
    situation: ['Ситуация.'],
    legal: [{ id: 'g', role: 'main', act: 'Акт', ref: 'ст. 1', verified: false, fragments: [{ text: 'Текст.' }] }],
    parts: [
      { id: 'A', title: 'Часть А', kind: 'choice', rows: [
        { id: 'r1', label: 'Вопрос', options: ['да', 'нет'], key: [0], wrong: { 1: 'нет' }, explanation: 'да' }
      ] },
      { id: 'B', title: 'Часть Б', kind: 'short', legal: [{ id: 'h', role: 'main', act: 'Акт', ref: 'ст. 2', verified: false, fragments: [{ text: 'Ещё.' }] }],
        items: [{ id: 'n', label: 'Число', kind: 'number', key: 40, explanation: '40' }] },
      { id: 'C', title: 'Часть В', kind: 'arguments', issue: 'Вопрос?', conclusion: 'Вывод.', arguments: [arg('x', 0, 0), arg('y', 2, 2), arg('z', 0, 3)] }
    ],
    scoring: { maxPoints: 8, rule: 'components', basis: 'author' }
  }, overrides || {});
}

test('compound: баллы по частям и компонентам; эталон — «верно»', () => {
  const { OLY, task, type } = register(compoundTask());
  assert.deepEqual(OLY.compound.maxByComponent(task), { K: 2, T: 0, R: 6 });
  const correct = type.getCorrect(task);
  assert.equal(correct.stage, 2);
  let g = OLY.grade.gradeTask(task, correct);
  assert.equal(g.verdict, 'correct');
  assert.equal(g.details.parts.C.earned, 6);
  const r = JSON.parse(JSON.stringify(correct));
  r.parts.B.n = 'сорок два';
  r.parts.C.y = { t: 1, l: 2 };
  g = OLY.grade.gradeTask(task, r);
  assert.equal(g.details.parts.B.earned, 0);
  assert.equal(g.details.parts.C.earned, 5.5);
  assert.equal(g.verdict, 'partial');
});

test('compound: поэтапное раскрытие — ответы на неоткрытые части запрещены, зафиксированная часть должна быть полной', () => {
  const { OLY, task, type } = register(compoundTask());
  const empty = type.emptyResponse(task);
  assert.equal(empty.stage, 0);
  assert.ok(type.isEmpty(task, empty));
  const early = JSON.parse(JSON.stringify(empty));
  early.parts.B.n = '40';
  assert.throws(() => type.cleanResponse(task, early), /Часть B ещё не открыта/);
  const skipped = JSON.parse(JSON.stringify(empty));
  skipped.stage = 1;
  assert.throws(() => type.cleanResponse(task, skipped), /Часть A зафиксирована без полного ответа/);
  const full = type.getCorrect(task);
  assert.ok(type.isComplete(task, full));
  assert.ok(!type.isComplete(task, Object.assign({}, full, { stage: 1 })), 'проверка возможна только на последней части');
  assert.deepEqual(OLY.compound.visibleLegal(task, 0).map((b) => b.id), ['g']);
  assert.deepEqual(OLY.compound.visibleLegal(task, 1).map((b) => b.id), ['g', 'h']);
});

test('compound: ошибки данных', () => {
  const cases = [
    [{ parts: [compoundTask().parts[0]] }, /не меньше двух частей/],
    [{ parts: [compoundTask().parts[0], Object.assign({}, compoundTask().parts[1], { kind: 'text' })] }, /kind/],
    [{ parts: [compoundTask().parts[0], Object.assign({}, compoundTask().parts[1], { items: [{ id: 'r1', label: 'Ч', kind: 'number', key: 1, explanation: 'x' }] })] }, /повторяющийся id r1/],
    [{ situation: [] }, /situation/]
  ];
  for (const [overrides, message] of cases) {
    const OLY = loadCoreTypes();
    assert.throws(() => OLY.addTasks([compoundTask(Object.assign({ scoring: { maxPoints: 3, rule: 'components', basis: 'author' } }, overrides))]), message);
  }
});

/* ---------- Демо ---------- */

test('Демо: оценка доводов (указ о помиловании) и составное задание (ПВТР и ТК) — эталон, тексты несверенные', () => {
  const OLY = loadBank('olympiad-demo.html');
  for (const [id, type, max] of [['DEMO-LAW-NRM-009', 'argument-check', 14], ['DEMO-LAW-NRM-010', 'compound', 18]]) {
    const task = OLY.getTask(id);
    assert.equal(task.type, type);
    assert.equal(task.demo, true);
    const legal = type === 'compound' ? OLY.compound.allLegal(task) : (task.legal || []);
    assert.ok(legal.every((b) => b.verified === false), id);
    const g = OLY.grade.gradeTask(task, OLY.types.get(type).getCorrect(task));
    assert.equal(g.points, max, id);
  }
});

test('Демо составного задания: тексты поздних частей не видны до их открытия; поздние части не повторяют ответы ранних', () => {
  const OLY = loadBank('olympiad-demo.html');
  const task = OLY.getTask('DEMO-LAW-NRM-010');
  assert.deepEqual(OLY.compound.visibleLegal(task, 0).map((b) => b.id), ['tk-91-2']);
  assert.ok(OLY.compound.visibleLegal(task, 2).some((b) => b.id === 'tk-8-4'));
  // Условие части А не содержит текста ст. 8 ч. 4 и формулы «не подлежит применению».
  const partA = JSON.stringify(task.parts[0]) + JSON.stringify(task.situation) + JSON.stringify(task.legal);
  assert.ok(!/не подлежит применению|не подлежат применению/.test(partA));
});

test('Оценка доводов и составное задание в попытке: «частично», восстановление этапа и ответов', () => {
  const OLY = loadBank('olympiad-demo.html');
  const A = OLY.attempt;
  const ids = ['DEMO-LAW-NRM-009', 'DEMO-LAW-NRM-010'];
  const attempt = A.createAttempt({ mode: 'practice', olympiad: 'DEMO', subject: 'social', taskIds: ids,
    settings: { discipline: 'LAW', topic: 'LAW-NRM', filters: {} } });
  const t9 = OLY.getTask(ids[0]);
  const r9 = OLY.types.get(t9.type).getCorrect(t9);
  r9.a3 = { t: 0, l: 0 };
  A.setResponse(attempt, ids[0], r9);
  assert.equal(A.check(attempt, ids[0]).points, 13);
  const t10 = OLY.getTask(ids[1]);
  const r10 = OLY.types.get(t10.type).getCorrect(t10);
  r10.parts.A['a-method'] = { c: 1, f: [], e: [] };
  A.setResponse(attempt, ids[1], r10);
  const res = A.check(attempt, ids[1]);
  assert.equal(res.verdict, 'partial');
  assert.equal(res.points, 17);
  A.finish(attempt);
  const scope = { olympiad: 'DEMO', subject: 'social', discipline: 'LAW', topic: 'LAW-NRM' };
  const restored = OLY.ui.progress.restore(JSON.parse(JSON.stringify(A.snapshot(attempt))), scope);
  for (const id of ids) assert.deepEqual(restored.results[id], attempt.results[id]);
});
