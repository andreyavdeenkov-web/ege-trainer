'use strict';

/**
 * Норма права: типы criteria (классификация по нескольким основаниям)
 * и norm-structure (гипотеза, диспозиция, санкция в тексте), образцы
 * модуля LAW-NRM в банке практикума.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, loadBank } = require('./helpers/olymp.js');

const norm = (extra) => Object.assign({ act: 'Кодекс', ref: 'ст. 1', verified: false }, extra);

function criteriaTask(overrides) {
  return Object.assign({
    id: 'TST-LAW-NRM-901', type: 'criteria', question: 'Классифицируйте норму.',
    norm: norm({ text: 'Родители обязаны содержать детей.' }),
    criteria: [
      { title: 'Характер', options: ['управомочивающая', 'обязывающая', 'запрещающая'], match: 2 },
      { title: 'Метод', options: ['императивная', 'диспозитивная'], match: 1 }
    ]
  }, overrides);
}

function structureTask(overrides) {
  return Object.assign({
    id: 'TST-LAW-NRM-902', type: 'norm-structure', question: 'Отметьте элементы.',
    norm: norm(),
    segments: [
      { text: 'Гражданин', role: 'context' },
      { text: 'в случае, если…,', role: 'hypothesis' },
      { text: 'имеет право на замену.', role: 'disposition' },
      { text: 'а также в других случаях', role: 'none' }
    ],
    elements: { hypothesis: 'есть', disposition: 'есть', sanction: 'нет' }
  }, overrides);
}

/* ---------- criteria ---------- */

test('criteria: проверка данных', () => {
  const T = loadCore().types.get('criteria');
  assert.deepEqual(T.validateTask(criteriaTask()), []);
  const cases = [
    [{ norm: undefined }, /нет поля norm/],
    [{ norm: norm() }, /norm.text: нет текста/],
    [{ norm: norm({ text: 'x', verified: 'нет' }) }, /verified/],
    [{ criteria: [criteriaTask().criteria[0]] }, /не меньше двух оснований/],
    [{ criteria: [{ title: 'a', options: ['x', 'x'], match: 1 }, criteriaTask().criteria[1]] }, /варианты повторяются/],
    [{ criteria: [{ title: 'a', options: ['x', 'y'], match: 3 }, criteriaTask().criteria[1]] }, /match должен быть/],
    [{ criteria: [{ options: ['x', 'y'], match: 1 }, criteriaTask().criteria[1]] }, /нет названия/]
  ];
  for (const [overrides, error] of cases) {
    assert.ok(T.validateTask(criteriaTask(overrides)).some((e) => error.test(e)), JSON.stringify(overrides));
  }
});

test('criteria: ответ, проверка по основаниям, формат', () => {
  const T = loadCore().types.get('criteria');
  const task = criteriaTask();
  assert.deepEqual(T.emptyResponse(task), [null, null]);
  assert.ok(T.isEmpty(task, [null, null]));
  assert.ok(!T.isComplete(task, [2, null]));
  assert.ok(T.isComplete(task, [2, 1]));
  assert.throws(() => T.cleanResponse(task, [2]), /по номеру на каждое основание/);
  assert.throws(() => T.cleanResponse(task, [2, 3]), /Некорректный номер/);
  assert.deepEqual(T.check(task, [2, 1]), { verdict: 'correct', details: { mistakes: 0, perItem: [true, true] } });
  assert.deepEqual(T.check(task, [2, null]).details, { mistakes: 1, perItem: [true, false] });
  assert.deepEqual(T.getCorrect(task), [2, 1]);
  assert.equal(T.formatResponse(task, [2, null]), 'Характер — обязывающая; Метод — ?');
});

/* ---------- norm-structure ---------- */

test('norm-structure: проверка данных', () => {
  const T = loadCore().types.get('norm-structure');
  assert.deepEqual(T.validateTask(structureTask()), []);
  const segs = structureTask().segments;
  const cases = [
    [{ norm: norm({ text: 'x' }) }, /складывается из segments/],
    [{ segments: segs.slice(0, 1) }, /не меньше двух фрагментов/],
    [{ segments: segs.map((s) => ({ ...s, role: s.role === 'disposition' ? 'none' : s.role })) }, /должна быть выделена диспозиция/],
    [{ segments: [{ text: 'a', role: 'rule' }, ...segs.slice(1)] }, /role должно быть одним из/],
    [{ elements: { hypothesis: 'a', disposition: 'b' } }, /elements/]
  ];
  for (const [overrides, error] of cases) {
    assert.ok(T.validateTask(structureTask(overrides)).some((e) => error.test(e)), JSON.stringify(overrides));
  }
});

test('norm-structure: проверка по трём элементам; невыраженный элемент верен без отметок', () => {
  const T = loadCore().types.get('norm-structure');
  const task = structureTask();
  assert.ok(T.isEmpty(task, T.emptyResponse(task)));
  assert.ok(T.isComplete(task, [null, 'hypothesis', null, null]));
  assert.throws(() => T.cleanResponse(task, ['hypothesis', null, null, null]), /не размечается/);
  assert.throws(() => T.cleanResponse(task, [null, 'rule', null, null]), /Некорректная отметка/);
  assert.throws(() => T.cleanResponse(task, [null]), /для каждого фрагмента/);

  const key = T.getCorrect(task);
  assert.deepEqual(key, [null, 'hypothesis', 'disposition', null]);
  const right = T.check(task, key);
  assert.equal(right.verdict, 'correct');
  assert.deepEqual(right.details.perItem, [true, true, true]);
  assert.deepEqual(right.details.perElement.sanction, { ok: true, expressed: false, marked: false });

  // Ловушка (role: 'none'), отмеченная как санкция, — ошибка только в элементе «санкция».
  const trap = T.check(task, [null, 'hypothesis', 'disposition', 'sanction']);
  assert.equal(trap.verdict, 'incorrect');
  assert.deepEqual(trap.details.perItem, [true, true, false]);
  assert.deepEqual(trap.details.perElement.sanction, { ok: false, expressed: false, marked: true });
  // Пропущенная гипотеза — ошибка в элементе «гипотеза».
  assert.deepEqual(T.check(task, [null, null, 'disposition', null]).details.perItem, [false, true, true]);

  assert.equal(T.formatResponse(task, key), 'гипотеза — «в случае, если…,»; диспозиция — «имеет право на замену.»; санкция — не выражена');
  assert.equal(T.formatResponse(task, [null, null, null, null]), '—');
});

/* ---------- Отрисовка: логика без DOM ---------- */

test('отрисовка: выбор по основанию и маркер фрагмента снимаются повторным нажатием', () => {
  const OLY = loadBank();
  const criteria = OLY.ui.views.get('criteria');
  const task = criteriaTask();
  assert.deepEqual(criteria.choose(task, [null, null], 0, 2), [2, null]);
  assert.deepEqual(criteria.choose(task, [2, null], 0, 2), [null, null]);
  assert.deepEqual(criteria.keyInput(task, [2, null], 1), [2, 1]);
  assert.equal(criteria.keyInput(task, [2, null], 3), null, 'у второго основания только два варианта');

  const structure = OLY.ui.views.get('norm-structure');
  const st = structureTask();
  let marks = structure.mark(st, null, 1, 'hypothesis');
  assert.deepEqual(marks, [null, 'hypothesis', null, null]);
  marks = structure.mark(st, marks, 1, 'disposition');
  assert.deepEqual(marks, [null, 'disposition', null, null]);
  assert.deepEqual(structure.mark(st, marks, 1, 'disposition'), [null, null, null, null]);
  assert.deepEqual(structure.mark(st, marks, 1, null), [null, null, null, null]);
  assert.deepEqual(structure.mark(st, marks, 0, 'hypothesis'), marks, 'адресат (context) не размечается');

  // Экран не повторяет ответ строкой: только счёт по основаниям и элементам.
  assert.ok(criteria.answerInline && structure.answerInline);
  const T = OLY.types.get('criteria');
  assert.equal(criteria.resultLine(task, { details: T.check(task, [2, 2]).details }), 'Верно: 1 из 2 оснований');
  const S = OLY.types.get('norm-structure');
  assert.equal(structure.resultLine(st, { details: S.check(st, [null, 'hypothesis', 'disposition', 'sanction']).details }), 'Верно: 2 из 3 элементов');
});

/* ---------- Образцы в банке ---------- */

function nrmTasks(OLY) {
  return OLY.query({ olympiad: 'PR', subject: 'social', topic: 'LAW-NRM' });
}

/** Единые названия оснований и порядок вариантов во всех заданиях модуля. */
const CRITERIA = {
  'Материальная или процессуальная': ['материальная', 'процессуальная'],
  'Способ установления правила поведения': ['императивная', 'диспозитивная', 'поощрительная'],
  'Характер предписания': ['запрещающая', 'обязывающая', 'управомочивающая'],
  'Функция': ['регулятивная', 'охранительная'],
  'Срок действия': ['временная', 'постоянная'],
  'Круг лиц': ['общая', 'специальная'],
  'Уровень принятия': ['федеральная', 'региональная', 'локальная'],
  'Специализированная норма': ['учредительная', 'декларативная', 'дефинитивная', 'коллизионная', 'оперативная', '«каучуковая»']
};

test('LAW-NRM: тема в разделе «Теория права», два образца на утверждение', () => {
  const OLY = loadBank();
  const topic = OLY.getTopic('social', 'LAW-NRM');
  assert.equal(topic.title, 'Норма права: классификация и структура');
  assert.equal(topic.section, 'theory');
  assert.deepEqual(topic.blocks.map((b) => b.id), ['classification', 'structure', 'specialized']);
  assert.deepEqual(OLY.sortByOrder(nrmTasks(OLY)).map((t) => t.id), ['PR-LAW-NRM-001', 'PR-LAW-NRM-009']);
  // LAW-CPT не затронут.
  assert.equal(OLY.query({ olympiad: 'PR', subject: 'social', topic: 'LAW-CPT' }).length, 24);
});

test('LAW-NRM: основания классификации — единые названия и порядок вариантов', () => {
  const OLY = loadBank();
  for (const task of nrmTasks(OLY).filter((t) => t.type === 'criteria')) {
    const titles = task.criteria.map((c) => c.title);
    assert.equal(new Set(titles).size, titles.length, task.id);
    for (const c of task.criteria) {
      if (c.title === 'Отрасль права') {
        assert.ok(c.options.every((o) => /правовая$/.test(o)), `${task.id}: отрасль — прилагательные на «-правовая»`);
      } else {
        assert.deepEqual(c.options, CRITERIA[c.title], `${task.id}: основание «${c.title}»`);
      }
    }
  }
});

test('LAW-NRM: ключи образцов', () => {
  const OLY = loadBank();
  const a = OLY.getTask('PR-LAW-NRM-001');
  assert.deepEqual(a.criteria.map((c) => c.title + ': ' + c.options[c.match - 1]), [
    'Отрасль права: семейно-правовая',
    'Материальная или процессуальная: материальная',
    'Способ установления правила поведения: императивная',
    'Характер предписания: обязывающая',
    'Функция: регулятивная',
    'Уровень принятия: федеральная'
  ]);
  const b = OLY.getTask('PR-LAW-NRM-009');
  assert.deepEqual(OLY.types.get(b.type).getCorrect(b), [null, 'hypothesis', 'disposition']);
  assert.ok(!b.segments.some((s) => s.role === 'sanction'), 'санкция в ч. 3 ст. 59 не выражена');
});

test('LAW-NRM: текст нормы склеивается из фрагментов без искажений; объяснения есть у каждого основания и элемента', () => {
  const OLY = loadBank();
  const b = OLY.getTask('PR-LAW-NRM-009');
  assert.equal(b.segments.map((s) => s.text).join(' '),
    'Гражданин Российской Федерации в случае, если его убеждениям или вероисповеданию противоречит несение военной службы, ' +
    'а также в других установленных федеральным законом случаях имеет право на замену ее альтернативной гражданской службой.');
  const clean = (text, where) => {
    assert.ok(text && text.length > 40, where);
    assert.equal(text, text.trim(), where);
    assert.ok(!/\s{2,}|\n/.test(text), where);
  };
  for (const task of nrmTasks(OLY)) {
    clean(task.explanation, task.id);
    // Один итоговый разбор: отдельной «типичной ошибки» в модуле нет.
    assert.equal(task.typicalMistake, undefined, task.id);
    if (task.criteria) task.criteria.forEach((c) => clean(c.explanation, `${task.id}: ${c.title}`));
    if (task.elements) Object.entries(task.elements).forEach(([k, v]) => clean(v, `${task.id}: ${k}`));
  }
});

test('LAW-NRM: ученику не показываются ссылки на конкретный учебник или лекцию', () => {
  const OLY = loadBank();
  const forbidden = /лекци|Литинск|Ростовцев|учебник[уе]? /i;
  for (const task of nrmTasks(OLY)) {
    const texts = [task.question, task.explanation, task.norm.text || '',
      ...(task.criteria || []).flatMap((c) => [c.title, c.explanation, ...c.options]),
      ...Object.values(task.elements || {})];
    for (const text of texts) assert.ok(!forbidden.test(text), `${task.id}: «${text.slice(0, 40)}…»`);
  }
});

test('LAW-NRM: у каждой нормы указаны акт, статья и статус сверки; без сверки задание не готово к публикации', () => {
  const OLY = loadBank();
  for (const task of nrmTasks(OLY)) {
    assert.ok(task.norm.act && task.norm.ref, task.id);
    assert.equal(task.norm.verified, false, `${task.id}: тексты ещё не сверены с официальной публикацией`);
  }
});
