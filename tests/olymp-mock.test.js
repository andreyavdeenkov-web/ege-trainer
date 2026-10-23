'use strict';

/**
 * Пробный тур «Высшая проба — диагностический вариант № 1»:
 * исходные данные (docs/hp-diag-1) → файлы сайта → проверка ядром платформы.
 * Ключи — по таблице материалов для преподавателя; оценивание: строгая схема
 * (основная, 90 баллов автоматически) и диагностическая; эссе не оценивается.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadBank, pageScripts } = require('./helpers/olymp.js');

const root = path.join(__dirname, '..');
const { build } = require('../scripts/build-hp-mock.js');
const SRC = require('../docs/hp-diag-1/variant.js');

const KEY_SRC = 'data/olympiads/hp/mock/diag-1-key.js';

/** Банк страницы и, по требованию, ключ пробного тура (как после завершения попытки). */
function load(withKey = true) {
  const OLY = loadBank();
  if (withKey) {
    const code = fs.readFileSync(path.join(root, KEY_SRC), 'utf8');
    vm.runInThisContext('(function (window, globalThis, OLY) {\n' + code + '\n})', { filename: KEY_SRC })(undefined, {}, OLY);
  }
  return OLY;
}

const OLY = load();
const M = OLY.mock;
const V = M.getVariant('HP-DIAG-1');
const task = (n) => M.keyedTask('HP-DIAG-1', n);
const grade = (n, response, scheme = 'strict') => {
  const t = task(n);
  const rules = V.scoring.schemes[scheme].rules;
  const r = rules[t.type] || rules['*'];
  const scoring = t.type === 'essay' ? null : Object.assign({ maxPoints: t.points, rule: r.rule, basis: 'author' }, r.params ? { params: r.params } : {});
  return OLY.grade.gradeTask(t, response, scoring);
};
const L = 'АБВГДЕЖ';
const letters = (s) => s.map((x) => (x === null ? null : L.indexOf(x) + 1));

// Ключи из таблицы «Ключи и правила проверки» материалов для преподавателя.
const KEYS = {
  1: [1, 3, 5], 2: [1, 2, 3, 6], 3: [1, 3], 4: [1, 3, 4, 6], 5: [1, 3, 4, 6],
  6: 'языковыми играми', 7: 'альтруистическим', 8: 'сосуществованием', 9: 'вытеснения', 10: 'бланкетным',
  11: { A: 'рыцарь', B: 'лжец', C: 'лжец' }, 12: 'культурный капитал', 13: { A: '3', B: '2', C: '1', D: '0' },
  14: '1800', 15: 'крайняя необходимость',
  16: letters(['Е', 'Г', 'В', 'Д', 'Б']), 17: letters(['В', 'Е', 'Д', 'А', 'Г']), 18: letters(['Г', 'Ж', 'Б', 'Е', 'А']),
  19: letters(['Г', 'В', 'Ж', 'Е', 'А']), 20: letters(['Г', 'В', 'Ж', 'Д', 'А'])
};

function attemptWith(responses, now = new Date('2026-10-24T10:00:00Z')) {
  const a = M.createAttempt('HP-DIAG-1', now);
  for (const [n, v] of Object.entries(responses)) M.setResponse(a, V, Number(n), v, now);
  return a;
}

test('файлы сайта собраны из утверждённых исходных данных (node scripts/build-hp-mock.js)', () => {
  for (const [name, content] of Object.entries(build())) {
    assert.equal(fs.readFileSync(path.join(root, 'data/olympiads/hp/mock', name), 'utf8'), content, name + ' устарел');
  }
});

test('условия подключены к странице, ключи — нет; в условиях нет ключей и разборов', () => {
  const scripts = pageScripts();
  assert.ok(scripts.includes('data/olympiads/hp/mock/diag-1.js'));
  assert.ok(!scripts.includes(KEY_SRC));
  const plain = fs.readFileSync(path.join(root, 'data/olympiads/hp/mock/diag-1.js'), 'utf8');
  for (const key of ['"correct"', '"answer"', '"acceptedAnswers"', '"match"', '"explanation"', '"feedback"', '"answers"', '"matches"']) {
    assert.ok(!plain.includes(key), 'в условиях есть ' + key);
  }
  const bare = load(false);
  assert.equal(bare.mock.hasKey('HP-DIAG-1'), false);
  assert.throws(() => bare.mock.gradeAttempt(bare.mock.getVariant('HP-DIAG-1'), bare.mock.createAttempt('HP-DIAG-1')), /не загружен/);
});

test('21 задание, пять типов, 4/4/5/5/10: всего 100, автоматически 90', () => {
  assert.equal(V.tasks.length, 21);
  const expect = (n) => (n <= 5 ? 4 : n <= 10 ? 4 : n <= 15 ? 5 : n <= 20 ? 5 : 10);
  V.tasks.forEach((t) => assert.equal(t.points, expect(t.number), '№ ' + t.number));
  assert.deepEqual(V.tasks.slice(0, 5).map((t) => t.type), Array(5).fill('multiple-select'));
  assert.deepEqual(V.tasks.slice(5, 10).map((t) => t.type), Array(5).fill('short-text'));
  assert.deepEqual(V.tasks.slice(15, 20).map((t) => t.type), Array(5).fill('matching'));
  assert.equal(V.tasks[20].type, 'essay');
  assert.equal(V.maxPoints, 100);
  assert.equal(V.autoMaxPoints, 90);
  assert.equal(V.durationMinutes, 80);
});

test('тексты заданий на сайте совпадают с утверждёнными исходными', () => {
  SRC.tasks.forEach((s) => {
    const t = V.tasks[s.number - 1];
    assert.deepEqual(t.question, s.question, '№ ' + s.number);
    if (s.options && s.type === 'multiple-select') assert.deepEqual(t.options.map((o) => o.text), s.options.map((o) => o.text));
    if (s.type === 'matching') {
      assert.deepEqual(t.items.map((i) => i.text), s.items.map((i) => i.text));
      assert.deepEqual(t.options, s.options);
    }
  });
  assert.equal(V.tasks[3].options[2].text, 'При прочих равных чем эластичнее предложение по сравнению со спросом, тем бо́льшая доля бремени налога ложится на покупателей.');
});

test('ключи совпадают с материалами для преподавателя', () => {
  for (const [n, key] of Object.entries(KEYS)) {
    const g = grade(Number(n), key);
    assert.equal(g.verdict, 'correct', '№ ' + n);
    assert.equal(g.points, task(Number(n)).points, '№ ' + n);
  }
  const a = attemptWith(KEYS);
  const s = M.summarize(V, a, M.gradeAttempt(V, a));
  assert.equal(s.points, 90);
  assert.equal(s.maxPoints, 90);
  assert.equal(s.correct, 20);
  assert.equal(s.recommendations.length, 0);
});

test('текстовые ответы: засчитывается каждая утверждённая форма, ни одной предложенной без утверждения', () => {
  for (const s of SRC.tasks.filter((x) => x.type === 'short-text')) {
    const accepted = task(s.number).acceptedAnswers;
    for (const a of s.accepted) {
      assert.equal(accepted.includes(a.text), a.basis !== 'proposed', `№ ${s.number}: «${a.text}»`);
      if (a.basis !== 'proposed') assert.equal(grade(s.number, a.text).verdict, 'correct', `№ ${s.number}: «${a.text}»`);
    }
  }
});

test('утверждённые при согласовании формы засчитываются, «бланкетная норма» — нет', () => {
  const ok = { 6: ['language game', 'language-games', 'language-game', 'Sprachspiel', 'language games', 'Sprachspiele', 'языковая игра'],
    9: ['crowding-out effect', 'crowding out effect', 'вытеснения инвестиций', 'crowding out', 'эффект вытеснения'],
    10: ['бланкетным способом изложения нормы', 'бланкетный способ изложения нормы', 'бланкетным', 'бланкетный'],
    12: ['cultural capital', 'воплощённый культурный капитал'],
    15: ['причинение вреда в состоянии крайней необходимости'], 7: ['альтруистическим самоубийством'] };
  for (const [n, list] of Object.entries(ok)) for (const r of list) assert.equal(grade(Number(n), r).verdict, 'correct', `№ ${n}: «${r}»`);
  assert.equal(grade(10, 'бланкетная норма').verdict, 'incorrect');
  assert.equal(grade(14, '1800 млрд ден. ед.').verdict, 'correct');
});

test('неверные и близкие понятия из разбора не засчитываются', () => {
  for (const s of SRC.tasks.filter((x) => x.rejected)) {
    for (const r of s.rejected) assert.notEqual(grade(s.number, r).verdict, 'correct', `№ ${s.number}: «${r}»`);
  }
});

test('падеж, регистр, ё, пробелы, кавычки и точка не влияют; опечатка — влияет', () => {
  for (const r of ['сосуществованием', 'Сосуществование', 'КОХАБИТАЦИЯ', 'кохабитацией', 'cohabitation', '  «кохабитацией».  ', 'политическим сосуществованием']) {
    assert.equal(grade(8, r).verdict, 'correct', r);
  }
  assert.equal(grade(12, 'Культурным  капиталом').verdict, 'correct');
  assert.equal(grade(12, 'воплощенный культурный капитал').verdict, 'correct');
  assert.equal(grade(15, 'КРАЙНЕЙ НЕОБХОДИМОСТИ!').verdict, 'correct');
  for (const [n, r] of [[10, 'бланкитным'], [8, 'сосушествованием'], [6, 'языковыми играмии'], [7, 'алтруистическим'], [12, 'культурный капитал общества'], [9, 'crowdingout']]) {
    assert.equal(grade(n, r).verdict, 'incorrect', r);
  }
});

test('открытые ответы 11, 13, 14', () => {
  for (const r of ['1800', '1 800', '1800 млрд', ' 1800. ', '1800,0']) assert.equal(grade(14, r).verdict, 'correct', r);
  for (const r of ['1600', '2200', '2000', 'тысяча восемьсот', '18 00 0', '1800 трлн']) assert.equal(grade(14, r).verdict, 'incorrect', r);
  assert.equal(grade(13, { A: '3', B: '1', C: '1', D: '1' }).verdict, 'incorrect');      // квота Хэра
  assert.equal(grade(13, { A: '3', B: '2', C: '1', D: null }).verdict, 'incorrect');     // пустое поле
  assert.equal(grade(11, { A: 'лжец', B: 'рыцарь', C: 'рыцарь' }).verdict, 'incorrect');
  assert.equal(grade(11, { A: 'рыцарь', B: 'лжец', C: null }).verdict, 'incorrect');
});

test('строгая схема — только полностью верный ответ; диагностическая — частичные баллы только в 1–5 и 16–20', () => {
  assert.equal(grade(4, [1, 3, 4]).points, 0);
  assert.equal(grade(4, [1, 3, 4], 'diagnostic').points, 2);         // один пропуск
  assert.equal(grade(4, [1, 3, 4, 6, 2], 'diagnostic').points, 2);   // один лишний
  assert.equal(grade(4, [1, 3, 4, 2], 'diagnostic').points, 0);      // пропуск и лишний
  assert.equal(grade(4, [1, 2, 3, 4, 5, 6], 'diagnostic').points, 0);
  assert.equal(grade(3, [1], 'diagnostic').points, 2);
  assert.equal(grade(16, letters(['Е', 'Г', 'В', 'Б', 'Д'])).points, 0);
  assert.equal(grade(16, letters(['Е', 'Г', 'В', 'Б', 'Д']), 'diagnostic').points, 3);
  assert.equal(grade(16, letters(['Е', null, null, null, null]), 'diagnostic').points, 1);
  assert.equal(grade(13, { A: '3', B: '1', C: '1', D: '1' }, 'diagnostic').points, 0);
  assert.equal(grade(7, 'фаталистическим', 'diagnostic').points, 0);
  assert.equal(V.scoring.main, 'strict');
  assert.equal(V.scoring.alternative, 'diagnostic');
});

test('итоги: смешанный ответ — 50 из 90 по строгой схеме, 57 по диагностической; дисциплины по метаданным', () => {
  const a = attemptWith({
    1: [1, 3, 5], 2: [1, 2, 3], 3: [1, 3, 4], 5: [1, 3, 4, 6], 6: 'Языковые игры', 7: 'фаталистическим',
    8: 'кохабитацией', 9: 'crowding out', 10: 'бланкитным', 11: KEYS[11], 12: 'культурным капиталом',
    13: { A: '3', B: '1', C: '1', D: '1' }, 14: '1 800', 16: KEYS[16], 17: letters(['В', 'Е', 'Д', 'Г', 'А']),
    18: KEYS[18], 20: KEYS[20], 21: 'Текст эссе о Гоббсе и доверии.'
  });
  M.finish(a, 'manual', new Date('2026-10-24T10:30:00Z'));
  const s = M.summarize(V, a, M.gradeAttempt(V, a));
  assert.equal(s.points, 50);
  assert.equal(s.altPoints, 57);
  assert.equal(s.maxPoints, 90);
  assert.deepEqual([s.correct, s.incorrect, s.unanswered, s.total], [11, 6, 3, 20]);
  assert.deepEqual(s.disciplines.map((d) => [d.id, d.points, d.maxPoints]),
    [['PHI', 18, 18], ['SOC', 5, 18], ['POL', 9, 18], ['ECO', 9, 18], ['LAW', 9, 18]]);
  // Дисциплины — по полю discipline заданий, а не по номерам.
  assert.deepEqual(s.disciplines.find((d) => d.id === 'LAW').tasks, V.tasks.filter((t) => t.discipline === 'LAW').map((t) => t.number));
  assert.deepEqual(s.recommendations.map((r) => r.number), [2, 3, 4, 7, 10, 13, 15, 17, 19]);
  assert.ok(s.recommendations.some((r) => r.text === 'Повторить: теория аномии Р. Мертона и типы приспособления'));
  assert.equal(s.durationMs, 30 * 60000);
});

test('мини-эссе не оценивается автоматически: нет баллов и нет фиктивного нуля; итог из 100 не окончательный', () => {
  const g = grade(21, 'По Гоббсу, доверие, институт, рынок, контракт, собственность, государство, легитимность.');
  assert.equal(g.verdict, 'ungraded');
  assert.equal(g.points, null);
  assert.equal(g.scored, false);
  const a = attemptWith({ 21: 'Текст.' });
  const s = M.summarize(V, a, M.gradeAttempt(V, a));
  assert.equal(s.maxPoints, 90);
  assert.equal(s.final, false);
  assert.deepEqual(s.essays.map((e) => [e.number, e.status, e.maxPoints]), [[21, 'written', 10]]);
  assert.ok(s.disciplines.every((d) => !d.tasks.includes(21)));
  const empty = attemptWith({});
  assert.equal(M.summarize(V, empty, M.gradeAttempt(V, empty)).essays[0].status, 'empty');
});

test('таймер: дедлайн через 80 минут; после него ответы не принимаются; завершение по таймеру — на дедлайне', () => {
  const t0 = new Date('2026-10-24T10:00:00Z');
  const a = M.createAttempt('HP-DIAG-1', t0);
  assert.equal(a.deadline, '2026-10-24T11:20:00.000Z');
  assert.equal(M.formatClock(M.remainingMs(a, t0)), '1:20:00');
  assert.equal(M.formatClock(M.remainingMs(a, new Date('2026-10-24T11:15:51Z'))), '04:09');
  M.setResponse(a, V, 6, 'языковые игры', new Date('2026-10-24T11:19:59Z'));
  const late = new Date('2026-10-24T12:00:00Z');
  assert.equal(M.isExpired(a, late), true);
  assert.throws(() => M.setResponse(a, V, 7, 'альтруистическим', late), /Время вышло/);
  M.finish(a, 'timeout', late);
  assert.equal(a.finishedAt, a.deadline);
  assert.equal(a.finishReason, 'timeout');
  assert.throws(() => M.setResponse(a, V, 7, 'x', late), /завершена/);
  M.finish(a, 'manual', late); // повторный вызов ничего не меняет
  assert.equal(a.finishReason, 'timeout');
  assert.equal(M.summarize(V, a, M.gradeAttempt(V, a)).points, 4);
});

test('сохранение: попытка переживает перезагрузку, повреждённые ответы отбрасываются', () => {
  const memory = {};
  const backend = { read: (k) => (k in memory ? JSON.parse(memory[k]) : null), write: (k, v) => { memory[k] = JSON.stringify(v); } };
  const store = M.createStore(backend);
  const a = attemptWith({ 1: [1, 3], 6: 'языковые игры', 13: { A: '3', B: '', C: null, D: '0' }, 16: letters(['Е', null, null, null, null]), 21: 'эссе' });
  store.save(a);
  const b = store.load(V);
  assert.deepEqual(b, JSON.parse(JSON.stringify(a)));
  assert.equal(M.answeredCount(b, V), 5);
  // Повреждённые данные: неверная структура ответа, лишний номер, чужой вариант.
  const all = JSON.parse(memory[M.STORAGE_KEY]);
  all['HP-DIAG-1'].responses['1'] = { value: [99] };
  all['HP-DIAG-1'].responses['77'] = { value: 'x' };
  all['HP-DIAG-1'].responses['16'] = { value: [2, 2, null, null, null] };
  memory[M.STORAGE_KEY] = JSON.stringify(all);
  const c = store.load(V);
  assert.deepEqual(Object.keys(c.responses).sort(), ['13', '21', '6']);
  assert.equal(M.restore({ ...a, variantId: 'OTHER' }, V), null);
  assert.equal(M.restore({ ...a, schemaVersion: 99 }, V), null);
  assert.equal(M.restore('мусор', V), null);
  store.remove('HP-DIAG-1');
  assert.equal(store.load(V), null);
});

test('соотнесение: буква используется один раз; запись ответа — «1 — Е, …»', () => {
  const a = M.createAttempt('HP-DIAG-1');
  assert.throws(() => M.setResponse(a, V, 16, letters(['Е', 'Е', null, null, null])), /один раз/);
  assert.equal(OLY.types.get('matching').formatResponse(task(16), letters(['Е', 'Г', null, 'Д', 'Б'])), '1 — Е, 2 — Г, 3 — ?, 4 — Д, 5 — Б');
});

test('тематическая тренировка не изменилась: заданий пробника нет в банке', () => {
  assert.equal(OLY.tasks.filter((t) => /DIAG/.test(t.id)).length, 0);
  assert.equal(OLY.query({ olympiad: 'HP' }).filter((t) => /DIAG/.test(t.id)).length, 0);
  assert.equal(OLY.sources.filter((s) => /DIAG/.test(s.id)).length, 0);
});

test('разборы: у каждого задания — все блоки обратной связи; эссе — рубрика и три образца', () => {
  for (let n = 1; n <= 20; n++) {
    const t = task(n);
    const f = t.key.feedback;
    assert.ok(f.why.length && f.mistakes.length && f.remember && f.review && f.recommendation.startsWith('Повторить: '), '№ ' + n);
    if (t.type === 'multiple-select') t.options.forEach((o, i) => assert.ok(o.explanation, `№ ${n}, вариант ${i + 1}`));
    if (t.type === 'matching') {
      t.items.forEach((it, i) => assert.ok(it.explanation, `№ ${n}, пара ${i + 1}`));
      assert.equal(Object.keys(t.key.extraExplanations).length, 2);
    }
  }
  for (const n of [11, 13, 14]) assert.ok(task(n).key.feedback.steps.length >= 3, `№ ${n}: нет решения по шагам`);
  assert.equal(task(13).key.feedback.table.rows.length, 5);
  const e = task(21).key.feedback;
  assert.equal(e.samples.length, 3);
  assert.equal(e.rubric.reduce((s, r) => s + r.max, 0), 10);
  assert.match(e.samplesNote, /возможные варианты рассуждения, а не единственно правильные ответы/);
});

test('уточнения преподавателя: № 9 — инфляция не только при эмиссии; № 20 — не все презумпции опровержимы, фикция — доктринально', () => {
  const t9 = JSON.stringify(task(9).key.feedback);
  assert.match(t9, /возможны при любом способе финансирования дефицита/);
  assert.doesNotMatch(t9, /а не для заимствований/);
  const t20 = JSON.stringify(task(20).key.feedback) + JSON.stringify(task(20).items);
  assert.match(t20, /Большинство презумпций опровержимы/);
  assert.match(t20, /неопровержимые презумпции/);
  assert.doesNotMatch(t20, /Презумпция опровержима\./);
  assert.match(t20, /доктринальн/);
});

test('№ 1: сначала субъект и предикат суждения (не путать с познающим субъектом), затем аналитические/синтетические, затем a priori/a posteriori; разбор шести вариантов сохранён', () => {
  const why = task(1).key.feedback.why.join(' ');
  const at = (s) => why.indexOf(s);
  for (const s of ['субъект суждения', 'предикат суждения', 'не познающий субъект', 'Все тела протяжённы']) assert.ok(at(s) !== -1, s);
  assert.ok(at('предикат суждения') < at('аналитические и синтетические'));
  assert.ok(at('аналитические и синтетические') < at('a priori и a posteriori'));
  assert.ok(at('a priori и a posteriori') < at('синтетические суждения a priori: они'));
  assert.equal(task(1).options.filter((o) => o.explanation).length, 6);
  assert.equal(task(1).options[5].explanation, SRC.tasks[0].options[5].explanation);
});

test('стартовая страница: «Авторский диагностический вариант.»', () => {
  assert.equal(V.disclaimer, 'Авторский диагностический вариант.');
});

test('разборы начинаются с пояснения специальных терминов', () => {
  const first = (n) => task(n).key.feedback.why[0];
  for (const [n, term] of [[4, 'эластичность'], [5, 'Дееспособность'], [7, 'интеграция'], [9, 'Мультипликатор'], [11, 'посылкой'],
    [13, 'квоту'], [14, 'Рабочая сила'], [16, 'Эмпиризм'], [18, 'Естественное состояние'], [19, 'неисключаемо']]) {
    assert.ok(task(n).key.feedback.why.slice(0, 2).join(' ').includes(term), `№ ${n}: «${term}»`);
  }
  assert.ok(first(17).startsWith('Социальная мобильность —'));
  assert.equal(task(21).key.feedback.concepts.length, 6);
});

test('№ 6: семейное сходство — без утверждения, что общего признака нет; № 21: институты Норта ≠ организации', () => {
  const t6 = task(6).key.feedback.why.join(' ');
  assert.doesNotMatch(t6, /нет одного общего признака/);
  assert.match(t6, /не обязательно объединены единой общей сущностью/);
  assert.match(t6, /частично пересекающиеся сходства/);
  const inst = task(21).key.feedback.concepts.find((c) => c.term === 'Институт').text;
  assert.match(inst, /«правила игры»/);
  assert.match(inst, /Организации .* не институты, а «игроки»/);
  assert.match(inst, /определения социального института у разных авторов различаются/);
});

test('уточнения после публикации: № 5 (вариант 2) и № 20 (позиция 4); ключи прежние; других изменений текста нет', () => {
  assert.equal(V.tasks[4].options[1].text, 'Продать дорогостоящий смартфон, подаренный ему бабушкой, за 80 000 рублей, без согласия родителей.');
  assert.deepEqual(KEYS[5], [1, 3, 4, 6]);
  assert.equal(grade(5, [1, 3, 4, 6]).verdict, 'correct');
  assert.equal(grade(5, [1, 2, 3, 4, 6]).verdict, 'incorrect');
  assert.equal(task(5).options[1].correct, false);
  assert.match(task(5).options[1].explanation, /80 000 рублей — и не мелкая бытовая сделка/);
  assert.equal(V.tasks[19].items[3].text, 'Если ребёнок родился у лиц, состоящих в браке между собой, отцом ребёнка признаётся супруг матери, если не доказано иное.');
  assert.equal(grade(20, KEYS[20]).verdict, 'correct');
  const t20 = JSON.stringify(task(20));
  assert.doesNotMatch(t20, /пока не доказано иное|записывается/);
  assert.match(t20, /«если не доказано иное»/);
  assert.match(t20, /Проверочный вопрос для разграничения акта и поступка/);
  // Исходные формулировки DOCX сохранены в исходных данных; изменены только две.
  const edited = SRC.tasks.flatMap((t) => [...(t.options || []), ...(t.items || [])]).filter((o) => o && o.originalText);
  assert.equal(edited.length, 2);
});

test('авторская диагностическая схема: название и описание', () => {
  assert.equal(V.scoring.schemes.diagnostic.title, 'Авторская диагностическая схема');
  assert.doesNotMatch(V.scoring.schemes.diagnostic.note, /не официальная система оценивания/);
});

test('№ 16: уточнённые определения эмпиризма и рационализма и пояснение об их разногласии', () => {
  const why = task(16).key.feedback.why;
  assert.match(why[0], /^Сначала о понятиях\. Эмпиризм — направление в теории познания, согласно которому основным источником знаний является чувственный опыт\./);
  assert.match(why[0], /Рационализм — направление в теории познания, согласно которому разум играет ведущую роль в получении и обосновании достоверного знания\./);
  assert.equal(why[1], 'Эмпирики не отрицают роль разума, а рационалисты — роль чувственного опыта. Их разногласие заключается прежде всего в том, что служит основанием знания и позволяет обосновать его достоверность.');
  assert.doesNotMatch(why.join(' '), /направление, по которому источник знания — опыт/);
  assert.equal(grade(16, KEYS[16]).verdict, 'correct');
});

test('типы ядра: кавычки и знаки по краям, приписка единиц, мини-эссе и подсчёт слов', () => {
  const N = OLY.normalize;
  assert.equal(N.normalizeText(' «Ёлка». ', { yo: true, punctuation: true }), 'елка');
  assert.equal(N.normalizeText('«Ёлка».', { yo: true }), '«елка».');                 // без настройки — как раньше
  assert.equal(N.parseNumber('1800 млрд', ['млрд']), 1800);
  assert.equal(N.parseNumber('1800 млрд'), null);                                    // без настройки — как раньше
  assert.equal(N.parseNumber('1800млрд', ['млрд']), null);
  assert.equal(OLY.types.countWords('Гоббс — «Левиафан», 1651 год; социально-экономический'), 5);
  assert.deepEqual(OLY.types.get('essay').check({}, 'текст').verdict, 'ungraded');
});

test('маршруты пробного тура', () => {
  const r = OLY.ui.router;
  assert.deepEqual(r.parse('#/hp/mock'), { olympiad: 'HP', name: 'mock' });
  assert.deepEqual(r.parse('#/hp/mock/hp-diag-1/run'), { olympiad: 'HP', variant: 'HP-DIAG-1', name: 'mock-run' });
  assert.equal(r.format({ name: 'mock-result', olympiad: 'HP', variant: 'HP-DIAG-1' }), '#/hp/mock/hp-diag-1/result');
  assert.deepEqual(r.parse('#/hp/mock/hp-diag-1/x'), { name: 'unknown' });
  assert.deepEqual(r.parse('#/hp/SOC/SOC-CAR/train'), { olympiad: 'HP', discipline: 'SOC', topic: 'SOC-CAR', name: 'train' });
});
