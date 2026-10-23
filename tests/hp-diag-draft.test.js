'use strict';

/**
 * Черновик «Высшая проба — диагностический вариант № 1» (docs/drafts/hp-diag-1):
 * ключи по материалам для преподавателя, баллы, допустимые ответы, оценивание.
 * Черновик не подключён к сайту — задания не входят в банк и тематическую тренировку.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../docs/drafts/hp-diag-1/variant.js');
const C = require('../docs/drafts/hp-diag-1/check.js');
const { pageScripts } = require('./helpers/olymp.js');

const byNumber = (n) => V.tasks.find((t) => t.number === n);

// Ключи из таблицы «Ключи и правила проверки» материалов для преподавателя.
const KEYS = {
  1: [1, 3, 5], 2: [1, 2, 3, 6], 3: [1, 3], 4: [1, 3, 4, 6], 5: [1, 3, 4, 6],
  6: 'языковыми играми', 7: 'альтруистическим', 8: 'сосуществованием', 9: 'вытеснения', 10: 'бланкетным',
  11: { A: 'рыцарь', B: 'лжец', C: 'лжец' }, 12: 'культурный капитал', 13: { A: 3, B: 2, C: 1, D: 0 },
  14: '1800', 15: 'крайняя необходимость',
  16: ['Е', 'Г', 'В', 'Д', 'Б'], 17: ['В', 'Е', 'Д', 'А', 'Г'], 18: ['Г', 'Ж', 'Б', 'Е', 'А'],
  19: ['Г', 'В', 'Ж', 'Е', 'А'], 20: ['Г', 'В', 'Ж', 'Д', 'А']
};

test('21 задание по порядку, пять типов, распределение баллов 4/4/5/5/10', () => {
  assert.deepEqual(V.tasks.map((t) => t.number), Array.from({ length: 21 }, (_, i) => i + 1));
  const expect = (n) => (n <= 5 ? ['multiple-select', 4] : n <= 10 ? ['short-text', 4] : n <= 15 ? [null, 5] : n <= 20 ? ['matching', 5] : ['essay', 10]);
  for (const t of V.tasks) {
    const [type, points] = expect(t.number);
    if (type) assert.equal(t.type, type, `№ ${t.number}`);
    assert.equal(t.points, points, `№ ${t.number}`);
  }
  assert.equal(V.tasks.reduce((s, t) => s + t.points, 0), 100);
  assert.equal(V.tasks.filter((t) => t.type !== 'essay').reduce((s, t) => s + t.points, 0), 90);
});

test('ключи совпадают с материалами для преподавателя: полностью верный ответ даёт максимум', () => {
  for (const [n, key] of Object.entries(KEYS)) {
    const g = C.grade(byNumber(Number(n)), key);
    assert.equal(g.status, 'correct', `№ ${n}`);
    assert.equal(g.strict, byNumber(Number(n)).points, `№ ${n}`);
  }
  const full = Object.fromEntries(Object.entries(KEYS));
  const s = C.summarize(V, full);
  assert.equal(s.points, 90);
  assert.equal(s.maxPoints, 90);
  assert.equal(s.correct, 20);
});

test('множественный выбор: строго — только точный набор; порядок вариантов как в документе', () => {
  const t = byNumber(2);
  assert.equal(C.grade(t, [1, 2, 3]).strict, 0);          // пропуск
  assert.equal(C.grade(t, [1, 2, 3, 6, 4]).strict, 0);    // лишний
  assert.equal(C.grade(t, [1, 2, 3, 4, 5, 6]).strict, 0); // все варианты
  assert.equal(C.grade(t, [6, 3, 2, 1]).strict, 4);       // порядок выбора не важен
  assert.equal(byNumber(1).options[5].text, '«Золото — жёлтый металл».');
});

test('диагностическая схема: 2 балла за одну ошибку, 1 балл за пару — и только в ней', () => {
  const mc = byNumber(4);
  assert.equal(C.grade(mc, [1, 3, 4]).diagnostic, 2);       // один пропуск
  assert.equal(C.grade(mc, [1, 3, 4, 6, 2]).diagnostic, 2); // один лишний
  assert.equal(C.grade(mc, [1, 3, 4, 2]).diagnostic, 0);    // пропуск + лишний
  assert.equal(C.grade(mc, [1, 3, 4]).strict, 0);
  const m = byNumber(16);
  assert.equal(C.grade(m, ['Е', 'Г', 'В', 'Б', 'Д']).diagnostic, 3);
  assert.equal(C.grade(m, ['Е', 'Г', 'В', 'Б', 'Д']).strict, 0);
  assert.equal(C.grade(m, ['Е', null, null, null, null]).diagnostic, 1);
  // В остальных типах частичных баллов нет.
  assert.equal(C.grade(byNumber(13), { A: 3, B: 1, C: 1, D: 1 }).diagnostic, 0);
  assert.equal(C.grade(byNumber(11), { A: 'рыцарь', B: 'лжец', C: 'рыцарь' }).diagnostic, 0);
  // Основная схема — строгая; диагностическая не смешивается с ней.
  assert.equal(V.scoring.main, 'strict');
  const responses = { 4: [1, 3, 4], 16: ['Е', 'Г', 'В', 'Б', 'Д'] };
  assert.equal(C.summarize(V, responses).points, 0);
  assert.equal(C.summarize(V, responses, 'diagnostic').points, 5);
});

test('текстовые ответы: засчитываются все утверждённые формы, предложенные — только после утверждения', () => {
  for (const t of V.tasks.filter((x) => x.type === 'short-text')) {
    for (const a of t.accepted) {
      const ok = C.grade(t, a.text).status === 'correct';
      assert.equal(ok, a.basis !== 'proposed', `№ ${t.number}: «${a.text}» (${a.basis})`);
      if (a.basis === 'proposed') assert.equal(C.grade(t, a.text, [a.text]).status, 'correct');
    }
  }
});

test('текстовые ответы: неверные и близкие понятия из разбора не засчитываются', () => {
  for (const t of V.tasks.filter((x) => x.rejected)) {
    for (const r of t.rejected) {
      assert.notEqual(C.grade(t, r).status, 'correct', `№ ${t.number}: «${r}» засчитан`);
    }
  }
});

test('падеж, регистр, ё, пробелы и кавычки не влияют; опечатка и лишнее слово — влияют', () => {
  const t8 = byNumber(8);
  for (const r of ['сосуществованием', 'Сосуществование', 'кохабитация', 'кохабитацией', 'Cohabitation', '  «кохабитацией».  ']) {
    assert.equal(C.grade(t8, r).status, 'correct', r);
  }
  const t6 = byNumber(6);
  for (const r of ['языковыми играми', 'Языковые  игры', 'языковая игра', 'language games', 'Sprachspiele']) {
    assert.equal(C.grade(t6, r).status, 'correct', r);
  }
  assert.equal(C.grade(byNumber(12), 'Культурным капиталом').status, 'correct');
  assert.equal(C.grade(byNumber(15), 'КРАЙНЕЙ НЕОБХОДИМОСТИ').status, 'correct');
  assert.equal(C.grade(byNumber(7), 'альтруистическим самоубийством').status, 'correct');
  assert.equal(C.grade(byNumber(9), 'crowding out').status, 'correct');
  assert.equal(C.grade(byNumber(9), 'crowding-out').status, 'correct');
  assert.equal(C.grade(byNumber(10), 'бланкетным способом изложения').status, 'correct');
  // ё = е
  assert.equal(C.normalizeText('Воплощённый'), 'воплощенный');
  // Опечатки и искажения не засчитываются: нечёткого сопоставления нет.
  for (const [n, r] of [[10, 'бланкитным'], [8, 'сосушествованием'], [6, 'языковыми играмии'], [7, 'алтруистическим'], [12, 'культурный капитал общества']]) {
    assert.equal(C.grade(byNumber(n), r).status, 'incorrect', r);
  }
});

test('открытые ответы 11, 13, 14', () => {
  const t14 = byNumber(14);
  for (const r of ['1800', '1 800', '1800 млрд', ' 1800. ']) assert.equal(C.grade(t14, r).status, 'correct', r);
  assert.equal(C.grade(t14, '1800 млрд ден. ед.').status, 'correct'); // полная запись единиц — та же форма, что «1800 млрд»
  for (const r of ['1600', '2200', '2000', 'тысяча восемьсот', '18 00 0']) assert.equal(C.grade(t14, r).status, 'incorrect', r);
  assert.equal(C.grade(byNumber(13), { A: '3', B: '2', C: '1', D: '0' }).status, 'correct');
  assert.equal(C.grade(byNumber(13), { A: 3, B: 1, C: 1, D: 1 }).status, 'incorrect'); // квота Хэра
  assert.equal(C.grade(byNumber(13), { A: 3, B: 2, C: 1, D: null }).status, 'incorrect'); // поле D пустое
  assert.equal(C.grade(byNumber(11), { A: 'лжец', B: 'рыцарь', C: 'рыцарь' }).status, 'incorrect');
});

test('соотнесение: в правом ряду 7 элементов, 2 лишних с пояснением, буквы ключа не повторяются', () => {
  for (const t of V.tasks.filter((x) => x.type === 'matching')) {
    assert.equal(t.items.length, 5);
    assert.equal(t.options.length, 7);
    const used = t.items.map((i) => i.match);
    assert.equal(new Set(used).size, 5, `№ ${t.number}`);
    const extra = C.LETTERS.split('').filter((l) => !used.includes(l));
    assert.deepEqual(Object.keys(t.extraExplanations).sort(), extra.sort(), `№ ${t.number}`);
  }
});

test('мини-эссе не оценивается автоматически и не получает фиктивный ноль', () => {
  const essay = byNumber(21);
  const g = C.grade(essay, 'По Гоббсу, доверие, институт, рынок, контракт, собственность, государство, легитимность, социальный капитал, транзакционные издержки, право, свобода.');
  assert.equal(g.status, 'pending');
  assert.equal(g.strict, null);
  const s = C.summarize(V, { 21: 'текст' });
  assert.equal(s.maxPoints, 90);
  assert.equal(s.essay, 'pending');
  assert.equal(s.unanswered, 20);
  assert.ok(!('21' in s.byDiscipline));
});

test('баллы по дисциплинам — по метаданным заданий: 5 дисциплин по 18 баллов, эссе отдельно', () => {
  const s = C.summarize(V, {});
  for (const d of V.disciplines) assert.equal(s.byDiscipline[d.id].maxPoints, 18, d.id);
  assert.equal(byNumber(21).discipline, null);
});

test('у каждого задания полный разбор и тема для повторения', () => {
  for (const t of V.tasks) {
    const f = t.feedback;
    assert.ok(f && f.review && f.recommendation && f.recommendation.startsWith('Повторить: '), `№ ${t.number}`);
    if (t.type === 'essay') continue;
    assert.ok(Array.isArray(f.why) && f.why.length && f.mistakes.length && f.remember, `№ ${t.number}`);
    if (t.type === 'multiple-select') t.options.forEach((o, i) => assert.ok(o.explanation, `№ ${t.number}, вариант ${i + 1}`));
    if (t.type === 'matching') t.items.forEach((it, i) => assert.ok(it.explanation, `№ ${t.number}, позиция ${i + 1}`));
  }
  for (const n of [11, 13, 14]) assert.ok(byNumber(n).feedback.steps.length >= 3, `№ ${n}: нет пошагового решения`);
  assert.equal(byNumber(21).feedback.samples.length, 3);
});

test('черновик не подключён к сайту', () => {
  assert.ok(!pageScripts().some((s) => s.includes('drafts')), 'черновик подключён в olympiad.html');
});
