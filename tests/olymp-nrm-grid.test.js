'use strict';

/**
 * Классификационная карта (тип analysis-grid) практикума «Норма права»:
 * проверка данных, частичные баллы по компонентам K / T / R, вердикт «частично»,
 * попытка и её восстановление, демонстрационная страница.
 * Задания здесь — тестовые (трек TPR) и демонстрационные (трек DEMO).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadCore, loadBank, pageScripts } = require('./helpers/olymp.js');
const { build } = require('../scripts/build-demo-page.js');

const root = path.join(__dirname, '..');

/** Ядро + тип analysis-grid + правило components. */
function loadGridCore() {
  const OLY = loadCore();
  for (const src of ['js/olymp/types/nrm-rows.js', 'js/olymp/types/analysis-grid.js', 'js/olymp/rules/components.js']) {
    const code = fs.readFileSync(path.join(root, src), 'utf8');
    vm.runInThisContext('(function (window, globalThis) {\n' + code + '\n})', { filename: src })(undefined, { OLY });
  }
  OLY.defineSubject({
    id: 'social', title: 'Обществознание',
    disciplines: [{ id: 'LAW', title: 'Право', sections: [{ id: 'theory', title: 'Теория права' }], topics: [
      { id: 'LAW-NRM', title: 'Норма права', section: 'theory', blocks: [{ id: 'classification', title: 'Классификация' }] }
    ] }]
  });
  OLY.defineOlympiad({ id: 'TPR', kind: 'practicum', title: 'Тестовый практикум', subjects: ['social'] });
  return OLY;
}

/** Небольшая карта: выбор с уточнением, частичный ответ, доказательство, довод (R). */
function gridTask(overrides) {
  return Object.assign({
    id: 'TPR-LAW-NRM-901', olympiad: 'TPR', subject: 'social', discipline: 'LAW', section: 'theory',
    topic: 'LAW-NRM', block: 'classification', order: 1, level: 3, tags: ['классификация'],
    type: 'analysis-grid', question: 'Классифицируйте положение.',
    legal: [
      { id: 'main', role: 'main', act: 'Тестовый акт', ref: 'ст. 1', verified: false,
        fragments: [{ id: 'a', text: 'Истец' }, { text: ' ' }, { id: 'b', text: 'вправе' }, { text: ' ' }, { id: 'c', text: 'отказаться.' }] },
      { id: 'ref', role: 'reference', act: 'Тестовый акт', ref: 'ст. 2', verified: false,
        fragments: [{ id: 'r', text: 'Суд проверяет отказ.' }] }
    ],
    sections: [
      { id: 'A', title: 'А', rows: [
        { id: 'means', label: 'Средства', options: ['Запрещающая', 'Обязывающая', 'Управомочивающая'], key: [2],
          wrong: { 0: 'нет запрета', 1: 'нет обязанности' }, explanation: '«вправе»',
          evidence: { key: ['b'], explanation: 'слово «вправе»', wrong: { a: '«Истец» — адресат' } } },
        { id: 'persons', label: 'Круг лиц', options: ['Общая', 'Специальная', 'Тривиально', 'Спорно'], key: [3], partial: [1],
          followUp: { when: 3, label: 'Спор между', options: ['Общая', 'Специальная', 'Локальная'], key: [0, 1], wrong: { 2: 'не то основание' } },
          wrong: { 0: 'спорно', 1: 'слабее', 2: 'не тривиально' }, explanation: 'роли в процессе' },
        { id: 'role', label: 'Роль', options: ['Учредительная', 'Тривиально', 'Неприменимо'], key: [2, 1],
          wrong: { 0: 'не принцип' }, explanation: 'обычная норма' }
      ] },
      { id: 'B', title: 'Б', rows: [
        { id: 'p1', label: 'Довод', component: 'R', options: ['Обосновывает', 'Не обосновывает', 'Неверно'], key: [0],
          wrong: { 1: 'обосновывает', 2: 'верно' }, explanation: 'решающий довод' }
      ] }
    ],
    explanation: 'Разбор.',
    scoring: { maxPoints: 5, rule: 'components', basis: 'author' }
  }, overrides);
}

function answer(rows) {
  const base = { means: { c: null, f: [], e: [] }, persons: { c: null, f: [], e: [] }, role: { c: null, f: [], e: [] }, p1: { c: null, f: [], e: [] } };
  return Object.assign(base, rows);
}

/* ---------- Данные ---------- */

test('analysis-grid: корректное задание регистрируется, максимум 5 баллов (K 3, T 1, R 1)', () => {
  const OLY = loadGridCore();
  OLY.addTasks([gridTask()]);
  const task = OLY.getTask('TPR-LAW-NRM-901');
  assert.deepEqual(OLY.analysisGrid.maxByComponent(task), { K: 3, T: 1, R: 1 });
  assert.equal(OLY.analysisGrid.maxPoints(task), 5);
});

test('analysis-grid: для каждого неверного варианта обязательно объяснение ошибки', () => {
  const OLY = loadGridCore();
  const task = gridTask();
  delete task.sections[0].rows[0].wrong[1];
  assert.throws(() => OLY.addTasks([task]), /нет объяснения ошибки для варианта «Обязывающая»/);
});

test('analysis-grid: ошибки данных — partial в key, неизвестный фрагмент, maxPoints, сверка, уточнение', () => {
  const cases = [
    [(t) => { t.sections[0].rows[1].partial = [3]; }, /одновременно в key и partial/],
    [(t) => { t.sections[0].rows[0].evidence.key = ['zz']; }, /неизвестный фрагмент zz/],
    [(t) => { t.scoring.maxPoints = 6; }, /сумме баллов элементов: 5/],
    [(t) => { t.legal[0].verified = true; }, /нужна редакция/],
    [(t) => { t.sections[0].rows[1].followUp.when = 0; }, /when должно быть одним из правильных/],
    [(t) => { t.legal = t.legal.filter((b) => b.role !== 'main'); }, /основной блок legal/],
    [(t) => { t.sections[0].rows[2].wrong[1] = 'лишнее'; }, /у правильного варианта 1 не должно быть объяснения/]
  ];
  for (const [mutate, message] of cases) {
    const OLY = loadGridCore();
    const task = gridTask();
    mutate(task);
    assert.throws(() => OLY.addTasks([task]), message);
  }
});

/* ---------- Баллы ---------- */

test('analysis-grid: полный ответ — «верно», 5 из 5', () => {
  const OLY = loadGridCore();
  OLY.addTasks([gridTask()]);
  const task = OLY.getTask('TPR-LAW-NRM-901');
  const result = OLY.grade.gradeTask(task, OLY.types.get('analysis-grid').getCorrect(task));
  assert.equal(result.verdict, 'correct');
  assert.equal(result.points, 5);
  assert.deepEqual(result.details.components, { K: { earned: 3, max: 3 }, T: { earned: 1, max: 1 }, R: { earned: 1, max: 1 } });
});

test('analysis-grid: «спорно» — 1 за оба спорящих вида, ½ за один, 0 за лишний или пустой; ½ за более слабый ответ', () => {
  const OLY = loadGridCore();
  OLY.addTasks([gridTask()]);
  const task = OLY.getTask('TPR-LAW-NRM-901');
  const score = (persons) => OLY.types.get('analysis-grid').check(task, answer({ persons })).details.rows.persons;
  assert.equal(score({ c: 3, f: [0, 1], e: [] }).choicePoints, 1);
  assert.equal(score({ c: 3, f: [1], e: [] }).choicePoints, 0.5);
  assert.equal(score({ c: 3, f: [0, 1, 2], e: [] }).choicePoints, 0);
  assert.equal(score({ c: 3, f: [], e: [] }).choicePoints, 0);
  assert.equal(score({ c: 1, f: [], e: [] }).choicePoints, 0.5);
  assert.equal(score({ c: 0, f: [], e: [] }).choicePoints, 0);
});

test('analysis-grid: равноправные ответы — оба засчитываются полностью', () => {
  const OLY = loadGridCore();
  OLY.addTasks([gridTask()]);
  const task = OLY.getTask('TPR-LAW-NRM-901');
  const type = OLY.types.get('analysis-grid');
  assert.equal(type.check(task, answer({ role: { c: 2, f: [], e: [] } })).details.rows.role.choice, 'ok');
  assert.equal(type.check(task, answer({ role: { c: 1, f: [], e: [] } })).details.rows.role.choice, 'ok');
});

test('analysis-grid: доказательство — ключевой фрагмент и не больше одного постороннего', () => {
  const OLY = loadGridCore();
  OLY.addTasks([gridTask()]);
  const task = OLY.getTask('TPR-LAW-NRM-901');
  const type = OLY.types.get('analysis-grid');
  const ev = (e) => type.check(task, answer({ means: { c: 2, f: [], e } })).details.rows.means;
  assert.equal(ev(['b']).evidencePoints, 1);
  assert.equal(ev(['b', 'a']).evidencePoints, 1);
  assert.equal(ev(['b', 'a', 'c']).evidencePoints, 0);
  assert.equal(ev(['a']).evidencePoints, 0);
  assert.equal(ev([]).evidence, 'empty');
  // Квалификация и доказательство оцениваются независимо.
  const wrongChoice = type.check(task, answer({ means: { c: 0, f: [], e: ['b'] } })).details.rows.means;
  assert.equal(wrongChoice.choicePoints, 0);
  assert.equal(wrongChoice.evidencePoints, 1);
});

test('analysis-grid: вердикты — «частично» при части баллов, «неверно» при нуле, пустой ответ — без ответа', () => {
  const OLY = loadGridCore();
  OLY.addTasks([gridTask()]);
  const task = OLY.getTask('TPR-LAW-NRM-901');
  const partial = OLY.grade.gradeTask(task, answer({ means: { c: 2, f: [], e: [] } }));
  assert.equal(partial.verdict, 'partial');
  assert.equal(partial.points, 1);
  const wrong = OLY.grade.gradeTask(task, answer({ means: { c: 0, f: [], e: ['a'] } }));
  assert.equal(wrong.verdict, 'incorrect');
  assert.equal(wrong.points, 0);
  const empty = OLY.grade.gradeTask(task, answer({}));
  assert.equal(empty.verdict, 'unanswered');
});

test('analysis-grid: структура ответа проверяется; уточнение сбрасывается при другом выборе', () => {
  const OLY = loadGridCore();
  OLY.addTasks([gridTask()]);
  const task = OLY.getTask('TPR-LAW-NRM-901');
  const type = OLY.types.get('analysis-grid');
  assert.throws(() => type.cleanResponse(task, { zzz: { c: 0 } }), /Неизвестная строка/);
  assert.throws(() => type.cleanResponse(task, answer({ means: { c: 9, f: [], e: [] } })), /некорректный вариант/);
  assert.throws(() => type.cleanResponse(task, answer({ role: { c: 1, f: [0], e: [] } })), /уточнения нет/);
  assert.throws(() => type.cleanResponse(task, answer({ role: { c: 1, f: [], e: ['a'] } })), /не предусмотрено/);
  assert.throws(() => type.cleanResponse(task, answer({ means: { c: 2, f: [], e: ['a', 'b', 'c', 'r'] } })), /не больше 3/);
  const cleaned = type.cleanResponse(task, answer({ persons: { c: 1, f: [0], e: [] } }));
  assert.deepEqual(cleaned.persons, { c: 1, f: [], e: [] });
  assert.equal(type.isComplete(task, answer({})), false);
  assert.equal(type.isEmpty(task, answer({})), true);
  assert.equal(type.isEmpty(task, answer({ means: { c: null, f: [], e: ['b'] } })), false);
});

/* ---------- Попытка ---------- */

test('analysis-grid в попытке: «частично» в итогах, баллы по компонентам, восстановление после перезагрузки', () => {
  const OLY = loadBank('olympiad-work.html');
  const A = OLY.attempt;
  const task = OLY.getTask('PR-LAW-NRM-002');   // I-3: карта с доказательствами
  const type = OLY.types.get(task.type);
  const attempt = A.createAttempt({ mode: 'practice', olympiad: 'PR', subject: 'social', taskIds: [task.id],
    settings: { discipline: 'LAW', topic: 'LAW-NRM', filters: {} } });
  const response = type.getCorrect(task);
  response.p4 = { c: 0, f: [], e: ['e8'] };   // неверный выбор и неверное доказательство
  A.setResponse(attempt, task.id, response);
  const result = A.check(attempt, task.id);
  assert.equal(result.verdict, 'partial');
  assert.equal(result.points, 15);
  assert.equal(result.maxPoints, 17);

  const summary = A.summary(attempt);
  assert.equal(summary.partial, 1);
  assert.equal(summary.correct, 0);
  assert.equal(summary.incorrect, 0);
  const outcome = OLY.ui.session.outcome(attempt);
  assert.equal(outcome.partial, 1);
  assert.equal(outcome.components.possible, 17);
  assert.deepEqual(outcome.components.T, { earned: 6, max: 7 });
  assert.equal(OLY.ui.session.taskState(attempt, task.id), 'partial');
  assert.deepEqual(OLY.ui.session.subsetIds(attempt, 'mistakes'), [task.id]);
  assert.deepEqual(OLY.ui.session.subsetIds(attempt, 'skipped'), []);

  A.finish(attempt);
  const scope = { olympiad: 'PR', subject: 'social', discipline: 'LAW', topic: 'LAW-NRM' };
  const restored = OLY.ui.progress.restore(JSON.parse(JSON.stringify(A.snapshot(attempt))), scope);
  assert.ok(restored, 'попытка с вердиктом «частично» должна восстанавливаться');
  assert.deepEqual(restored.results[task.id], attempt.results[task.id]);
  assert.equal(OLY.ui.progress.topicState(restored), 'completed');
  assert.equal(OLY.getAttemptPolicy('PR').allowRetake, false, 'одна оцениваемая попытка');
  assert.deepEqual(loadBank('olympiad-demo.html').getAttemptPolicy('DEMO'), OLY.getAttemptPolicy('PR'));
});

/* ---------- Демонстрационная страница и публикуемый банк ---------- */

test('olympiad-demo.html совпадает с результатом scripts/build-demo-page.js', () => {
  const html = fs.readFileSync(path.join(root, 'olympiad-demo.html'), 'utf8');
  assert.equal(html, build(), 'Запустите node scripts/build-demo-page.js');
});

test('Демо-данные и новые механики не подключены к основной странице olympiad.html', () => {
  const scripts = pageScripts();
  assert.ok(!scripts.some((s) => s.startsWith('demo/')), 'демо-данные на основной странице');
  const OLY = loadBank();
  assert.equal(OLY.getTask('DEMO-LAW-NRM-006'), null);
  assert.equal(OLY.getOlympiad('DEMO'), null);
});

test('Публикуемый банк: ни одного задания с несверенным нормативным текстом', () => {
  const OLY = loadBank();
  for (const task of OLY.tasks) {
    for (const block of task.legal || []) {
      assert.equal(block.verified, true, `${task.id}: текст ${block.ref} не сверен`);
    }
    assert.notEqual(task.demo, true, `${task.id}: демонстрационное задание в публикуемом банке`);
  }
});

test('Демо-банк: задания помечены как демонстрационные, у каждого типа есть отрисовка', () => {
  const OLY = loadBank('olympiad-demo.html');
  const demo = OLY.tasks.filter((t) => t.olympiad === 'DEMO');
  assert.ok(demo.length >= 1);
  for (const task of demo) {
    assert.equal(task.demo, true, task.id);
    assert.ok(OLY.ui.views.has(task.type), task.id);
    assert.ok(typeof OLY.ui.views.get(task.type).feedbackSummary === 'function', task.id);
  }
  // Задания LAW-CPT на демо-странице те же, что на основной.
  const main = loadBank();
  assert.deepEqual(OLY.tasks.filter((t) => t.topic === 'LAW-CPT').map((t) => t.id),
    main.tasks.filter((t) => t.topic === 'LAW-CPT').map((t) => t.id));
});
