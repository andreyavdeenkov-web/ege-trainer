'use strict';

/**
 * Олимпиадный практикум: трек без классов, туров и источников; разделы
 * дисциплин и блоки тем; учебные поля заданий (section, block, order, level,
 * tags, typicalMistake); фильтр сложности и учебный порядок в интерфейсе.
 * Задания здесь тестовые (номера 9xx или трек TPR).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, loadBank } = require('./helpers/olymp.js');

/** Каталог с разделами и блоками, олимпиада TST и практикум TPR. */
function catalog(OLY) {
  OLY.defineSubject({
    id: 'social', title: 'Обществознание',
    disciplines: [
      { id: 'LAW', title: 'Право', sections: [{ id: 'theory', title: 'Теория права' }], topics: [
        { id: 'LAW-CPT', title: 'Что такое право?', section: 'theory',
          blocks: [{ id: 'concept', title: 'Понятие права' }, { id: 'methods', title: 'Методы' }] },
        { id: 'LAW-FAM', title: 'Семейное право' }
      ] },
      { id: 'PHI', title: 'Философия', topics: [{ id: 'PHI-HIS', title: 'Философия истории' }] }
    ]
  });
  OLY.defineOlympiad({ id: 'TST', title: 'Тестовая олимпиада', subjects: ['social'], classes: [9], rounds: [1] });
  OLY.defineOlympiad({ id: 'TPR', kind: 'practicum', title: 'Тестовый практикум', subjects: ['social'] });
}

function practicumTask(overrides) {
  return Object.assign({
    id: 'TPR-LAW-CPT-001', olympiad: 'TPR', subject: 'social', discipline: 'LAW', topic: 'LAW-CPT',
    section: 'theory', block: 'concept', order: 1, level: 1, tags: ['позитивизм'],
    type: 'single-select', question: 'Вопрос?',
    options: [{ text: 'a', correct: true }, { text: 'b', correct: false, explanation: 'Почему нет' }],
    explanation: 'Разбор', scoring: null
  }, overrides);
}

function withoutKey(object, key) {
  const copy = { ...object };
  delete copy[key];
  return copy;
}

/* ---------- Каталог: разделы и блоки ---------- */

test('каталог: разделы дисциплины и блоки темы', () => {
  const OLY = loadCore();
  catalog(OLY);
  assert.equal(OLY.getSection('social', 'LAW', 'theory').title, 'Теория права');
  assert.equal(OLY.getSection('social', 'LAW', 'other'), null);
  assert.equal(OLY.getSection('social', 'PHI', 'theory'), null);
  assert.equal(OLY.getBlock('social', 'LAW-CPT', 'methods').title, 'Методы');
  assert.equal(OLY.getBlock('social', 'LAW-FAM', 'concept'), null);
});

test('каталог: тема ссылается только на существующий раздел; блоки и разделы проверяются', () => {
  const define = (discipline) => {
    const OLY = loadCore();
    OLY.defineSubject({ id: 'social', title: 'Обществознание', disciplines: [discipline] });
  };
  assert.throws(() => define({ id: 'LAW', title: 'Право', topics: [{ id: 'LAW-CPT', title: 'x', section: 'theory' }] }),
    /неизвестный раздел theory/);
  assert.throws(() => define({ id: 'LAW', title: 'Право', sections: [{ id: 'theory', title: 'a' }, { id: 'theory', title: 'b' }] }),
    /повторяется/);
  assert.throws(() => define({ id: 'LAW', title: 'Право', sections: [{ id: 'Theory', title: 'a' }] }), /некорректный id/);
  assert.throws(() => define({ id: 'LAW', title: 'Право', topics: [{ id: 'LAW-CPT', title: 'x', blocks: [] }] }),
    /непустой список/);
  assert.throws(() => define({ id: 'LAW', title: 'Право', topics: [{ id: 'LAW-CPT', title: 'x', blocks: [{ id: 'a' }] }] }),
    /нет названия/);
});

/* ---------- Трек «практикум» ---------- */

test('практикум: без классов, этапов и туров; kind проверяется', () => {
  const OLY = loadCore();
  catalog(OLY);
  assert.ok(OLY.isPracticum('TPR'));
  assert.ok(!OLY.isPracticum('TST'));
  assert.ok(OLY.isPracticum(OLY.getOlympiad('TPR')));
  assert.throws(() => OLY.defineOlympiad({ id: 'TPA', kind: 'practicum', title: 'x', subjects: ['social'], classes: [9] }),
    /поле classes не указывается/);
  assert.throws(() => OLY.defineOlympiad({ id: 'TPB', kind: 'other', title: 'x', subjects: ['social'], classes: [9], rounds: [1] }),
    /kind должно быть одним из/);
  // Олимпиада по-прежнему требует классы и туры.
  assert.throws(() => OLY.defineOlympiad({ id: 'TPC', title: 'x', subjects: ['social'] }), /classes/);
});

test('практикум: источники запрещены', () => {
  const OLY = loadCore();
  catalog(OLY);
  OLY.addTasks([practicumTask()]);
  assert.throws(() => OLY.addSource({
    id: 'TPR-AUTHOR-1', olympiad: 'TPR', subject: 'social', kind: 'author-set', title: 'x',
    answersBasis: 'author', items: [{ number: 1, taskId: 'TPR-LAW-CPT-001' }]
  }), /у практикума нет источников/);
});

/* ---------- Учебные поля задания ---------- */

test('задание практикума: section, block, order, level, tags и explanation обязательны', () => {
  for (const key of ['section', 'block', 'order', 'level', 'tags', 'explanation']) {
    const OLY = loadCore();
    catalog(OLY);
    assert.throws(() => OLY.addTasks([withoutKey(practicumTask(), key)]), new RegExp('нет (поля )?(разбора )?' + key), key);
  }
  const OLY = loadCore();
  catalog(OLY);
  OLY.addTasks([practicumTask({ typicalMistake: 'Частая ошибка' })]);
  assert.equal(OLY.getTask('TPR-LAW-CPT-001').level, 1);
});

test('задание: значения учебных полей проверяются', () => {
  const cases = [
    [{ section: 'practice' }, /section должно совпадать/],
    [{ block: 'unknown' }, /неизвестный блок/],
    [{ order: 0 }, /order должно быть целым/],
    [{ order: 1.5 }, /order должно быть целым/],
    [{ level: 4 }, /level должно быть одним из/],
    [{ tags: [] }, /tags должно быть непустым/],
    [{ tags: ['a', 'a'] }, /теги повторяются/],
    [{ tags: ['a', ' '] }, /tags должно быть непустым/],
    [{ typicalMistake: '' }, /typicalMistake/]
  ];
  for (const [overrides, error] of cases) {
    const OLY = loadCore();
    catalog(OLY);
    assert.throws(() => OLY.addTasks([practicumTask(overrides)]), error, JSON.stringify(overrides));
  }
});

test('задание: order уникален внутри темы трека', () => {
  const OLY = loadCore();
  catalog(OLY);
  OLY.addTasks([practicumTask()]);
  assert.throws(() => OLY.addTasks([practicumTask({ id: 'TPR-LAW-CPT-002' })]), /order 1 уже занят заданием TPR-LAW-CPT-001/);
  OLY.addTasks([practicumTask({ id: 'TPR-LAW-CPT-002', order: 2 })]);
});

test('задание олимпиады: учебные поля необязательны, но проверяются', () => {
  const OLY = loadCore();
  catalog(OLY);
  const base = {
    id: 'TST-LAW-FAM-001', olympiad: 'TST', subject: 'social', discipline: 'LAW', topic: 'LAW-FAM',
    type: 'single-select', question: 'x', options: [{ text: 'a', correct: true }, { text: 'b', correct: false }], scoring: null
  };
  OLY.addTasks([base]);
  assert.throws(() => OLY.addTasks([{ ...base, id: 'TST-LAW-FAM-002', level: 5 }]), /level/);
  assert.throws(() => OLY.addTasks([{ ...base, id: 'TST-LAW-FAM-003', section: 'theory' }]), /section должно совпадать/);
  OLY.addTasks([{ ...base, id: 'TST-LAW-FAM-004', level: 2, tags: ['семья'] }]);
});

/* ---------- Запросы и порядок ---------- */

test('query: фильтр по уровню; sortByOrder — учебный порядок, а не порядок регистрации', () => {
  const OLY = loadCore();
  catalog(OLY);
  OLY.addTasks([
    practicumTask({ id: 'TPR-LAW-CPT-003', order: 3, level: 3, block: 'methods' }),
    practicumTask({ id: 'TPR-LAW-CPT-001', order: 1, level: 1 }),
    practicumTask({ id: 'TPR-LAW-CPT-002', order: 2, level: 2 })
  ]);
  const all = OLY.query({ olympiad: 'TPR', subject: 'social' });
  assert.deepEqual(all.map((t) => t.id), ['TPR-LAW-CPT-003', 'TPR-LAW-CPT-001', 'TPR-LAW-CPT-002']);
  assert.deepEqual(OLY.sortByOrder(all).map((t) => t.order), [1, 2, 3]);
  assert.deepEqual(all.map((t) => t.order), [3, 1, 2], 'исходный список не меняется');
  assert.deepEqual(OLY.query({ olympiad: 'TPR', subject: 'social', level: 2 }).map((t) => t.id), ['TPR-LAW-CPT-002']);
  assert.equal(OLY.query({ olympiad: 'TPR', subject: 'social', level: 'all' }).length, 3);
});

/* ---------- Реальный банк и интерфейс ---------- */

test('банк: практикум PR и раздел «Теория права» с темой «Что такое право?»', () => {
  const OLY = loadBank();
  const pr = OLY.getOlympiad('PR');
  assert.equal(pr.title, 'Олимпиадный практикум');
  assert.ok(OLY.isPracticum(pr));
  assert.equal(pr.classes, undefined);
  assert.ok(!OLY.isPracticum('HP'));
  const topic = OLY.getTopic('social', 'LAW-CPT');
  assert.equal(topic.title, 'Что такое право?');
  assert.equal(OLY.getSection('social', 'LAW', topic.section).title, 'Теория права');
  assert.deepEqual(topic.blocks.map((b) => b.title), [
    'Понятие права', 'Объективное и субъективное право', 'Источники права', 'Правовые семьи',
    'Публичное и частное право', 'Императивный и диспозитивный методы', 'Синтез'
  ]);
  // «Высшая проба» не затронута: тема семейного права без раздела, источники на месте.
  assert.equal(OLY.getTopic('social', 'LAW-FAM').section, undefined);
  assert.ok(OLY.sources.every((s) => s.olympiad === 'HP'));
});

/** Тестовые задания практикума в реальном банке (номера и order 9xx). */
function addBankTasks(OLY) {
  const base = {
    olympiad: 'PR', subject: 'social', discipline: 'LAW', topic: 'LAW-CPT', section: 'theory',
    tags: ['тест'], type: 'single-select', question: 'Тестовое задание',
    options: [{ text: 'a', correct: true }, { text: 'b', correct: false, explanation: 'нет' }],
    explanation: 'Разбор', scoring: null
  };
  OLY.addTasks([
    { ...base, id: 'PR-LAW-CPT-903', block: 'synthesis', order: 903, level: 3 },
    { ...base, id: 'PR-LAW-CPT-901', block: 'concept', order: 901, level: 1 },
    { ...base, id: 'PR-LAW-CPT-902', block: 'concept', order: 902, level: 2, type: 'matching',
      items: [{ text: 'x', match: 1 }, { text: 'y', match: 2 }], options: ['публичное', 'частное'] }
  ]);
}

test('фильтры практикума: нет класса и тура; сложность — когда уровней больше одного', () => {
  const OLY = loadBank();
  addBankTasks(OLY);
  const F = OLY.ui.filters;
  const scope = { olympiad: 'PR', subject: 'social', discipline: 'LAW', topic: 'LAW-CPT' };
  const groups = F.describe(scope, {});
  assert.deepEqual(groups.map((g) => g.key), ['level', 'type']);
  assert.deepEqual(groups[0].options.map((o) => [o.label, o.count]),
    [['Все', 3], ['Базовый', 1], ['Применение', 1], ['Олимпиадный', 1]]);
  assert.deepEqual(F.buildPool(scope, { level: 3 }).map((t) => t.id), ['PR-LAW-CPT-903']);
  assert.deepEqual(F.normalize(scope, { level: 2, class: 9 }), { level: 2, type: 'all' });
  // У «Высшей пробы» фильтр сложности не появляется: уровней в заданиях нет.
  assert.ok(!F.describe({ olympiad: 'HP', subject: 'social', discipline: 'POL', topic: 'all' }, {}).some((g) => g.key === 'level'));
});

test('порядок тренировки: практикум — учебная последовательность, олимпиада — перемешивание', () => {
  const OLY = loadBank();
  addBankTasks(OLY);
  const S = OLY.ui.session;
  const pool = OLY.ui.filters.buildPool({ olympiad: 'PR', subject: 'social', discipline: 'LAW', topic: 'all' }, {});
  const reversed = [...pool].reverse();
  assert.deepEqual(S.arrange('PR', reversed).map((t) => t.id), ['PR-LAW-CPT-901', 'PR-LAW-CPT-902', 'PR-LAW-CPT-903']);
  assert.deepEqual(S.arrangeIds('PR', ['PR-LAW-CPT-903', 'PR-LAW-CPT-901']), ['PR-LAW-CPT-901', 'PR-LAW-CPT-903']);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ids = ['HP-PHI-RUS-001', 'HP-SOC-CAR-001', 'HP-POL-RAT-001', 'HP-ECO-INE-001', 'HP-LAW-FAM-001'];
  const shuffled = S.arrangeIds('HP', ids, random);
  assert.deepEqual([...shuffled].sort(), [...ids].sort());
  assert.notDeepEqual(shuffled, ids);
});

test('подписи: уровень, уровни, тема с разделом', () => {
  const OLY = loadBank();
  addBankTasks(OLY);
  const f = OLY.ui.format;
  assert.equal(f.levelTitle(1), 'Базовый');
  assert.equal(f.levelLabel(2), 'Уровень 2 · применение');
  assert.equal(f.levelLabel(3), 'Уровень 3 · олимпиадный');
  assert.equal(f.levelsLabel([3, 1, 2, 1]), 'Уровни 1–3');
  assert.equal(f.levelsLabel([2]), 'Уровень 2');
  assert.equal(f.levelsLabel([undefined]), '');
  assert.equal(f.taskTopicLabel(OLY.getTask('PR-LAW-CPT-901')), 'Право · Теория права · Что такое право?');
  assert.equal(f.taskTopicLabel(OLY.getTask('HP-LAW-FAM-001')), 'Право · Семейное право');
});

test('отрисовка matching: выбор, снятие выбора, один к одному, ввод с клавиатуры', () => {
  const OLY = loadBank();
  const view = OLY.ui.views.get('matching');
  const classify = { items: [{ text: 'a', match: 1 }, { text: 'b', match: 2 }, { text: 'c', match: 1 }], options: ['x', 'y'] };
  assert.deepEqual(view.choose(classify, null, 0, 1), [1, null, null]);
  assert.deepEqual(view.choose(classify, [1, null, null], 2, 1), [1, null, 1], 'в классификации варианты повторяются');
  assert.deepEqual(view.choose(classify, [1, null, 1], 0, 1), [null, null, 1], 'повторное нажатие снимает выбор');
  const oneToOne = { ...classify, oneToOne: true, options: ['x', 'y', 'z'] };
  assert.deepEqual(view.choose(oneToOne, [1, 2, null], 2, 1), [null, 2, 1], 'вариант переходит к новой позиции');
  assert.deepEqual(view.keyInput(classify, [1, null, null], 2), [1, 2, null]);
  assert.equal(view.keyInput(classify, [1, 2, 1], 2), null, 'все позиции заполнены');
  assert.equal(view.keyInput(classify, null, 5), null, 'нет такого варианта');
  assert.match(view.hint(oneToOne), /один раз/);
  assert.match(view.hint(classify), /могут повторяться/);
  // Ответ из интерфейса проходит проверку ядра.
  const type = OLY.types.get('matching');
  assert.equal(type.check(classify, type.cleanResponse(classify, [1, 2, 1])).verdict, 'correct');
});
