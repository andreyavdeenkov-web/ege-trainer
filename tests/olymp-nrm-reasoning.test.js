'use strict';

/**
 * Поиск ошибок в рассуждении (тип reasoning-check) практикума «Норма права»:
 * проверка данных, баллы за отметку шагов, происхождение (с номером исходного шага)
 * и содержательный тип ошибки, вердикт «частично», попытка и её восстановление.
 * Задания здесь — тестовые (трек TPR) и демонстрационные (трек DEMO).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadCore, loadBank } = require('./helpers/olymp.js');

const root = path.join(__dirname, '..');

function loadReasoningCore() {
  const OLY = loadCore();
  for (const src of ['js/olymp/types/nrm-rows.js', 'js/olymp/types/reasoning-check.js', 'js/olymp/rules/components.js']) {
    const code = fs.readFileSync(path.join(root, src), 'utf8');
    vm.runInThisContext('(function (window, globalThis) {\n' + code + '\n})', { filename: src })(undefined, { OLY });
  }
  OLY.defineSubject({
    id: 'social', title: 'Обществознание',
    disciplines: [{ id: 'LAW', title: 'Право', sections: [{ id: 'theory', title: 'Теория права' }], topics: [
      { id: 'LAW-NRM', title: 'Норма права', section: 'theory', blocks: [{ id: 'reasoning', title: 'Рассуждения' }] }
    ] }]
  });
  OLY.defineOlympiad({ id: 'TPR', kind: 'practicum', title: 'Тестовый практикум', subjects: ['social'] });
  return OLY;
}

/**
 * Образец II-2: (1) верен; (2) самостоятельная ошибка Т1; (3) только унаследована от (2);
 * (4) унаследована от (2) + собственная Т6. Строка конструктора — R.
 * Баллы: 2 + 1 + 1 (отметка) + 2 (шаг 2) + 1 (шаг 3) + 2 (шаг 4) + 1 (строка) = 10.
 */
function reasoningTask(overrides) {
  return Object.assign({
    id: 'TPR-LAW-NRM-971', olympiad: 'TPR', subject: 'social', discipline: 'LAW', section: 'theory',
    topic: 'LAW-NRM', block: 'reasoning', order: 1, level: 2, tags: ['ошибки'],
    type: 'reasoning-check', question: 'Найдите ошибки.',
    steps: [
      { id: 's1', text: 'Норма адресована судьям.', key: { error: false }, wrong: 'посылка верна', explanation: 'верно' },
      { id: 's2', text: 'Общеобязательность — для всех без исключения.', key: { error: true, origin: 'own', type: 'T1' },
        missed: 'это ложное определение', typeWrong: { T2: 'первым подходит Т1' }, explanation: 'Т1' },
      { id: 's3', text: 'Значит, норма не общеобязательна.', key: { error: true, origin: 'inherited', from: 's2' },
        missed: 'вывод опирается на шаг 2', originWrong: { own: { short: 'собственной ошибки нет', full: 'подробно' } },
        fromWrong: 'исходная ошибка — в шаге 2', explanation: 'унаследована' },
      { id: 's4', text: 'Значит, это служебная инструкция.', key: { error: true, origin: 'mixed', from: 's2', type: 'T6' },
        missed: 'вывод не следует', typeWrong: { T5: 'текст не опровергает' }, explanation: 'Т6' }
    ],
    sections: [{ id: 'B', title: 'Конструктор', rows: [
      { id: 'slot', label: '[1]', component: 'R', options: ['всех, кому адресована', 'всех без исключения'], key: [0],
        wrong: { 1: 'это ошибка шага 2' }, explanation: 'так' }
    ] }],
    explanation: 'Разбор.',
    scoring: { maxPoints: 10, rule: 'components', basis: 'author' }
  }, overrides || {});
}

function setup(overrides) {
  const OLY = loadReasoningCore();
  OLY.addTasks([reasoningTask(overrides)]);
  const task = OLY.getTask('TPR-LAW-NRM-971');
  return { OLY, task, type: OLY.types.get('reasoning-check') };
}

function steps(task, changes) {
  const r = { steps: {}, rows: { slot: { c: 0, f: [], e: [] } } };
  for (const s of task.steps) r.steps[s.id] = { flag: false, origin: null, from: null, type: null };
  Object.assign(r.steps, changes);
  return r;
}

const RIGHT = {
  s2: { flag: true, origin: 'own', from: null, type: 'T1' },
  s3: { flag: true, origin: 'inherited', from: 's2', type: null },
  s4: { flag: true, origin: 'mixed', from: 's2', type: 'T6' }
};

test('reasoning-check: корректное задание регистрируется, максимум 10 (все R)', () => {
  const { OLY, task } = setup();
  assert.deepEqual(OLY.reasoningCheck.maxByComponent(task), { K: 0, T: 0, R: 10 });
});

test('reasoning-check: ошибки данных', () => {
  const base = reasoningTask();
  const step = (i, patch) => base.steps.map((s, k) => (k === i ? Object.assign({}, s, patch) : s));
  const cases = [
    [{ steps: base.steps.slice(0, 2) }, /не меньше трёх шагов/],
    [{ steps: step(0, { wrong: undefined }) }, /нет объяснения wrong/],
    [{ steps: step(1, { missed: undefined }) }, /нет объяснения missed/],
    [{ steps: step(3, { typeWrong: undefined }) }, /typeWrong\.T5 — почему не подходит предыдущий/],
    [{ steps: step(2, { key: { error: true, origin: 'inherited', from: 's1' } }) }, /только от ошибочного шага/],
    [{ steps: step(2, { key: { error: true, origin: 'inherited', from: 's4' } }) }, /предшествующий шаг/],
    [{ steps: step(2, { key: { error: true, origin: 'inherited', from: 's2', type: 'T1' } }) }, /нет содержательного типа/],
    [{ steps: step(1, { key: { error: true, origin: 'own', type: 'T9' } }) }, /key\.type/],
    [{ steps: step(0, { key: { error: false, origin: 'own' } }) }, /у верного шага не бывает key\.origin/],
    [{ scoring: { maxPoints: 9, rule: 'components', basis: 'author' } }, /сумме баллов элементов: 10/]
  ];
  for (const [overrides, message] of cases) {
    const OLY = loadReasoningCore();
    assert.throws(() => OLY.addTasks([reasoningTask(overrides)]), message);
  }
});

test('reasoning-check: эталон — «верно», 10 из 10', () => {
  const { OLY, task, type } = setup();
  const correct = type.getCorrect(task);
  assert.deepEqual(correct.steps.s3, RIGHT.s3);
  const g = OLY.grade.gradeTask(task, correct);
  assert.equal(g.verdict, 'correct');
  assert.equal(g.points, 10);
});

test('reasoning-check: отметка шагов — первый ошибочный (2), остальные (1), без лишних (1)', () => {
  const { OLY, task } = setup();
  // Отмечен только шаг 4: первый ошибочный пропущен, остальные — не все, лишних нет.
  let g = OLY.grade.gradeTask(task, steps(task, { s4: RIGHT.s4 }));
  let f = g.details.reasoning.flags;
  assert.equal(f.first.points, 0);
  assert.deepEqual(f.rest.missed, ['s3']);
  assert.equal(f.clean.points, 1);
  assert.equal(g.points, 1 + 2 + 1); // без лишних + шаг 4 + слот
  // Отмечен верный шаг 1 — теряется только балл «без лишних».
  g = OLY.grade.gradeTask(task, steps(task, Object.assign({ s1: { flag: true, origin: 'own', from: null, type: 'T6' } }, RIGHT)));
  f = g.details.reasoning.flags;
  assert.equal(f.first.points, 2);
  assert.deepEqual(f.clean.falsePositives, ['s1']);
  assert.equal(g.details.reasoning.steps.s1.flagStatus, 'wrong');
  assert.equal(g.points, 9);
  assert.equal(g.verdict, 'partial');
});

test('reasoning-check: происхождение и номер исходного шага — один балл; тип — отдельный балл', () => {
  const { OLY, task } = setup();
  const g = OLY.grade.gradeTask(task, steps(task, {
    s2: { flag: true, origin: 'own', from: null, type: 'T2' },          // тип неверен
    s3: { flag: true, origin: 'own', from: null, type: 'T6' },          // происхождение неверно
    s4: { flag: true, origin: 'mixed', from: 's3', type: 'T6' }         // неверный исходный шаг
  }));
  const s = g.details.reasoning.steps;
  assert.deepEqual([s.s2.origin, s.s2.type, s.s2.points], ['ok', 'wrong', 1]);
  assert.deepEqual([s.s3.origin, s.s3.type, s.s3.points], ['wrong', null, 0]);
  assert.deepEqual([s.s4.origin, s.s4.type, s.s4.points], ['from', 'ok', 1]);
  assert.equal(g.points, 4 + 1 + 0 + 1 + 1);
});

test('reasoning-check: пустой и незавершённый ответ', () => {
  const { task, type } = setup();
  const empty = type.emptyResponse(task);
  assert.ok(type.isEmpty(task, empty));
  assert.ok(!type.isComplete(task, empty));
  const flaggedOnly = steps(task, { s2: { flag: true, origin: null, from: null, type: null } });
  assert.ok(!type.isEmpty(task, flaggedOnly));
  assert.ok(!type.isComplete(task, flaggedOnly));
  assert.ok(!type.isComplete(task, steps(task, { s3: { flag: true, origin: 'inherited', from: null, type: null } })));
  assert.ok(type.isComplete(task, steps(task, RIGHT)));
});

test('reasoning-check: структура ответа проверяется, лишние уточнения сбрасываются', () => {
  const { task, type } = setup();
  assert.throws(() => type.cleanResponse(task, { steps: { s9: { flag: true } } }), /Неизвестный шаг: s9/);
  assert.throws(() => type.cleanResponse(task, { steps: { s2: { flag: true, origin: 'x' } } }), /неизвестное происхождение/);
  assert.throws(() => type.cleanResponse(task, { steps: { s2: { flag: true, origin: 'inherited', from: 's3' } } }), /только от предыдущего шага/);
  assert.throws(() => type.cleanResponse(task, { steps: { s2: { flag: true, type: 'T7' } } }), /неизвестный тип/);
  const cleaned = type.cleanResponse(task, { steps: {
    s1: { flag: false, origin: 'own', type: 'T1' },
    s3: { flag: true, origin: 'inherited', from: 's2', type: 'T4' }
  } });
  assert.deepEqual(cleaned.steps.s1, { flag: false, origin: null, from: null, type: null });
  assert.deepEqual(cleaned.steps.s3, RIGHT.s3);
});

/* ---------- Демонстрационное задание ---------- */

test('Демо V-2 (ст. 125 УК): эталон 11 баллов; шаг 2 зависит от подхода и не входит в ключ', () => {
  const OLY = loadBank('olympiad-work.html');
  const task = OLY.getTask('PR-LAW-NRM-011');
  assert.equal(task.type, 'reasoning-check');
  assert.equal(task.draft, true);
  assert.ok(task.legal.every((b) => b.verified === false));
  const type = OLY.types.get(task.type);
  let g = OLY.grade.gradeTask(task, type.getCorrect(task));
  assert.equal(g.verdict, 'correct');
  assert.equal(g.points, 11);
  // Типичная ошибка: шаг 2 отмечен как бесспорный, ошибка шага 3 «унаследована» от него.
  const r = type.getCorrect(task);
  r.steps.s2 = { flag: true, origin: 'own', from: null, type: 'T3' };
  r.steps.s3 = { flag: true, origin: 'inherited', from: 's2', type: null };
  g = OLY.grade.gradeTask(task, r);
  assert.equal(g.points, 8);
  assert.equal(g.details.reasoning.steps.s3.origin, 'wrong');
  assert.ok(task.steps[2].originWrong.inherited, 'для этой ошибки нужно отдельное объяснение');
});

test('reasoning-check в попытке: «частично», компоненты, восстановление', () => {
  const OLY = loadBank('olympiad-work.html');
  const A = OLY.attempt;
  const task = OLY.getTask('PR-LAW-NRM-011');
  const attempt = A.createAttempt({ mode: 'practice', olympiad: 'PR', subject: 'social', taskIds: [task.id],
    settings: { discipline: 'LAW', topic: 'LAW-NRM', filters: {} } });
  const response = OLY.types.get(task.type).getCorrect(task);
  response.steps.s5.type = 'T5';
  A.setResponse(attempt, task.id, response);
  const result = A.check(attempt, task.id);
  assert.equal(result.verdict, 'partial');
  assert.equal(result.points, 10);
  assert.deepEqual(OLY.ui.session.outcome(attempt).components.R, { earned: 10, max: 11 });
  A.finish(attempt);
  const scope = { olympiad: 'PR', subject: 'social', discipline: 'LAW', topic: 'LAW-NRM' };
  const restored = OLY.ui.progress.restore(JSON.parse(JSON.stringify(A.snapshot(attempt))), scope);
  assert.ok(restored);
  assert.deepEqual(restored.results[task.id], attempt.results[task.id]);
});
