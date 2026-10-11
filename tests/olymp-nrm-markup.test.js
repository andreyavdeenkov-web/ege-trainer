'use strict';

/**
 * Разметка структуры нормы (тип text-markup) практикума «Норма права»:
 * проверка данных, баллы за элементы разметки, спорная граница, отсутствующий
 * элемент («санкцию не дописывают»), строки выбора, попытка и её восстановление.
 * Задания здесь — тестовые (трек TPR) и демонстрационные (трек DEMO).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadCore, loadBank } = require('./helpers/olymp.js');

const root = path.join(__dirname, '..');

function loadMarkupCore() {
  const OLY = loadCore();
  for (const src of ['js/olymp/types/nrm-rows.js', 'js/olymp/types/text-markup.js', 'js/olymp/rules/components.js']) {
    const code = fs.readFileSync(path.join(root, src), 'utf8');
    vm.runInThisContext('(function (window, globalThis) {\n' + code + '\n})', { filename: src })(undefined, { OLY });
  }
  OLY.defineSubject({
    id: 'social', title: 'Обществознание',
    disciplines: [{ id: 'LAW', title: 'Право', sections: [{ id: 'theory', title: 'Теория права' }], topics: [
      { id: 'LAW-NRM', title: 'Норма права', section: 'theory', blocks: [{ id: 'structure', title: 'Структура' }] }
    ] }]
  });
  OLY.defineOlympiad({ id: 'TPR', kind: 'practicum', title: 'Тестовый практикум', subjects: ['social'] });
  return OLY;
}

/** Норма из четырёх фрагментов: Г, Д, спорный Г/Д, фрагмент вне элементов; санкции в тексте нет. */
function markupTask(overrides) {
  return Object.assign({
    id: 'TPR-LAW-NRM-951', olympiad: 'TPR', subject: 'social', discipline: 'LAW', section: 'theory',
    topic: 'LAW-NRM', block: 'structure', order: 1, level: 2, tags: ['структура'],
    type: 'text-markup', question: 'Разметьте норму.',
    legal: [
      { id: 'main', role: 'main', act: 'Тестовый акт', ref: 'ст. 1', verified: false,
        fragments: [{ id: 'a', text: 'Взрослые' }, { text: ' ' }, { id: 'b', text: 'должны помогать' }, { text: ' ' },
          { id: 'c', text: 'нуждающимся' }, { text: ' ' }, { id: 'd', text: '(см. ст. 2).' }] },
      { id: 'ref', role: 'reference', act: 'Тестовый акт', ref: 'ст. 2', verified: false,
        fragments: [{ id: 'r', text: 'Штраф.' }] }
    ],
    palette: [{ id: 'H', label: 'Гипотеза', short: 'Г' }, { id: 'D', label: 'Диспозиция', short: 'Д' }, { id: 'S', label: 'Санкция', short: 'С' }],
    markup: {
      key: { a: 'H', b: 'D', c: ['H', 'D'], d: null },
      elements: {
        H: { explanation: 'условия', wrong: 'условия — гипотеза' },
        D: { explanation: 'правило', wrong: { short: 'правило — диспозиция', full: 'подробно' } },
        S: { explanation: 'санкции нет', wrong: 'санкции в тексте нет' }
      }
    },
    sections: [
      { id: 'X', title: 'Где санкция', rows: [
        { id: 'where', label: 'Санкция', options: ['Здесь', 'В другой статье'], key: [1], wrong: { 0: 'в тексте её нет' }, explanation: 'ст. 2' },
        { id: 'st', label: 'Утверждение', component: 'R', options: ['Верно', 'Неверно'], key: [0], wrong: { 1: 'верно' }, explanation: 'так' }
      ] }
    ],
    explanation: 'Гипотеза и диспозиция в тексте, санкция — в ст. 2.',
    scoring: { maxPoints: 5, rule: 'components', basis: 'author' }
  }, overrides || {});
}

function setup(overrides) {
  const OLY = loadMarkupCore();
  OLY.addTasks([markupTask(overrides)]);
  const task = OLY.getTask('TPR-LAW-NRM-951');
  return { OLY, task, type: OLY.types.get('text-markup') };
}

const rows = { where: { c: 1, f: [], e: [] }, st: { c: 0, f: [], e: [] } };

test('text-markup: корректное задание регистрируется, максимум 5 (T 3, K 1, R 1)', () => {
  const { OLY, task } = setup();
  assert.deepEqual(OLY.textMarkup.maxByComponent(task), { K: 1, T: 3, R: 1 });
  assert.deepEqual(OLY.textMarkup.markable(task), ['a', 'b', 'c', 'd']);
});

test('text-markup: ошибки данных — палитра, ключ, объяснения, maxPoints', () => {
  const cases = [
    [{ palette: [{ id: 'H', label: 'Г', short: 'Г' }] }, /palette — от 2 до 6/],
    [{ palette: [{ id: 'h', label: 'Г', short: 'Г' }, { id: 'D', label: 'Д', short: 'Д' }] }, /одна-две заглавные/],
    [{ markup: { key: { a: 'H', b: 'D', c: 'H' }, elements: markupTask().markup.elements } }, /нет ключа для фрагмента d/],
    [{ markup: { key: { a: 'H', b: 'D', c: 'X', d: null }, elements: markupTask().markup.elements } }, /неизвестный элемент X/],
    [{ markup: { key: { a: 'H', b: 'D', c: 'H', d: null, r: 'S' }, elements: markupTask().markup.elements } }, /фрагмент r не размечается/],
    [{ markup: { key: markupTask().markup.key, elements: { H: { explanation: 'x', wrong: 'y' }, D: { explanation: 'x', wrong: 'y' }, S: { explanation: 'x' } } } }, /markup.elements.S: нет объяснения ошибки/],
    [{ scoring: { maxPoints: 6, rule: 'components', basis: 'author' } }, /сумме баллов элементов: 5/]
  ];
  for (const [overrides, message] of cases) {
    const OLY = loadMarkupCore();
    assert.throws(() => OLY.addTasks([markupTask(overrides)]), message);
  }
});

test('text-markup: эталон — «верно», 5 из 5; спорный фрагмент засчитывается с любой меткой из списка', () => {
  const { OLY, task, type } = setup();
  const correct = type.getCorrect(task);
  assert.deepEqual(correct.marks, { a: 'H', b: 'D', c: 'H', d: null });
  let g = OLY.grade.gradeTask(task, correct);
  assert.equal(g.verdict, 'correct');
  assert.equal(g.points, 5);
  g = OLY.grade.gradeTask(task, { marks: { a: 'H', b: 'D', c: 'D', d: null }, rows });
  assert.equal(g.points, 5);
});

test('text-markup: неразмеченный спорный фрагмент — ошибка первого элемента списка', () => {
  const { OLY, task } = setup();
  const g = OLY.grade.gradeTask(task, { marks: { a: 'H', b: 'D', c: null, d: null }, rows });
  const el = g.details.markup.elements;
  assert.equal(el.H.status, 'wrong');
  assert.deepEqual(el.H.missing, ['c']);
  assert.equal(el.D.status, 'ok');
  assert.equal(g.details.markup.fragments.c.status, 'missed');
  assert.equal(g.verdict, 'partial');
  assert.equal(g.points, 4);
});

test('text-markup: одна неверная метка снимает не больше одного балла', () => {
  const { OLY, task } = setup();
  // Фрагмент гипотезы помечен диспозицией: балл снимается у гипотезы, у диспозиции — замечание.
  const g = OLY.grade.gradeTask(task, { marks: { a: 'D', b: 'D', c: 'H', d: null }, rows });
  const el = g.details.markup.elements;
  assert.deepEqual(el.H.missing, ['a']);
  assert.equal(el.H.points, 0);
  assert.equal(el.D.status, 'note');
  assert.equal(el.D.points, 1);
  assert.deepEqual(el.D.noted, ['a']);
  assert.equal(g.details.markup.fragments.a.charged, 'H');
  assert.equal(g.details.components.T.earned, 2);
});

test('text-markup: «дописанная» санкция снимает балл санкции (одна ошибка — один балл)', () => {
  const { OLY, task } = setup();
  let g = OLY.grade.gradeTask(task, { marks: { a: 'H', b: 'S', c: 'H', d: null }, rows });
  let el = g.details.markup.elements;
  assert.equal(el.S.present, false);
  assert.deepEqual(el.S.extra, ['b']);
  assert.equal(el.S.points, 0);
  assert.equal(el.D.status, 'note');
  assert.deepEqual(el.D.noted, ['b']);
  assert.equal(g.details.components.T.earned, 2);
  assert.equal(g.details.markup.fragments.b.status, 'wrong');

  // Метка на фрагменте вне всех элементов — ошибка элемента, которым он помечен.
  g = OLY.grade.gradeTask(task, { marks: { a: 'H', b: 'D', c: 'H', d: 'D' }, rows });
  el = g.details.markup.elements;
  assert.deepEqual(el.D.extra, ['d']);
  assert.equal(g.details.components.T.earned, 2);
});

test('text-markup: спорный фрагмент с чужой меткой — ошибка только первого элемента списка', () => {
  const { OLY, task } = setup({
    palette: [{ id: 'H', label: 'Гипотеза', short: 'Г' }, { id: 'D', label: 'Диспозиция', short: 'Д' }, { id: 'X', label: 'Иное', short: 'И' }],
    markup: { key: { a: 'H', b: 'D', c: ['H', 'D'], d: 'X' }, elements: {
      H: { explanation: 'у', wrong: 'у' }, D: { explanation: 'п', wrong: 'п' }, X: { explanation: 'и', wrong: 'и' } } }
  });
  const g = OLY.grade.gradeTask(task, { marks: { a: 'H', b: 'D', c: 'X', d: 'X' }, rows });
  const el = g.details.markup.elements;
  assert.deepEqual(el.H.missing, ['c']);
  assert.equal(el.D.status, 'ok');
  assert.equal(el.X.status, 'note');
  assert.equal(g.details.components.T.earned, 2);
});

test('text-markup: вердикты, пустой ответ, незавершённость', () => {
  const { OLY, task, type } = setup();
  const empty = type.emptyResponse(task);
  assert.ok(type.isEmpty(task, empty));
  assert.ok(!type.isComplete(task, empty));
  const marksOnly = { marks: { a: 'H', b: null, c: null, d: null }, rows: empty.rows };
  assert.ok(!type.isEmpty(task, marksOnly));
  assert.ok(!type.isComplete(task, marksOnly));
  assert.ok(type.isComplete(task, { marks: marksOnly.marks, rows }));
  const g = OLY.grade.gradeTask(task, { marks: { a: 'D', b: 'H', c: 'S', d: 'S' }, rows: { where: { c: 0, f: [], e: [] }, st: { c: 1, f: [], e: [] } } });
  assert.equal(g.verdict, 'incorrect');
  assert.equal(g.points, 0);
});

test('text-markup: структура ответа проверяется', () => {
  const { task, type } = setup();
  assert.throws(() => type.cleanResponse(task, { marks: { r: 'H' }, rows }), /Фрагмент r не размечается/);
  assert.throws(() => type.cleanResponse(task, { marks: { a: 'X' }, rows }), /Неизвестная метка X/);
  assert.throws(() => type.cleanResponse(task, { marks: {}, rows, extra: 1 }), /Неизвестное поле ответа/);
  const cleaned = type.cleanResponse(task, { marks: { a: 'H' }, rows });
  assert.deepEqual(cleaned.marks, { a: 'H', b: null, c: null, d: null });
});

/* ---------- Демонстрационные задания ---------- */

test('Демо: разметка ч. 3 ст. 38 Конституции и п. 2 ст. 89 СК — эталон 16 и 11 баллов, тексты помечены несверенными', () => {
  const OLY = loadBank('olympiad-demo.html');
  for (const [id, max] of [['DEMO-LAW-NRM-002', 16], ['DEMO-LAW-NRM-004', 11]]) {
    const task = OLY.getTask(id);
    assert.equal(task.type, 'text-markup');
    assert.equal(task.demo, true);
    assert.ok(task.legal.every((b) => b.verified === false), id);
    const g = OLY.grade.gradeTask(task, OLY.types.get(task.type).getCorrect(task));
    assert.equal(g.verdict, 'correct', id);
    assert.equal(g.points, max, id);
  }
});

test('Демо ч. 3 ст. 38: санкцию в тексте не размечают; судебное взыскание как мера ответственности — ½', () => {
  const OLY = loadBank('olympiad-demo.html');
  const task = OLY.getTask('DEMO-LAW-NRM-002');
  const response = OLY.types.get(task.type).getCorrect(task);
  response.marks.k3 = 'S';
  response.rows['role-c'] = { c: 5, f: [], e: [] };
  const g = OLY.grade.gradeTask(task, response);
  assert.equal(g.details.markup.elements.S.status, 'wrong');
  assert.equal(g.details.markup.elements.D.status, 'note');
  assert.equal(g.details.rows['role-c'].choicePoints, 0.5);
  assert.equal(g.points, 14.5);
  assert.equal(g.verdict, 'partial');
});

test('text-markup в попытке: «частично», баллы по компонентам, восстановление', () => {
  const OLY = loadBank('olympiad-demo.html');
  const A = OLY.attempt;
  const task = OLY.getTask('DEMO-LAW-NRM-004');
  const attempt = A.createAttempt({ mode: 'practice', olympiad: 'DEMO', subject: 'social', taskIds: [task.id],
    settings: { discipline: 'LAW', topic: 'LAW-NRM', filters: {} } });
  const response = OLY.types.get(task.type).getCorrect(task);
  response.marks.a4 = 'S';   // «в судебном порядке» как санкция — одна ошибка, один балл
  A.setResponse(attempt, task.id, response);
  const result = A.check(attempt, task.id);
  assert.equal(result.verdict, 'partial');
  assert.equal(result.points, 10);
  assert.equal(A.summary(attempt).partial, 1);
  const outcome = OLY.ui.session.outcome(attempt);
  assert.deepEqual(outcome.components.T, { earned: 3, max: 4 });
  A.finish(attempt);
  const scope = { olympiad: 'DEMO', subject: 'social', discipline: 'LAW', topic: 'LAW-NRM' };
  const restored = OLY.ui.progress.restore(JSON.parse(JSON.stringify(A.snapshot(attempt))), scope);
  assert.ok(restored);
  assert.deepEqual(restored.results[task.id], attempt.results[task.id]);
});
