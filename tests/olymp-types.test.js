'use strict';

/** Олимпиады: нормализация ответов и типы заданий. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, sampleTasks } = require('./helpers/olymp.js');

const OLY = loadCore();
const { normalizeText, parseNumber } = OLY.normalize;
const T = OLY.types;
const [multiple, single, shortText, numeric, matching] = sampleTasks();

function check(task, response) {
  const type = T.get(task.type);
  return type.check(task, type.cleanResponse(task, response));
}

/* ---------- Нормализация ---------- */

test('normalizeText: регистр, пробелы по краям, повторные пробелы', () => {
  assert.equal(normalizeText('  Учение   о КОНЦЕ истории '), 'учение о конце истории');
  assert.equal(normalizeText('\tЭсхатология\n'), 'эсхатология');
  assert.equal(normalizeText(null), '');
});

test('normalizeText: ё и е различаются без настройки yo', () => {
  assert.equal(normalizeText('Учёт'), 'учёт');
  assert.equal(normalizeText('Учёт', { yo: false }), 'учёт');
  assert.equal(normalizeText('Учёт', { yo: true }), 'учет');
  assert.equal(normalizeText('ЁЛКА', { yo: true }), 'елка');
});

test('normalizeText: содержательные различия не устраняются', () => {
  assert.notEqual(normalizeText('социальный-лифт'), normalizeText('социальный лифт'));
  assert.notEqual(normalizeText('эсхатология.'), normalizeText('эсхатология'));
});

test('parseNumber: запятая, точка, минус, разряды', () => {
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber(' 12.5 '), 12.5);
  assert.equal(parseNumber('−3'), -3);
  assert.equal(parseNumber('1 000'), 1000);
  assert.equal(parseNumber('7'), 7);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('12,5%'), null);
  assert.equal(parseNumber('1,2,3'), null);
  assert.equal(parseNumber('abc'), null);
});

/* ---------- Реестр типов ---------- */

test('реестр: пять типов, новый тип регистрируется без изменения ядра', () => {
  assert.deepEqual(T.list(), ['single-select', 'multiple-select', 'short-text', 'numeric', 'matching']);
  const local = loadCore();
  assert.throws(() => local.types.register('ordering', { check() {} }), /нет функции validateTask/);
  const fns = ['validateTask', 'emptyResponse', 'isEmpty', 'isComplete', 'cleanResponse', 'check', 'getCorrect', 'formatResponse'];
  local.types.register('ordering', Object.fromEntries(fns.map((f) => [f, () => []])));
  assert.ok(local.types.has('ordering'));
  assert.throws(() => local.types.register('ordering', {}), /уже зарегистрирован/);
  assert.throws(() => local.types.get('essay'), /Неизвестный тип задания: essay/);
});

test('все тестовые задания проходят validateTask своего типа', () => {
  for (const task of sampleTasks()) {
    assert.deepEqual(T.get(task.type).validateTask(task), [], task.id);
  }
});

/* ---------- single-select ---------- */

test('single-select: ровно один верный вариант, проверка ответа', () => {
  const type = T.get('single-select');
  assert.match(type.validateTask({ ...single, options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] }).join(),
    /ровно один верный/);
  assert.equal(type.getCorrect(single), 2);
  assert.equal(check(single, 2).verdict, 'correct');
  assert.equal(check(single, 1).verdict, 'incorrect');
  assert.ok(type.isEmpty(single, null));
  assert.throws(() => type.cleanResponse(single, 4), /Некорректный номер варианта/);
  assert.equal(type.formatResponse(single, null), '—');
});

/* ---------- multiple-select ---------- */

test('multiple-select: пропущенные и лишние, вердикт только за полное совпадение', () => {
  const type = T.get('multiple-select');
  assert.deepEqual(type.getCorrect(multiple), [1, 3]);
  assert.deepEqual(check(multiple, [3, 1]), { verdict: 'correct', details: { mistakes: 0, missed: [], extra: [] } });
  assert.deepEqual(check(multiple, [1]), { verdict: 'incorrect', details: { mistakes: 1, missed: [3], extra: [] } });
  assert.deepEqual(check(multiple, [1, 2, 3]), { verdict: 'incorrect', details: { mistakes: 1, missed: [], extra: [2] } });
  assert.deepEqual(type.cleanResponse(multiple, [3, 1, 3]), [1, 3]);
  assert.throws(() => type.cleanResponse(multiple, [0]), /Некорректный номер/);
  assert.equal(type.formatResponse(multiple, [1, 3]), '1, 3');
  assert.ok(type.isEmpty(multiple, []));
});

/* ---------- short-text ---------- */

test('short-text: несколько допустимых ответов и техническая нормализация', () => {
  assert.equal(check(shortText, 'Эсхатология').verdict, 'correct');
  assert.equal(check(shortText, '  эсхатология  ').verdict, 'correct');
  assert.equal(check(shortText, 'Учение  о конце   истории').verdict, 'correct');
  assert.equal(check(shortText, 'учение о конце истории').details.matched, 'учение о конце истории');
});

test('short-text: ответ не из acceptedAnswers не засчитывается', () => {
  assert.deepEqual(check(shortText, 'апокалиптика'), {
    verdict: 'incorrect', details: { normalized: 'апокалиптика', matched: null }
  });
  assert.equal(check(shortText, 'эсхатологию').verdict, 'incorrect');
});

test('short-text: ё = е только с настройкой задания normalize.yo', () => {
  const task = { ...shortText, acceptedAnswers: ['учёт'] };
  assert.equal(check(task, 'учет').verdict, 'incorrect');
  assert.equal(check(task, 'УЧЁТ').verdict, 'correct');
  const withYo = { ...task, normalize: { yo: true } };
  assert.deepEqual(T.get('short-text').validateTask(withYo), []);
  assert.equal(check(withYo, 'учет').verdict, 'correct');
});

test('short-text: проверка данных', () => {
  const type = T.get('short-text');
  assert.match(type.validateTask({ ...shortText, acceptedAnswers: [] }).join(), /непустой список/);
  assert.match(type.validateTask({ ...shortText, acceptedAnswers: ['Эсхатология', 'эсхатология '] }).join(), /повторяет другой/);
  assert.match(type.validateTask({ ...shortText, normalize: { synonyms: true } }).join(), /неизвестная настройка synonyms/);
  assert.match(type.validateTask({ ...shortText, normalize: { yo: 'да' } }).join(), /true или false/);
  assert.ok(type.isEmpty(shortText, '   '));
  assert.equal(type.formatResponse(shortText, '  два   слова '), 'два слова');
});

/* ---------- numeric ---------- */

test('numeric: запятая и точка, допуск, нечисловой ввод', () => {
  assert.equal(check(numeric, '12,5').verdict, 'correct');
  assert.equal(check(numeric, '12.5').verdict, 'correct');
  assert.equal(check(numeric, '12.6').verdict, 'incorrect');
  assert.deepEqual(check(numeric, 'двенадцать'), { verdict: 'incorrect', details: { value: null } });
  assert.equal(check({ ...numeric, tolerance: 0.1 }, '12,6').verdict, 'correct');
  assert.equal(check({ ...numeric, answer: 0.3 }, '0,3').verdict, 'correct');
  const type = T.get('numeric');
  assert.ok(!type.isComplete(numeric, 'abc'));
  assert.ok(type.isComplete(numeric, '1,5'));
  assert.match(type.validateTask({ ...numeric, answer: '12' }).join(), /answer должно быть числом/);
  assert.match(type.validateTask({ ...numeric, tolerance: -1 }).join(), /tolerance/);
});

/* ---------- matching ---------- */

test('matching: ошибки по позициям, неполный ответ, oneToOne', () => {
  const type = T.get('matching');
  assert.deepEqual(type.getCorrect(matching), [2, 1, 3]);
  assert.deepEqual(check(matching, [2, 1, 3]), { verdict: 'correct', details: { mistakes: 0, perItem: [true, true, true] } });
  assert.deepEqual(check(matching, [1, 2, 3]), { verdict: 'incorrect', details: { mistakes: 2, perItem: [false, false, true] } });
  assert.deepEqual(check(matching, [2, null, null]).details, { mistakes: 2, perItem: [true, false, false] });
  assert.ok(!type.isComplete(matching, [2, null, 3]));
  assert.ok(type.isEmpty(matching, [null, null, null]));
  assert.throws(() => type.cleanResponse(matching, [1, 1, 3]), /только один раз/);
  assert.throws(() => type.cleanResponse(matching, [1, 2]), /на каждую позицию/);
  assert.equal(type.formatResponse(matching, [2, null, 3]), 'А — 2, Б — ?, В — 3');
  assert.match(type.validateTask({ ...matching, items: [{ text: 'x', match: 1 }, { text: 'y', match: 1 }] }).join(),
    /номера в ключе повторяются/);
  assert.match(type.validateTask({ ...matching, items: [{ text: 'x', match: 5 }, { text: 'y', match: 1 }] }).join(),
    /match должен быть номером варианта от 1 до 3/);
});
