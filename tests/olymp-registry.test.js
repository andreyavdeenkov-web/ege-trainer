'use strict';

/** Олимпиады: каталог, задания, источники, индекс появлений и фильтры. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, defineCatalog, sampleTasks, taskWith } = require('./helpers/olymp.js');

function setup() {
  const OLY = loadCore();
  defineCatalog(OLY);
  OLY.addTasks(sampleTasks());
  return OLY;
}

function source(overrides) {
  return Object.assign({
    id: 'TST-2026-27-DEMO-9-1', olympiad: 'TST', subject: 'social',
    kind: 'demo', year: '2026/27', classes: [9], round: 1,
    title: 'Демоверсия 2026/27 · 9 класс · I тур', answersBasis: 'official', playable: true,
    items: [
      { number: 1, taskId: 'TST-PHI-HIS-001' },
      { number: 2, taskId: 'TST-SOC-MOB-001' }
    ]
  }, overrides);
}

const ids = (tasks) => tasks.map((t) => t.id);

test('каталог: дисциплины и темы предмета', () => {
  const OLY = setup();
  assert.equal(OLY.getSubject('social').title, 'Обществознание');
  assert.equal(OLY.getDiscipline('social', 'SOC').title, 'Социология');
  assert.equal(OLY.getTopic('social', 'SOC-MOB').discipline, 'SOC');
  assert.equal(OLY.getTopic('social', 'SOC-XXX'), null);
  assert.equal(OLY.getOlympiad('TST').title, 'Тестовая олимпиада');
});

test('каталог: тема должна относиться к своей дисциплине, id не повторяются', () => {
  const OLY = loadCore();
  assert.throws(() => OLY.defineSubject({ id: 'social', title: 'x', disciplines: [
    { id: 'SOC', title: 'Социология', topics: [{ id: 'PHI-HIS', title: 'x' }] }
  ] }), /не относится к дисциплине SOC/);
  assert.throws(() => OLY.defineSubject({ id: 'social', title: 'x', disciplines: [
    { id: 'SOC', title: 'a', topics: [] }, { id: 'SOC', title: 'b', topics: [] }
  ] }), /повторяющаяся дисциплина SOC/);
  defineCatalog(OLY);
  assert.throws(() => defineCatalog(OLY), /уже зарегистрирован/);
  assert.throws(() => OLY.defineOlympiad({ id: 'XX', title: 'x', subjects: ['history'], classes: [9], rounds: [1] }),
    /неизвестный предмет history/);
});

test('задание: формат ID, уникальность, префикс совпадает с олимпиадой и темой', () => {
  const OLY = setup();
  assert.equal(OLY.getTask('TST-SOC-MOB-001').type, 'multiple-select');
  assert.throws(() => OLY.addTasks([taskWith({ id: 'TST-SOC-MOB-1' })]), /Некорректный id задания/);
  assert.throws(() => OLY.addTasks([taskWith({ id: 'SOC-MOB-001' })]), /Некорректный id задания/);
  assert.throws(() => OLY.addTasks([taskWith({})]), /Повторяющийся id задания: TST-SOC-MOB-001/);
  assert.throws(() => OLY.addTasks([taskWith({ id: 'TST-SOC-STR-009' })]), /id должен начинаться с TST-SOC-MOB-/);
});

test('задание: тема, дисциплина и олимпиада должны существовать и согласовываться', () => {
  const OLY = setup();
  assert.throws(() => OLY.addTasks([taskWith({ id: 'TST-SOC-XXX-001', topic: 'SOC-XXX' })]), /неизвестная тема SOC-XXX/);
  assert.throws(() => OLY.addTasks([taskWith({ id: 'TST-PHI-HIS-009', topic: 'PHI-HIS' })]),
    /тема PHI-HIS не относится к дисциплине SOC/);
  assert.throws(() => OLY.addTasks([taskWith({ id: 'ABC-SOC-MOB-001', olympiad: 'ABC' })]), /неизвестная олимпиада ABC/);
});

test('задание не хранит класс, тур, год и источник', () => {
  const OLY = setup();
  for (const field of ['class', 'classes', 'round', 'year', 'source', 'sourceType']) {
    assert.throws(
      () => OLY.addTasks([taskWith({ id: 'TST-SOC-MOB-050', [field]: 9 })]),
      new RegExp('поле ' + field + ' не хранится в задании')
    );
  }
});

test('задание: поле scoring обязательно, null допустим', () => {
  const OLY = setup();
  const task = taskWith({ id: 'TST-SOC-MOB-051' });
  delete task.scoring;
  assert.throws(() => OLY.addTasks([task]), /нет поля scoring/);
  OLY.addTasks([taskWith({ id: 'TST-SOC-MOB-052', scoring: null })]);
  assert.equal(OLY.getTask('TST-SOC-MOB-052').scoring, null);
});

test('задание: неизвестный тип и ошибки данных типа', () => {
  const OLY = setup();
  assert.throws(() => OLY.addTasks([taskWith({ id: 'TST-SOC-MOB-060', type: 'essay' })]), /неизвестный тип essay/);
  assert.throws(() => OLY.addTasks([taskWith({ id: 'TST-SOC-MOB-061', options: [{ text: 'a', correct: false }, { text: 'b', correct: false }] })]),
    /нужен хотя бы один верный вариант/);
  assert.throws(() => OLY.addTasks([taskWith({ id: 'TST-SOC-MOB-062', question: ' ' })]), /нет вопроса/);
});

test('источник регистрируется и строит индекс появлений', () => {
  const OLY = setup();
  OLY.addSource(source());
  assert.deepEqual(OLY.getAppearances('TST-SOC-MOB-001'), [
    { sourceId: 'TST-2026-27-DEMO-9-1', number: 2, kind: 'demo', year: '2026/27', classes: [9], stage: null, round: 1 }
  ]);
  assert.deepEqual(OLY.getAppearances('TST-SOC-STR-001'), []);
  assert.deepEqual(OLY.getSourceTaskIds('TST-2026-27-DEMO-9-1'), ['TST-PHI-HIS-001', 'TST-SOC-MOB-001']);
  assert.equal(OLY.getSourceItem('TST-2026-27-DEMO-9-1', 'TST-SOC-MOB-001').number, 2);
  // Индекс — производный: в самом задании ничего не появляется.
  assert.equal(OLY.getTask('TST-SOC-MOB-001').class, undefined);
});

test('одно задание в двух источниках для разных классов — без дублирования', () => {
  const OLY = setup();
  OLY.addSource(source());
  OLY.addSource(source({
    id: 'TST-2025-26-PAST-10-2', kind: 'past', year: '2025/26', classes: [10, 11], round: 2,
    title: 'Вариант 2025/26 · 10–11 класс · II тур',
    items: [{ number: 1, taskId: 'TST-SOC-MOB-001' }]
  }));
  assert.equal(OLY.tasks.filter((t) => t.id === 'TST-SOC-MOB-001').length, 1);
  assert.deepEqual(OLY.getTaskFacets('TST-SOC-MOB-001'), {
    classes: [9, 10, 11], stages: [], rounds: [1, 2], years: ['2025/26', '2026/27']
  });
});

test('источник: проверки данных', () => {
  const OLY = setup();
  assert.throws(() => OLY.addSource(source({ id: 'ABC-1' })), /id должен начинаться с TST-/);
  assert.throws(() => OLY.addSource(source({ kind: 'mock' })), /kind должно быть одним из/);
  assert.throws(() => OLY.addSource(source({ year: '2026' })), /year должен иметь вид 2026\/27/);
  assert.throws(() => OLY.addSource(source({ classes: [8] })), /класс 8 не предусмотрен/);
  assert.throws(() => OLY.addSource(source({ round: 3 })), /тур 3 не предусмотрен/);
  assert.throws(() => OLY.addSource(source({ answersBasis: undefined })), /answersBasis/);
  assert.throws(() => OLY.addSource(source({ items: [{ number: 1, taskId: 'TST-SOC-MOB-999' }] })),
    /неизвестное задание TST-SOC-MOB-999/);
  assert.throws(() => OLY.addSource(source({ items: [{ number: 1, taskId: 'TST-SOC-MOB-001' }, { number: 3, taskId: 'TST-SOC-MOB-002' }] })),
    /number должен быть 2/);
  assert.throws(() => OLY.addSource(source({ items: [{ number: 1, taskId: 'TST-SOC-MOB-001' }, { number: 2, taskId: 'TST-SOC-MOB-001' }] })),
    /уже есть в источнике/);
  OLY.addSource(source());
  assert.throws(() => OLY.addSource(source()), /Повторяющийся id источника/);
});

test('источник: снятое с выдачи задание нельзя включить в пробный тур', () => {
  const OLY = setup();
  OLY.addTasks([taskWith({ id: 'TST-SOC-MOB-070', retired: true })]);
  assert.throws(() => OLY.addSource(source({ items: [{ number: 1, taskId: 'TST-SOC-MOB-070' }] })), /снято с выдачи/);
  OLY.addSource(source({ playable: false, items: [{ number: 1, taskId: 'TST-SOC-MOB-070' }] }));
});

test('авторский сборник: год, классы и тур необязательны', () => {
  const OLY = setup();
  OLY.addSource({
    id: 'TST-AUTHOR-1', olympiad: 'TST', subject: 'social', kind: 'author-set',
    title: 'Авторский сборник', answersBasis: 'author',
    items: [{ number: 1, taskId: 'TST-SOC-STR-001' }]
  });
  assert.deepEqual(OLY.getAppearances('TST-SOC-STR-001'), [
    { sourceId: 'TST-AUTHOR-1', number: 1, kind: 'author-set', year: null, classes: [], stage: null, round: null }
  ]);
});

test('query: тема — задания всех классов вместе', () => {
  const OLY = setup();
  OLY.addTasks([taskWith({ id: 'TST-SOC-MOB-003' })]);
  OLY.addSource(source());
  OLY.addSource(source({
    id: 'TST-2025-26-PAST-11-2', kind: 'past', year: '2025/26', classes: [11], round: 2,
    title: '11 класс', items: [{ number: 1, taskId: 'TST-SOC-MOB-002' }]
  }));
  const topic = { olympiad: 'TST', subject: 'social', discipline: 'SOC', topic: 'SOC-MOB' };
  assert.deepEqual(ids(OLY.query(topic)), ['TST-SOC-MOB-001', 'TST-SOC-MOB-002', 'TST-SOC-MOB-003']);
  assert.deepEqual(ids(OLY.query({ ...topic, class: 'all', round: 'all' })),
    ['TST-SOC-MOB-001', 'TST-SOC-MOB-002', 'TST-SOC-MOB-003']);
  assert.deepEqual(ids(OLY.query({ ...topic, class: 9 })), ['TST-SOC-MOB-001']);
  assert.deepEqual(ids(OLY.query({ ...topic, class: 11, round: 2 })), ['TST-SOC-MOB-002']);
  assert.deepEqual(ids(OLY.query({ ...topic, year: '2026/27' })), ['TST-SOC-MOB-001']);
  assert.deepEqual(ids(OLY.query({ ...topic, type: 'single-select' })), ['TST-SOC-MOB-002']);
});

test('query: класс и тур проверяются по одному появлению', () => {
  const OLY = setup();
  OLY.addSource(source({ items: [{ number: 1, taskId: 'TST-SOC-MOB-001' }] }));      // 9 класс, I тур
  OLY.addSource(source({
    id: 'TST-2026-27-DEMO-10-2', classes: [10], round: 2, title: '10 класс, II тур',
    items: [{ number: 1, taskId: 'TST-SOC-MOB-001' }]
  }));
  const base = { olympiad: 'TST', subject: 'social' };
  assert.deepEqual(ids(OLY.query({ ...base, class: 9, round: 1 })), ['TST-SOC-MOB-001']);
  assert.deepEqual(ids(OLY.query({ ...base, class: 10, round: 2 })), ['TST-SOC-MOB-001']);
  assert.deepEqual(ids(OLY.query({ ...base, class: 9, round: 2 })), []);
});

test('query: снятые с выдачи и задания без источников', () => {
  const OLY = setup();
  OLY.addTasks([taskWith({ id: 'TST-SOC-MOB-080', retired: true })]);
  const base = { olympiad: 'TST', subject: 'social', topic: 'SOC-MOB' };
  assert.ok(!ids(OLY.query(base)).includes('TST-SOC-MOB-080'));
  assert.ok(OLY.getTask('TST-SOC-MOB-080'));
  // Без источников задание видно только без фильтров класса, тура и года.
  assert.ok(ids(OLY.query(base)).includes('TST-SOC-MOB-001'));
  assert.deepEqual(ids(OLY.query({ ...base, class: 9 })), []);
});

test('доступные дисциплины и темы — только с заданиями', () => {
  const OLY = setup();
  const base = { olympiad: 'TST', subject: 'social' };
  assert.deepEqual(OLY.getAvailableDisciplines(base).map((d) => d.id), ['SOC', 'PHI']);
  assert.deepEqual(OLY.getAvailableTopics({ ...base, discipline: 'SOC' }).map((t) => t.id),
    ['SOC-MOB', 'SOC-STR', 'SOC-FAM']);
  OLY.addSource(source());
  assert.deepEqual(OLY.getAvailableTopics({ ...base, discipline: 'SOC', class: 9 }).map((t) => t.id), ['SOC-MOB']);
  assert.deepEqual(OLY.getAvailableDisciplines({ ...base, class: 10 }), []);
});

test('пробные туры: только playable-источники, фильтр класса и тура', () => {
  const OLY = setup();
  OLY.addSource(source());
  OLY.addSource(source({ id: 'TST-2026-27-DEMO-9-2', round: 2, title: 'II тур', playable: false }));
  const found = (f) => OLY.getPlayableSources({ olympiad: 'TST', ...f }).map((s) => s.id);
  assert.deepEqual(found({}), ['TST-2026-27-DEMO-9-1']);
  assert.deepEqual(found({ class: 9, round: 1 }), ['TST-2026-27-DEMO-9-1']);
  assert.deepEqual(found({ class: 10 }), []);
  assert.deepEqual(found({ round: 2 }), []);
});

/* ---------- Этапы олимпиады ---------- */

function setupStaged() {
  const OLY = loadCore();
  OLY.defineSubject({ id: 'social', title: 'Обществознание', disciplines: [
    { id: 'SOC', title: 'Социология', topics: [{ id: 'SOC-MOB', title: 'Социальная мобильность' }] }
  ] });
  OLY.defineOlympiad({ id: 'STG', title: 'Олимпиада с этапами', subjects: ['social'],
    classes: [9, 10, 11], rounds: [1, 2], stages: ['qualifying', 'final'] });
  OLY.addTasks(['001', '002'].map((n) => taskWith({ id: 'STG-SOC-MOB-' + n, olympiad: 'STG' })));
  return OLY;
}

function stagedSource(overrides) {
  return source(Object.assign({
    id: 'STG-2026-27-DEMO-9-1', olympiad: 'STG', stage: 'qualifying',
    items: [{ number: 1, taskId: 'STG-SOC-MOB-001' }]
  }, overrides));
}

test('этапы: список этапов олимпиады проверяется', () => {
  const OLY = loadCore();
  defineCatalog(OLY);
  assert.throws(() => OLY.defineOlympiad({ id: 'AB', title: 'x', subjects: ['social'], classes: [9], rounds: [1], stages: [] }),
    /stages должно быть непустым списком/);
  assert.throws(() => OLY.defineOlympiad({ id: 'AB', title: 'x', subjects: ['social'], classes: [9], rounds: [1], stages: ['Отбор'] }),
    /stages должно быть непустым списком/);
  assert.throws(() => OLY.defineOlympiad({ id: 'AB', title: 'x', subjects: ['social'], classes: [9], rounds: [1], stages: ['final', 'final'] }),
    /этапы повторяются/);
});

test('этапы: stage источника проверяется по олимпиаде', () => {
  const OLY = setupStaged();
  assert.throws(() => OLY.addSource(stagedSource({ stage: 'semifinal' })), /этап semifinal не предусмотрен/);
  assert.throws(() => OLY.addSource(stagedSource({ stage: undefined })), /этап undefined не предусмотрен/);
  // У олимпиады без этапов stage не указывается.
  const plain = setup();
  assert.throws(() => plain.addSource(source({ stage: 'qualifying' })), /у олимпиады нет этапов/);
  // Авторскому сборнику этап не обязателен.
  OLY.addSource({ id: 'STG-AUTHOR-1', olympiad: 'STG', subject: 'social', kind: 'author-set',
    title: 'Сборник', answersBasis: 'author', items: [{ number: 1, taskId: 'STG-SOC-MOB-002' }] });
});

test('этапы: stage в индексе появлений и в фасетах', () => {
  const OLY = setupStaged();
  OLY.addSource(stagedSource());
  assert.equal(OLY.getAppearances('STG-SOC-MOB-001')[0].stage, 'qualifying');
  assert.deepEqual(OLY.getTaskFacets('STG-SOC-MOB-001').stages, ['qualifying']);
  assert.equal(OLY.getTask('STG-SOC-MOB-001').stage, undefined);
});

test('этапы: фильтр по этапу проверяется по одному появлению вместе с классом и туром', () => {
  const OLY = setupStaged();
  OLY.addSource(stagedSource());                                            // отбор, 9 класс, I тур
  OLY.addSource(stagedSource({ id: 'STG-2026-27-DEMO-9-FINAL', stage: 'final', round: 2, title: 'Финал',
    items: [{ number: 1, taskId: 'STG-SOC-MOB-002' }] }));                 // финал, 9 класс, II тур
  const q = (f) => ids(OLY.query({ olympiad: 'STG', subject: 'social', ...f }));
  assert.deepEqual(q({ stage: 'qualifying' }), ['STG-SOC-MOB-001']);
  assert.deepEqual(q({ stage: 'final' }), ['STG-SOC-MOB-002']);
  assert.deepEqual(q({ class: 9, stage: 'qualifying', round: 1 }), ['STG-SOC-MOB-001']);
  assert.deepEqual(q({ class: 9, stage: 'final', round: 1 }), []);
  assert.deepEqual(q({ stage: 'all' }), ['STG-SOC-MOB-001', 'STG-SOC-MOB-002']);
  const playable = (f) => OLY.getPlayableSources({ olympiad: 'STG', ...f }).map((s) => s.id);
  assert.deepEqual(playable({ stage: 'qualifying' }), ['STG-2026-27-DEMO-9-1']);
  assert.deepEqual(playable({ stage: 'final', round: 2 }), ['STG-2026-27-DEMO-9-FINAL']);
});
