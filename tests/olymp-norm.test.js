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
      { text: 'Гражданин', role: 'none', alsoAccept: ['hypothesis'], explanation: 'Адресат: засчитываются оба ответа.' },
      { text: 'в случае, если…,', role: 'hypothesis' },
      { text: 'имеет право', role: 'disposition' },
      { text: 'на замену.', role: 'disposition' }
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
    [{ segments: segs.slice(0, 2) }, /не меньше трёх фрагментов/],
    [{ segments: segs.map((s) => ({ ...s, role: s.role === 'disposition' ? 'none' : s.role })) }, /должна быть выделена диспозиция/],
    [{ segments: [{ text: 'a', role: 'rule' }, ...segs.slice(1)] }, /role должно быть одним из/],
    [{ segments: [{ text: 'a', role: 'none', alsoAccept: ['hypothesis'] }, ...segs.slice(1)] }, /почему засчитываются обе трактовки/],
    [{ segments: [{ text: 'a', role: 'none', alsoAccept: ['none'], explanation: 'x' }, ...segs.slice(1)] }, /alsoAccept/],
    [{ elements: { hypothesis: 'a', disposition: 'b' } }, /elements/]
  ];
  for (const [overrides, error] of cases) {
    assert.ok(T.validateTask(structureTask(overrides)).some((e) => error.test(e)), JSON.stringify(overrides));
  }
});

test('norm-structure: неотмеченный фрагмент — «не элемент», спорный фрагмент засчитывается в обеих трактовках', () => {
  const T = loadCore().types.get('norm-structure');
  const task = structureTask();
  assert.ok(T.isEmpty(task, T.emptyResponse(task)));
  assert.ok(T.isComplete(task, [null, 'hypothesis', null, null]));
  assert.deepEqual(T.cleanResponse(task, ['none', 'hypothesis', 'disposition', null]), [null, 'hypothesis', 'disposition', null]);
  assert.throws(() => T.cleanResponse(task, ['rule', null, null, null]), /Некорректная отметка/);
  assert.throws(() => T.cleanResponse(task, [null]), /для каждого фрагмента/);

  const key = T.getCorrect(task);
  assert.deepEqual(key, [null, 'hypothesis', 'disposition', 'disposition']);
  assert.equal(T.check(task, key).verdict, 'correct');
  assert.equal(T.check(task, ['hypothesis', 'hypothesis', 'disposition', 'disposition']).verdict, 'correct');
  const wrong = T.check(task, [null, 'hypothesis', 'disposition', 'sanction']);
  assert.equal(wrong.verdict, 'incorrect');
  assert.deepEqual(wrong.details.perItem, [true, true, true, false]);
  assert.deepEqual(wrong.details.elements.sanction, { expected: false, marked: true });
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
});

/* ---------- Образцы в банке ---------- */

function nrmTasks(OLY) {
  return OLY.query({ olympiad: 'PR', subject: 'social', topic: 'LAW-NRM' });
}

test('LAW-NRM: тема в разделе «Теория права», два образца на утверждение', () => {
  const OLY = loadBank();
  const topic = OLY.getTopic('social', 'LAW-NRM');
  assert.equal(topic.title, 'Норма права: классификация и структура');
  assert.equal(topic.section, 'theory');
  assert.deepEqual(topic.blocks.map((b) => b.id), ['classification', 'structure', 'synthesis']);
  assert.deepEqual(OLY.sortByOrder(nrmTasks(OLY)).map((t) => t.id), ['PR-LAW-NRM-001', 'PR-LAW-NRM-008']);
  // LAW-CPT не затронут.
  assert.equal(OLY.query({ olympiad: 'PR', subject: 'social', topic: 'LAW-CPT' }).length, 24);
});

test('LAW-NRM: ключи образцов', () => {
  const OLY = loadBank();
  const a = OLY.getTask('PR-LAW-NRM-001');
  assert.deepEqual(OLY.types.get(a.type).getCorrect(a), [2, 2, 1, 1, 1]);
  assert.deepEqual(a.criteria.map((c) => c.options[c.match - 1]),
    ['семейное право', 'обязывающая', 'императивная', 'регулятивная', 'материальная']);
  const b = OLY.getTask('PR-LAW-NRM-008');
  assert.deepEqual(OLY.types.get(b.type).getCorrect(b), [null, 'hypothesis', 'hypothesis', 'disposition', 'disposition']);
  assert.ok(!b.segments.some((s) => s.role === 'sanction'), 'санкция в ч. 3 ст. 59 не выражена');
});

test('LAW-NRM: текст нормы склеивается из фрагментов без искажений; у каждого основания и фрагмента — объяснение', () => {
  const OLY = loadBank();
  const b = OLY.getTask('PR-LAW-NRM-008');
  assert.equal(b.segments.map((s) => s.text).join(' '),
    'Гражданин Российской Федерации в случае, если его убеждениям или вероисповеданию противоречит несение военной службы, ' +
    'а также в других установленных федеральным законом случаях имеет право на замену ее альтернативной гражданской службой.');
  for (const task of nrmTasks(OLY)) {
    assert.ok(task.explanation.length > 100, task.id);
    assert.ok(task.typicalMistake, task.id);
    for (const part of task.criteria || task.segments) {
      assert.ok(part.explanation && part.explanation.length > 40, `${task.id}: «${part.title || part.text}» без объяснения`);
      assert.equal(part.explanation, part.explanation.trim());
      assert.ok(!/\s{2,}|\n/.test(part.explanation), task.id);
    }
  }
});

test('LAW-NRM: у каждой нормы указаны акт, статья и статус сверки текста', () => {
  const OLY = loadBank();
  for (const task of nrmTasks(OLY)) {
    assert.ok(task.norm.act && task.norm.ref, task.id);
    assert.equal(typeof task.norm.verified, 'boolean', task.id);
  }
});
