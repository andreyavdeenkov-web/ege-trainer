'use strict';

/**
 * Конструктор формулировки (formula-builder), систематизация (systematize) и карта
 * связей (link-map) практикума «Норма права»: проверка данных (в том числе защита от
 * перекрёстных подсказок), частичные баллы, вердикты, попытка и восстановление.
 * Задания здесь — тестовые (трек TPR) и демонстрационные (трек DEMO).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadCore, loadBank } = require('./helpers/olymp.js');

const root = path.join(__dirname, '..');
const TYPES = ['nrm-rows', 'nrm-choice', 'formula-builder', 'systematize', 'link-map'];

function loadChoiceCore() {
  const OLY = loadCore();
  for (const src of TYPES.map((t) => 'js/olymp/types/' + t + '.js').concat('js/olymp/rules/components.js')) {
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

const BASE = { olympiad: 'TPR', subject: 'social', discipline: 'LAW', section: 'theory', topic: 'LAW-NRM', block: 'b', order: 1, level: 2, tags: ['т'], question: 'Вопрос.', explanation: 'Разбор.' };

function formulaTask(overrides) {
  return Object.assign({}, BASE, {
    id: 'TPR-LAW-NRM-981', type: 'formula-builder',
    template: 'Норма обязательна для {a} независимо от {b}.',
    slots: [
      { id: 'a', label: '[1] Кому', options: ['всех адресатов', 'всех без исключения', 'согласившихся'], key: [0], partial: [1],
        wrong: { 1: 'слабее', 2: 'согласие не нужно' }, explanation: 'адресаты' },
      { id: 'b', label: '[2] Чего', options: ['их воли', 'опубликования', 'формы'], key: [0],
        wrong: { 1: 'не то', 2: 'не то' }, explanation: 'воля' }
    ],
    scoring: { maxPoints: 2, rule: 'components', basis: 'author' }
  }, overrides || {});
}

function sortTask(overrides) {
  return Object.assign({}, BASE, {
    id: 'TPR-LAW-NRM-982', type: 'systematize',
    categories: [{ label: 'Норма права' }, { label: 'Мораль' }, { label: 'Обычай' }],
    items: [
      { id: 'i1', text: 'Закон', key: [0], wrong: { 1: 'м', 2: 'о' }, explanation: 'з' },
      { id: 'i2', text: 'Совесть', key: [1], wrong: { 0: 'н', 2: 'о' }, explanation: 'с' },
      { id: 'i3', text: 'Издавна', key: [2], partial: [1], wrong: { 0: 'н', 1: 'м' }, explanation: 'и' }
    ],
    scoring: { maxPoints: 3, rule: 'components', basis: 'author' }
  }, overrides || {});
}

const block = (id, text) => ({ id, role: 'main', act: 'Акт', ref: id, verified: false, fragments: [{ text }] });

function linkTask(overrides) {
  return Object.assign({}, BASE, {
    id: 'TPR-LAW-NRM-983', type: 'link-map',
    legal: [block('a', 'Общее правило.'), block('b', 'Исключение.'), block('c', 'Иное.')],
    relations: [
      { label: 'Конкретизация', definition: 'уточняет' },
      { label: 'Исключение', definition: 'отменяет' },
      { label: 'Связи нет', definition: 'нет связи' }
    ],
    none: 2,
    pairs: [
      { id: 'p1', a: 'a', b: 'b', key: [1], partial: [0], wrong: { 0: 'слабее', 2: 'связь есть' }, explanation: 'исключение' },
      { id: 'p2', a: 'a', b: 'c', key: [2], wrong: { 0: 'нет', 1: 'нет' }, explanation: 'нет связи' }
    ],
    sections: [{ id: 's', title: 'Утверждения', rows: [
      { id: 'u1', label: 'У1', component: 'R', options: ['Верно', 'Неверно'], key: [0], wrong: { 1: 'верно' }, explanation: 'так' }
    ] }],
    scoring: { maxPoints: 3, rule: 'components', basis: 'author' }
  }, overrides || {});
}

function register(task) {
  const OLY = loadChoiceCore();
  OLY.addTasks([task]);
  return { OLY, task: OLY.getTask(task.id), type: OLY.types.get(task.type) };
}

/* ---------- formula-builder ---------- */

test('formula-builder: эталон, частичный вариант, вердикты; компонент слотов — R', () => {
  const { OLY, task, type } = register(formulaTask());
  assert.deepEqual(OLY.formulaBuilder.maxByComponent(task), { K: 0, T: 0, R: 2 });
  assert.deepEqual(OLY.formulaBuilder.parts(task).map((p) => p.slot || p.text), ['Норма обязательна для ', 'a', ' независимо от ', 'b', '.']);
  let g = OLY.grade.gradeTask(task, type.getCorrect(task));
  assert.equal(g.verdict, 'correct');
  g = OLY.grade.gradeTask(task, { a: { c: 1, f: [], e: [] }, b: { c: 0, f: [], e: [] } });
  assert.equal(g.points, 1.5);
  assert.equal(g.verdict, 'partial');
  g = OLY.grade.gradeTask(task, { a: { c: 2, f: [], e: [] }, b: { c: 2, f: [], e: [] } });
  assert.equal(g.verdict, 'incorrect');
  assert.ok(type.isEmpty(task, type.emptyResponse(task)));
});

test('formula-builder: ошибки данных — шаблон, число вариантов, перекрёстные подсказки', () => {
  const cases = [
    [{ template: 'Без слотов {a}.' }, /в slots|не встречается в шаблоне/],
    [{ template: 'Норма {a} и {a} {b}.' }, /встречается в шаблоне дважды/],
    [{ template: 'Норма {a} {b} {c}.' }, /слот \{c\}, которого нет/],
    [{ slots: [formulaTask().slots[0], Object.assign({}, formulaTask().slots[1], { options: ['их воли', 'формы'], wrong: { 1: 'x' } })] }, /от 3 до 5 вариантов/],
    [{ template: 'Норма обязательна для {a} независимо от {b}, то есть для всех адресатов.' }, /есть в тексте утверждения — перекрёстная подсказка/],
    [{ slots: [formulaTask().slots[0], Object.assign({}, formulaTask().slots[1], { options: ['их воли', 'воли всех адресатов', 'формы'] })] }, /повторяется в вариантах слота b/]
  ];
  for (const [overrides, message] of cases) {
    const OLY = loadChoiceCore();
    assert.throws(() => OLY.addTasks([formulaTask(overrides)]), message);
  }
});

/* ---------- systematize ---------- */

test('systematize: по баллу за позицию, ½ за допустимую категорию; категорий не меньше трёх', () => {
  const { OLY, task, type } = register(sortTask());
  assert.deepEqual(OLY.systematize.maxByComponent(task), { K: 3, T: 0, R: 0 });
  const r = type.getCorrect(task);
  r.i3 = { c: 1, f: [], e: [] };
  r.i2 = { c: 0, f: [], e: [] };
  const g = OLY.grade.gradeTask(task, r);
  assert.equal(g.points, 1.5);
  assert.equal(g.details.rows.i2.choice, 'wrong');
  assert.equal(g.details.rows.i3.choice, 'partial');
  const OLY2 = loadChoiceCore();
  assert.throws(() => OLY2.addTasks([sortTask({ categories: [{ label: 'А' }, { label: 'Б' }] })]), /от 3 до 8 категорий/);
  const OLY3 = loadChoiceCore();
  const bad = sortTask();
  bad.items = bad.items.map((it, i) => (i === 0 ? Object.assign({}, it, { wrong: { 1: 'м' } }) : it));
  assert.throws(() => OLY3.addTasks([bad]), /нет объяснения ошибки для варианта «Обычай»/);
});

/* ---------- link-map ---------- */

test('link-map: пары (K) и утверждения (R); определения видов связи и «связи нет» обязательны', () => {
  const { OLY, task, type } = register(linkTask());
  assert.deepEqual(OLY.linkMap.maxByComponent(task), { K: 2, T: 0, R: 1 });
  assert.equal(OLY.linkMap.pairRows(task)[0].label, 'Акт, a — Акт, b');
  const r = type.getCorrect(task);
  r.p1 = { c: 0, f: [], e: [] };
  const g = OLY.grade.gradeTask(task, r);
  assert.equal(g.points, 2.5);
  assert.equal(g.verdict, 'partial');
  const cases = [
    [{ relations: linkTask().relations.map((x, i) => (i === 0 ? { label: x.label } : x)) }, /нет definition/],
    [{ none: 7 }, /none — номер вида «связи нет»/],
    [{ pairs: [Object.assign({}, linkTask().pairs[0], { b: 'zz' }), linkTask().pairs[1]] }, /неизвестное положение b zz/],
    [{ pairs: [linkTask().pairs[0]] }, /не меньше двух пар/]
  ];
  for (const [overrides, message] of cases) {
    const OLY2 = loadChoiceCore();
    assert.throws(() => OLY2.addTasks([linkTask(overrides)]), message);
  }
});

/* ---------- Демо ---------- */

test('Демо: конструктор, систематизация, карта связей — эталон даёт полный балл, тексты несверенные', () => {
  const OLY = loadBank('olympiad-demo.html');
  for (const [id, type, max] of [['DEMO-LAW-NRM-005', 'formula-builder', 3], ['DEMO-LAW-NRM-007', 'systematize', 7], ['DEMO-LAW-NRM-008', 'link-map', 7]]) {
    const task = OLY.getTask(id);
    assert.equal(task.type, type);
    assert.equal(task.demo, true);
    assert.ok((task.legal || []).every((b) => b.verified === false), id);
    const g = OLY.grade.gradeTask(task, OLY.types.get(type).getCorrect(task));
    assert.equal(g.points, max, id);
    assert.equal(g.verdict, 'correct', id);
  }
});

test('Демо карты связей: авторская типология и порядок объяснены; пара ст. 1064 — ст. 1067 убрана из автоматической проверки', () => {
  const OLY = loadBank('olympiad-demo.html');
  const task = OLY.getTask('DEMO-LAW-NRM-008');
  assert.equal(task.ordered, true);
  assert.match(task.relationsNote, /авторская учебная типология/);
  assert.match(task.relationsNote, /условие упражнения/);
  assert.equal(task.none, task.relations.length - 1);
  assert.ok(!task.pairs.some((p) => [p.a, p.b].includes('gk-1064') && [p.a, p.b].includes('gk-1067')), 'пара ст. 1064 — ст. 1067 не проверяется автоматически');
  assert.ok(task.pairs.every((p) => p.partial === undefined), 'при взаимоисключающих определениях частичных ответов нет');
  const EXC = task.relations.findIndex((r) => r.label === 'Исключение из правила');
  const r = OLY.types.get(task.type).getCorrect(task);
  r.p5 = { c: EXC, f: [], e: [] };
  const g = OLY.grade.gradeTask(task, r);
  assert.equal(g.details.rows.p5.choice, 'wrong');
  assert.equal(g.points, 6);
  assert.ok(task.pairs.find((p) => p.id === 'p5').wrong[EXC].full);
});

test('link-map: упорядоченное правило требует пояснения relationsNote', () => {
  const OLY = loadChoiceCore();
  assert.throws(() => OLY.addTasks([linkTask({ ordered: true })]), /нужно relationsNote/);
});

test('link-map: при упорядоченном правиле «связи нет» должен быть последним', () => {
  const OLY = loadChoiceCore();
  assert.throws(() => OLY.addTasks([linkTask({ ordered: true, none: 0, relations: [
    { label: 'Связи нет', definition: 'нет' }, { label: 'Исключение', definition: 'о' }, { label: 'Конкретизация', definition: 'у' }
  ] })]), /«связи нет» — последний вид/);
});

test('Новые типы в попытке: «частично», компоненты, восстановление', () => {
  const OLY = loadBank('olympiad-demo.html');
  const A = OLY.attempt;
  const ids = ['DEMO-LAW-NRM-005', 'DEMO-LAW-NRM-007', 'DEMO-LAW-NRM-008'];
  const attempt = A.createAttempt({ mode: 'practice', olympiad: 'DEMO', subject: 'social', taskIds: ids,
    settings: { discipline: 'LAW', topic: 'LAW-NRM', filters: {} } });
  for (const id of ids) {
    const task = OLY.getTask(id);
    const r = OLY.types.get(task.type).getCorrect(task);
    const first = Object.keys(r)[0];
    r[first] = { c: (r[first].c + 1) % 3, f: [], e: [] };
    A.setResponse(attempt, id, r);
    assert.equal(A.check(attempt, id).verdict, 'partial', id);
  }
  assert.equal(A.summary(attempt).partial, 3);
  const o = OLY.ui.session.outcome(attempt);
  assert.equal(o.components.possible, 17);
  A.finish(attempt);
  const scope = { olympiad: 'DEMO', subject: 'social', discipline: 'LAW', topic: 'LAW-NRM' };
  const restored = OLY.ui.progress.restore(JSON.parse(JSON.stringify(A.snapshot(attempt))), scope);
  assert.ok(restored);
  for (const id of ids) assert.deepEqual(restored.results[id], attempt.results[id]);
});
