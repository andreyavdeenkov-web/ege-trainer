'use strict';

/**
 * Олимпиады: модули интерфейса без DOM — адреса экранов, подписи, фильтры,
 * логика тренировки. Работают на реальном банке; дополнительные источники
 * и задания, которые добавляются в отдельных тестах, — тестовые (id с TEST).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBank, officialScoring } = require('./helpers/olymp.js');

const SCOPE_SOC = { olympiad: 'HP', subject: 'social', discipline: 'SOC' };
const SCOPE_CAR = { ...SCOPE_SOC, topic: 'SOC-CAR' };

/* ---------- Адреса экранов ---------- */

test('router: разбор адресов; предмета в адресе нет', () => {
  const { parse } = loadBank().ui.router;
  assert.deepEqual(parse(''), { name: 'home' });
  assert.deepEqual(parse('#/'), { name: 'home' });
  assert.deepEqual(parse('#/hp'), { name: 'olympiad', olympiad: 'HP' });
  assert.deepEqual(parse('#/hp/soc'), { name: 'discipline', olympiad: 'HP', discipline: 'SOC' });
  assert.deepEqual(parse('#/hp/SOC/SOC-CAR'), { name: 'setup', olympiad: 'HP', discipline: 'SOC', topic: 'SOC-CAR' });
  assert.deepEqual(parse('#/hp/SOC/all'), { name: 'setup', olympiad: 'HP', discipline: 'SOC', topic: 'all' });
  assert.deepEqual(parse('#/hp/SOC/SOC-CAR/train'), { name: 'train', olympiad: 'HP', discipline: 'SOC', topic: 'SOC-CAR' });
  assert.deepEqual(parse('#/hp/SOC/SOC-CAR/result/'), { name: 'result', olympiad: 'HP', discipline: 'SOC', topic: 'SOC-CAR' });
  assert.deepEqual(parse('#/hp/SOC/SOC-CAR/other'), { name: 'unknown' });
});

test('router: адрес собирается обратно', () => {
  const { parse, format, withName } = loadBank().ui.router;
  for (const hash of ['#/', '#/hp', '#/hp/SOC', '#/hp/SOC/SOC-CAR', '#/hp/SOC/all', '#/hp/SOC/SOC-CAR/train', '#/hp/SOC/all/result']) {
    assert.equal(format(parse(hash)), hash);
  }
  assert.equal(format(withName(parse('#/hp/SOC/SOC-CAR'), 'train')), '#/hp/SOC/SOC-CAR/train');
});

/* ---------- Подписи ---------- */

test('подписи: склонения, римские номера туров, классы', () => {
  const f = loadBank().ui.format;
  assert.equal(f.tasksCount(1), '1 задание');
  assert.equal(f.tasksCount(3), '3 задания');
  assert.equal(f.tasksCount(11), '11 заданий');
  assert.equal(f.tasksCount(22), '22 задания');
  assert.equal(f.topicsCount(5), '5 тем');
  assert.equal(f.roundLabel(1), 'I тур');
  assert.equal(f.roundLabel(2), 'II тур');
  assert.equal(f.classesLabel([9]), '9 класс');
  assert.equal(f.classesLabel([11, 10]), '10–11 классы');
  assert.equal(f.classesLabel([9, 11]), '9, 11 классы');
  assert.equal(f.classesLabel([]), '');
});

test('строка источника для ученика — без технических полей', () => {
  const OLY = loadBank();
  const [appearance] = OLY.getAppearances('HP-SOC-CAR-001');
  const line = OLY.ui.format.sourceLine(appearance);
  assert.equal(line, 'Официальная демоверсия «Высшей пробы», 2026/27 · 9 класс · отборочный этап · I тур · № 2');
  assert.ok(!/official|answersBasis|ключ/i.test(line));
  assert.equal(OLY.ui.format.taskTopicLabel(OLY.getTask('HP-LAW-FAM-001')), 'Право · Семейное право');
  assert.equal(OLY.ui.format.disciplineColor('social', 'PHI'), '#8b5cf6');
});

/* ---------- Отрисовка типов ---------- */

test('у каждого типа заданий в банке есть отрисовка', () => {
  const OLY = loadBank();
  for (const task of OLY.tasks) {
    assert.ok(OLY.ui.views.has(task.type), `${task.id}: нет отрисовки для ${task.type}`);
  }
  assert.deepEqual(OLY.ui.views.list(), ['single-select', 'multiple-select']);
});

test('реестр отрисовки: новый тип подключается регистрацией', () => {
  const OLY = loadBank();
  assert.throws(() => OLY.ui.views.register('short-text', { hint() {} }), /нет функции render/);
  OLY.ui.views.register('short-text', { hint: () => '', render: () => ({ set() {} }), renderReview: () => {} });
  assert.ok(OLY.ui.views.has('short-text'));
  assert.throws(() => OLY.ui.views.register('short-text', {}), /уже зарегистрирована/);
});

test('задания типов без отрисовки в тренировку не попадают', () => {
  const OLY = loadBank();
  OLY.addTasks([{
    id: 'HP-SOC-CAR-901', olympiad: 'HP', subject: 'social', discipline: 'SOC', topic: 'SOC-CAR',
    type: 'short-text', question: 'Тестовое задание', acceptedAnswers: ['тест'], scoring: null
  }]);
  assert.equal(OLY.query(SCOPE_CAR).length, 2);
  assert.deepEqual(OLY.ui.filters.buildPool(SCOPE_CAR, {}).map((t) => t.id), ['HP-SOC-CAR-001']);
});

/* ---------- Фильтры ---------- */

function group(groups, key) {
  return groups.find((g) => g.key === key);
}

function optionSummary(g) {
  return g.options.map((o) => [o.label, o.count, o.disabled, o.checked]);
}

test('фильтры по умолчанию: класс и тур всегда, остальные — только при выборе', () => {
  const OLY = loadBank();
  const groups = OLY.ui.filters.describe(SCOPE_CAR, {});
  assert.deepEqual(groups.map((g) => g.key), ['class', 'round']);
  assert.deepEqual(optionSummary(group(groups, 'class')), [
    ['Все', 1, false, true], ['9', 1, false, false], ['10', 0, true, false], ['11', 0, true, false]
  ]);
  assert.deepEqual(optionSummary(group(groups, 'round')), [
    ['Все', 1, false, true], ['I тур', 1, false, false], ['II тур', 0, true, false]
  ]);
});

test('выборка: тема, вся дисциплина, фильтры', () => {
  const F = loadBank().ui.filters;
  assert.deepEqual(F.buildPool(SCOPE_CAR, {}).map((t) => t.id), ['HP-SOC-CAR-001']);
  assert.deepEqual(F.buildPool({ ...SCOPE_SOC, topic: 'all' }, {}).map((t) => t.id), ['HP-SOC-CAR-001']);
  assert.equal(F.buildPool(SCOPE_CAR, { class: 9, round: 1 }).length, 1);
  assert.equal(F.buildPool(SCOPE_CAR, { class: 10 }).length, 0);
  assert.equal(F.buildPool(SCOPE_CAR, { class: 'all', round: 'all' }).length, 1);
  assert.equal(F.buildPool({ olympiad: 'HP', subject: 'social' }, { class: 9, stage: 'qualifying', round: 1 }).length, 5);
});

test('задания разных классов объединяются в теме; фильтры этапа, года и источника появляются по данным', () => {
  const OLY = loadBank();
  // Тестовый источник другого вида, класса, этапа и тура для того же задания.
  OLY.addSource({
    id: 'HP-TEST-PAST-10-2', olympiad: 'HP', subject: 'social', kind: 'past', year: '2025/26',
    classes: [10], stage: 'final', round: 2, title: 'Тестовый источник', answersBasis: 'official',
    items: [{ number: 1, taskId: 'HP-SOC-CAR-001' }]
  });
  const F = OLY.ui.filters;
  const groups = F.describe(SCOPE_CAR, {});
  assert.deepEqual(groups.map((g) => g.key), ['class', 'round', 'stage', 'year', 'sourceKind']);
  assert.deepEqual(group(groups, 'stage').options.map((o) => o.label), ['Все', 'Отборочный', 'Заключительный']);
  assert.deepEqual(group(groups, 'sourceKind').options.map((o) => o.label),
    ['Все', 'Официальные демоверсии', 'Задания прошлых лет']);
  // Одно задание, два класса: и 9, и 10 находят его.
  assert.equal(F.buildPool(SCOPE_CAR, { class: 9 }).length, 1);
  assert.equal(F.buildPool(SCOPE_CAR, { class: 10 }).length, 1);
  // Счётчики учитывают остальные выбранные фильтры: 10 класс + I тур — ничего.
  const withClass10 = F.describe(SCOPE_CAR, { class: 10 });
  assert.deepEqual(group(withClass10, 'round').options.map((o) => o.count), [1, 0, 1]);
  assert.equal(F.buildPool(SCOPE_CAR, { sourceKind: 'past' }).length, 1);
  assert.equal(OLY.ui.format.sourceLine(OLY.getAppearances('HP-SOC-CAR-001')[1]),
    'Олимпиада «Высшая проба», 2025/26 · 10 класс · заключительный этап · II тур · № 1');
});

test('normalize: скрытые и недопустимые значения сбрасываются на «Все»', () => {
  const F = loadBank().ui.filters;
  assert.deepEqual(F.normalize(SCOPE_CAR, { class: 9, round: 1 }), { class: 9, round: 1 });
  assert.deepEqual(F.normalize(SCOPE_CAR, { class: 12, round: '1', stage: 'final', year: '1999/00' }),
    { class: 'all', round: 'all' });
  assert.deepEqual(F.normalize(SCOPE_CAR, undefined), { class: 'all', round: 'all' });
  assert.ok(F.isDefault({ class: 'all', round: 'all' }));
  assert.ok(!F.isDefault({ class: 9, round: 'all' }));
});

test('реестр фильтров расширяется без изменения экранов', () => {
  const OLY = loadBank();
  const F = OLY.ui.filters;
  assert.deepEqual(F.list().map((f) => f.key), ['class', 'round', 'stage', 'year', 'sourceKind', 'type']);
  assert.throws(() => F.register({ key: 'class', label: 'x', values: () => [] }), /уже зарегистрирован/);
  F.register({ key: 'discipline', label: 'Дисциплина', always: true, values: () => ['SOC', 'LAW'], format: (v) => v });
  const groups = F.describe({ olympiad: 'HP', subject: 'social' }, {});
  assert.deepEqual(group(groups, 'discipline').options.map((o) => [o.value, o.count]), [['all', 25], ['SOC', 1], ['LAW', 1]]);
});

/* ---------- Тренировка ---------- */

function practice(OLY, taskIds) {
  return OLY.attempt.createAttempt({
    mode: 'practice', olympiad: 'HP', subject: 'social',
    settings: { discipline: 'all', topic: 'all', filters: {} },
    taskIds: taskIds || ['HP-PHI-RUS-001', 'HP-SOC-CAR-001', 'HP-POL-RAT-001', 'HP-ECO-INE-001', 'HP-LAW-FAM-001']
  });
}

test('состояния заданий: без ответа, черновик, верно, неверно', () => {
  const OLY = loadBank();
  const A = OLY.attempt;
  const S = OLY.ui.session;
  const attempt = practice(OLY);
  A.setResponse(attempt, 'HP-SOC-CAR-001', 2);
  A.check(attempt, 'HP-SOC-CAR-001');
  A.setResponse(attempt, 'HP-POL-RAT-001', 2);
  A.check(attempt, 'HP-POL-RAT-001');
  A.setResponse(attempt, 'HP-ECO-INE-001', [1]);
  assert.deepEqual(S.navItems(attempt).map((i) => i.state), ['empty', 'correct', 'incorrect', 'draft', 'empty']);
  assert.equal(S.checkedCount(attempt), 2);
  assert.equal(S.uncheckedCount(attempt), 3);
  // Черновик, снятый до пустого, снова «без ответа».
  A.setResponse(attempt, 'HP-ECO-INE-001', []);
  assert.equal(S.taskState(attempt, 'HP-ECO-INE-001'), 'empty');
});

test('следующее непроверенное задание — по кругу; -1, если все проверены', () => {
  const OLY = loadBank();
  const A = OLY.attempt;
  const S = OLY.ui.session;
  const attempt = practice(OLY, ['HP-SOC-CAR-001', 'HP-POL-RAT-001', 'HP-PHI-RUS-001']);
  assert.equal(S.nextUnchecked(attempt, 0), 1);
  assert.equal(S.nextUnchecked(attempt, 2), 0);
  A.setResponse(attempt, 'HP-POL-RAT-001', 1);
  A.check(attempt, 'HP-POL-RAT-001');
  assert.equal(S.nextUnchecked(attempt, 0), 2);
  A.setResponse(attempt, 'HP-PHI-RUS-001', [1]);
  A.check(attempt, 'HP-PHI-RUS-001');
  assert.equal(S.nextUnchecked(attempt, 2), 0);   // осталось только текущее
  A.setResponse(attempt, 'HP-SOC-CAR-001', 2);
  A.check(attempt, 'HP-SOC-CAR-001');
  assert.equal(S.nextUnchecked(attempt, 0), -1);
});

test('прогресс для подтверждения выхода', () => {
  const OLY = loadBank();
  const S = OLY.ui.session;
  const attempt = practice(OLY);
  assert.equal(S.hasProgress(attempt), false);
  OLY.attempt.setResponse(attempt, 'HP-LAW-FAM-001', [1]);
  assert.equal(S.hasProgress(attempt), true);
  OLY.attempt.finish(attempt);
  assert.equal(S.hasProgress(attempt), false);
});

test('итоги без критериев: только верно / неверно / пропущено, без баллов', () => {
  const OLY = loadBank();
  const A = OLY.attempt;
  const S = OLY.ui.session;
  const attempt = practice(OLY);
  A.setResponse(attempt, 'HP-PHI-RUS-001', [1, 2, 3, 4]);
  A.check(attempt, 'HP-PHI-RUS-001');
  A.setResponse(attempt, 'HP-LAW-FAM-001', [1, 3]);
  A.check(attempt, 'HP-LAW-FAM-001');
  A.setResponse(attempt, 'HP-SOC-CAR-001', 2);          // черновик без проверки
  A.finish(attempt);
  assert.deepEqual(S.outcome(attempt), {
    total: 5, correct: 1, incorrect: 1, skipped: 3,
    showPoints: false, points: 0, maxPoints: 0, scoredCount: 0
  });
  assert.deepEqual(S.subsetIds(attempt, 'mistakes'), ['HP-LAW-FAM-001']);
  assert.deepEqual(S.subsetIds(attempt, 'skipped'), ['HP-SOC-CAR-001', 'HP-POL-RAT-001', 'HP-ECO-INE-001']);
});

test('итоги: баллы показываются отдельно, если у задания есть критерии', () => {
  const OLY = loadBank();
  // Тестовое правило и задание — только чтобы проверить отображение баллов.
  OLY.scoringRules.register('test-all-or-nothing', { supports: '*', score: (r, max) => (r.verdict === 'correct' ? max : 0) });
  OLY.addTasks([{
    id: 'HP-SOC-CAR-902', olympiad: 'HP', subject: 'social', discipline: 'SOC', topic: 'SOC-CAR',
    type: 'single-select', question: 'Тестовое задание',
    options: [{ text: 'a', correct: true }, { text: 'b', correct: false }],
    scoring: officialScoring('test-all-or-nothing', 3)
  }]);
  const A = OLY.attempt;
  const attempt = practice(OLY, ['HP-SOC-CAR-001', 'HP-SOC-CAR-902']);
  A.setResponse(attempt, 'HP-SOC-CAR-001', 2);
  A.check(attempt, 'HP-SOC-CAR-001');
  A.setResponse(attempt, 'HP-SOC-CAR-902', 1);
  A.check(attempt, 'HP-SOC-CAR-902');
  A.finish(attempt);
  const o = OLY.ui.session.outcome(attempt);
  assert.equal(o.correct, 2);
  assert.equal(o.showPoints, true);
  assert.deepEqual([o.points, o.maxPoints, o.scoredCount], [3, 3, 1]);
});

test('shuffle не теряет и не дублирует задания', () => {
  const S = loadBank().ui.session;
  const list = ['a', 'b', 'c', 'd', 'e'];
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const shuffled = S.shuffle(list, random);
  assert.deepEqual([...shuffled].sort(), list);
  assert.deepEqual(list, ['a', 'b', 'c', 'd', 'e']);
});
