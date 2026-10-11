'use strict';

/**
 * Краткий самостоятельный ответ (тип short-answer) практикума «Норма права»:
 * нормализация ссылки на статью, числа и термина (спецификация § 3.3), баллы и причины
 * ошибок, проверка данных, попытка и восстановление.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadCore, loadBank } = require('./helpers/olymp.js');

const root = path.join(__dirname, '..');

function loadShortCore() {
  const OLY = loadCore();
  for (const src of ['js/olymp/types/nrm-rows.js', 'js/olymp/types/short-answer.js', 'js/olymp/rules/components.js']) {
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

function shortTask(overrides) {
  return Object.assign({
    id: 'TPR-LAW-NRM-991', olympiad: 'TPR', subject: 'social', discipline: 'LAW', section: 'theory',
    topic: 'LAW-NRM', block: 'b', order: 1, level: 1, tags: ['т'], type: 'short-answer', question: 'Ответьте.',
    items: [
      { id: 'art', label: 'Статья', kind: 'article', key: { code: 'GK', article: '1064', part: '1' },
        partWrong: 'часть другая', wrong: { 'GK 1083': 'это исключение', 'UK': 'не тот кодекс — УК' }, explanation: 'ст. 1064' },
      { id: 'num', label: 'Число', kind: 'number', key: 16, wrong: { '14': 'исключение' }, explanation: '16' },
      { id: 'term', label: 'Термин', kind: 'term', key: ['формальная определённость'], wrong: { 'общеобязательность': 'другой признак' }, explanation: 'ф' }
    ],
    explanation: 'Разбор.',
    scoring: { maxPoints: 3, rule: 'components', basis: 'author' }
  }, overrides || {});
}

function setup() {
  const OLY = loadShortCore();
  OLY.addTasks([shortTask()]);
  const task = OLY.getTask('TPR-LAW-NRM-991');
  return { OLY, task, type: OLY.types.get('short-answer'), S: OLY.shortAnswer };
}

test('short-answer: разбор ссылки на статью — разные записи равнозначны', () => {
  const { S } = setup();
  const same = ['ст. 1064 ГК', '1064 ГК РФ', 'статья 1064 Гражданского кодекса', 'ст.1064 ч.1 ГК', 'часть 1 статьи 1064 ГК РФ', 'п. 1 ст. 1064'];
  for (const text of same) assert.equal(S.parseArticle(text).article, '1064', text);
  assert.equal(S.parseArticle('ст. 1064 ГК').code, 'GK');
  assert.equal(S.parseArticle('ст. 39 ГПК').code, 'GPK');
  assert.equal(S.parseArticle('ст. 39 Гражданского процессуального кодекса').code, 'GPK');
  assert.equal(S.parseArticle('ст. 12.6 КоАП').article, '12.6');
  assert.equal(S.parseArticle('ст. 12.6 КоАП').code, 'KOAP');
  assert.equal(S.parseArticle('ч. 3 ст. 38 Конституции').code, 'KONST');
  assert.equal(S.parseArticle('ч. 3 ст. 38 Конституции').part, '3');
  assert.equal(S.parseArticle('без номера'), null);
});

test('short-answer: число цифрами и словами, термин без учёта регистра и ё', () => {
  const { S } = setup();
  assert.equal(S.parseNumber('16'), 16);
  assert.equal(S.parseNumber('Шестнадцать'), 16);
  assert.equal(S.parseNumber('16 лет'), 16);
  assert.equal(S.parseNumber('двадцать один'), 21);
  assert.equal(S.parseNumber('много'), null);
  assert.equal(S.normTerm('Формальная  определённость.'), 'формальная определенность');
});

test('short-answer: баллы и причины — кодекс, статья, часть (½), число, термин', () => {
  const { OLY, task } = setup();
  const grade = (art, num, term) => OLY.grade.gradeTask(task, { art, num, term });
  let g = grade('1064 ГК', 'шестнадцать', 'ФОРМАЛЬНАЯ ОПРЕДЕЛЕННОСТЬ');
  assert.equal(g.verdict, 'correct');
  assert.equal(g.points, 3);
  g = grade('ст. 1064', '16', 'формальная определённость');
  assert.equal(g.points, 3, 'кодекс можно не указывать');
  g = grade('ч. 2 ст. 1064 ГК', '14', 'общеобязательность');
  const d = g.details.items;
  assert.deepEqual([d.art.status, d.art.points, d.art.reason], ['partial', 0.5, 'part']);
  assert.deepEqual([d.num.status, d.num.reason, d.num.wrong.explanation], ['wrong', 'number', 'исключение']);
  assert.deepEqual([d.term.reason, d.term.wrong.explanation], ['term', 'другой признак']);
  assert.equal(g.points, 0.5);
  assert.equal(g.verdict, 'partial');
  g = grade('ст. 1064 УК', '', 'x');
  assert.equal(g.details.items.art.reason, 'code');
  assert.equal(g.details.items.art.wrong.explanation, 'не тот кодекс — УК');
  assert.equal(g.details.items.num.status, 'empty');
  g = grade('ст. 1083 ГК', 'xx', 'x');
  assert.equal(g.details.items.art.wrong.explanation, 'это исключение');
  assert.equal(g.details.items.num.reason, 'unparsed');
});

test('short-answer: ответ — строки; пустой и неполный ответ', () => {
  const { task, type } = setup();
  const empty = type.emptyResponse(task);
  assert.ok(type.isEmpty(task, empty));
  assert.ok(!type.isComplete(task, { art: '1064', num: '', term: '' }));
  assert.ok(type.isComplete(task, { art: '1064', num: '16', term: 'ф' }));
  assert.throws(() => type.cleanResponse(task, { art: 5 }), /должен быть строкой/);
  assert.throws(() => type.cleanResponse(task, { zz: '1' }), /Неизвестное поле/);
  assert.throws(() => type.cleanResponse(task, { art: 'x'.repeat(121) }), /длиннее/);
  assert.deepEqual(type.cleanResponse(task, { art: ' 1064 ' }), { art: '1064', num: '', term: '' });
  assert.equal(type.getCorrect(task).art, 'ч. 1 ст. 1064 ГК РФ');
});

test('short-answer: ошибки данных', () => {
  const base = shortTask().items;
  const cases = [
    [[Object.assign({}, base[0], { key: { code: 'XX', article: '1' } })], /key\.code/],
    [[Object.assign({}, base[0], { partWrong: undefined })], /partWrong/],
    [[Object.assign({}, base[1], { key: 1.5 })], /целое/],
    [[Object.assign({}, base[2], { wrong: { 'Формальная определенность': 'x' } })], /одновременно в key и wrong/],
    [[Object.assign({}, base[2], { kind: 'text' })], /kind/]
  ];
  for (const [items, message] of cases) {
    const OLY = loadShortCore();
    assert.throws(() => OLY.addTasks([shortTask({ items, scoring: { maxPoints: 1, rule: 'components', basis: 'author' } })]), message);
  }
});

test('Демо краткого ответа: эталон 3 из 3; 14 лет и ч. 2 ст. 20 — ошибки с объяснением; попытка восстанавливается', () => {
  const OLY = loadBank('olympiad-demo.html');
  const task = OLY.getTask('DEMO-LAW-NRM-006');
  assert.equal(task.demo, true);
  assert.ok(task.legal.every((b) => b.verified === false));
  let g = OLY.grade.gradeTask(task, OLY.types.get(task.type).getCorrect(task));
  assert.equal(g.points, 3);
  const A = OLY.attempt;
  const attempt = A.createAttempt({ mode: 'practice', olympiad: 'DEMO', subject: 'social', taskIds: [task.id],
    settings: { discipline: 'LAW', topic: 'LAW-NRM', filters: {} } });
  A.setResponse(attempt, task.id, { age: '14', where: 'ч. 2 ст. 20 УК', term: 'формальная определённость' });
  g = A.check(attempt, task.id);
  assert.equal(g.points, 1.5);
  assert.equal(g.details.items.age.wrong.key, '14');
  A.finish(attempt);
  const scope = { olympiad: 'DEMO', subject: 'social', discipline: 'LAW', topic: 'LAW-NRM' };
  const restored = OLY.ui.progress.restore(JSON.parse(JSON.stringify(A.snapshot(attempt))), scope);
  assert.deepEqual(restored.results[task.id], attempt.results[task.id]);
});
