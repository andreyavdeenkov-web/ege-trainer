'use strict';

/**
 * Фильтр «Формат», оценивание по типам (таблица GRADERS и статус сверки
 * с ФИПИ), смешанная попытка из трёх форматов, повторное прохождение,
 * подписи источника в разборе.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBank, loadWithView } = require('./helpers/ege.js');

const EGE = loadBank();
const S = EGE.scoring;
const A = EGE.attempt;
const ids = (tasks) => Array.from(tasks, (t) => t.id).sort();

/* ---------- Фильтр «Формат» ---------- */

test('getPool без формата и с «all» — как раньше', () => {
  for (const [section, topic] of [['all', 'all'], ['OBS', 'all'], ['OBS', 'OBS-ACT'], ['SOC', 'SOC-FAM']]) {
    const plain = EGE.getPool(section, topic);
    assert.deepEqual(ids(EGE.getPool(section, topic, 'all')), ids(plain));
    assert.deepEqual(ids(EGE.getPool(section, topic, undefined)), ids(plain));
  }
});

test('формат сужает пул; сумма по форматам равна всему пулу', () => {
  for (const [section, topic] of [['all', 'all'], ['OBS', 'all'], ['OBS', 'OBS-ACT'], ['SOC', 'all'], ['SOC', 'SOC-FAM']]) {
    const all = EGE.getPool(section, topic);
    let sum = 0;
    for (const type of S.TYPES) {
      const pool = EGE.getPool(section, topic, type);
      pool.forEach((t) => assert.equal(S.getTaskType(t), type, `${t.id} в пуле ${type}`));
      sum += pool.length;
    }
    assert.equal(sum, all.length, `${section}/${topic}`);
  }
});

test('фильтр формата учитывает раздел и тему', () => {
  assert.deepEqual(ids(EGE.getPool('OBS', 'OBS-ACT', 'exclude-two')), ['OBS-ACT-001']);
  assert.equal(EGE.getPool('SOC', 'SOC-FAM', 'matching').length, 0);
  assert.equal(EGE.getPool('SOC', 'SOC-FAM', 'multiple').length, 1);
  assert.equal(EGE.getPool('all', 'all', 'matching').length, 3);
  // Снятые с выдачи задания не возвращаются и через фильтр.
  EGE.getPool('all', 'all', 'multiple').forEach((t) => assert.ok(!t.retired));
});

test('неизвестный формат: пустой пул, getFormat — null', () => {
  assert.equal(EGE.getFormat('essay'), null);
  assert.equal(EGE.getPool('all', 'all', 'essay').length, 0);
  assert.equal(EGE.getFormat('matching').title, 'Установление соответствия');
});

/* ---------- Оценивание по типам ---------- */

test('у каждого типа своя проверка и своё правило', () => {
  assert.deepEqual(Object.keys(S.GRADERS).sort(), [...S.TYPES].sort());
  assert.deepEqual(Object.keys(S.SCORING_RULES).sort(), [...S.TYPES].sort());
  assert.notEqual(S.GRADERS.multiple.countMistakes, S.GRADERS.matching.countMistakes,
    'multiple и matching считают ошибки по-разному');
  assert.equal(S.GRADERS.multiple.maxPoints, 2);
  assert.equal(S.GRADERS['exclude-two'].maxPoints, 1);
  assert.equal(S.GRADERS.matching.maxPoints, 2);
});

test('правила оценивания не выдаются за подтверждённые ФИПИ без ссылки на документ', () => {
  for (const [type, rule] of Object.entries(S.SCORING_RULES)) {
    assert.equal(typeof rule.verified, 'boolean', type);
    if (rule.verified) assert.ok(rule.reference, `${type}: verified без ссылки на документ ФИПИ`);
    else assert.equal(rule.reference, null, `${type}: ссылка есть, а verified: false`);
    assert.equal(rule.verified, false, `${type}: правило ещё не сверено с официальной спецификацией`);
  }
  assert.equal(S.SCORING_RULES['exclude-two'].kimTask, 1, 'два лишних термина — формат задания № 1');
});

test('образцы из пособия (тип A): ключи 234 и 2345', () => {
  const task = (key) => ({ statements: [1, 2, 3, 4, 5].map((n) => ({ correct: key.includes(n) })) });
  const t234 = task([2, 3, 4]);
  assert.equal(S.scoreTask(t234, [2, 3, 4]), 2);
  assert.equal(S.scoreTask(t234, [2, 3]), 1);        // пропущен один верный
  assert.equal(S.scoreTask(t234, [2, 3, 4, 5]), 1);  // один лишний
  assert.equal(S.scoreTask(t234, [2, 5]), 0);        // пропущены 3 и 4, лишний 5
  const t2345 = task([2, 3, 4, 5]);
  assert.equal(S.scoreTask(t2345, [2, 3, 4, 5]), 2);
  assert.equal(S.scoreTask(t2345, [2, 3]), 0);       // пропущены два верных
});

test('частично заполненный ответ не засчитывается ни в одном формате', () => {
  const multiple = { id: 'SOC-FAM-901', statements: [{ correct: true }, { correct: false }, { correct: true }] };
  const exclude = { id: 'SOC-FAM-902', type: 'exclude-two', statements: [true, false, false, true, false, false].map((c) => ({ correct: c })) };
  const matching = { id: 'SOC-FAM-903', type: 'matching', items: [{ match: 1 }, { match: 2 }], options: ['a', 'b'] };
  const a = A.createAttempt({ taskIds: [multiple.id, exclude.id, matching.id] });
  assert.throws(() => A.recordAnswer(a, multiple, []), /Не выбрано/);
  A.recordAnswer(a, multiple, [1, 3]);
  assert.throws(() => A.recordAnswer(a, exclude, [1]), /ровно 2/);
  A.recordAnswer(a, exclude, [1, 4]);
  assert.throws(() => A.recordAnswer(a, matching, [1, null]), /Не выбран вариант для позиции Б/);
  assert.throws(() => A.recordAnswer(a, matching, [1]), /каждой позиции/);
  A.recordAnswer(a, matching, [1, 2]);
  assert.equal(A.answeredCount(a), 3);
});

test('смешанная попытка: баллы по каждому формату и итог', () => {
  const pool = [...EGE.getPool('OBS', 'OBS-ACT', 'multiple').slice(0, 2),
    ...EGE.getPool('all', 'all', 'exclude-two'), ...EGE.getPool('all', 'all', 'matching')];
  const a = A.createAttempt({ settings: { section: 'all', topic: 'all', format: 'all' }, taskIds: pool.map((t) => t.id) });
  assert.equal(A.maxScore(a, EGE.getTask), 2 * 2 + 1 + 3 * 2);

  let expected = 0;
  pool.forEach((task, i) => {
    const key = Array.from(S.getCorrect(task));
    let answer = key;
    if (i % 2 === 1 && S.getTaskType(task) === 'matching') {
      // Перестановка двух номеров — две ошибки.
      answer = key.slice();
      [answer[0], answer[1]] = [answer[1], answer[0]];
    }
    const rec = A.recordAnswer(a, task, answer);
    assert.equal(rec.maxPoints, S.getMaxPoints(task));
    expected += rec.points;
  });
  assert.equal(A.totalScore(a), expected);
  assert.ok(A.isComplete(a));
});

test('повторное прохождение: новая попытка с тем же набором, без старых ответов', () => {
  const pool = EGE.getPool('OBS', 'OBS-ACT', 'matching');
  const first = A.createAttempt({ settings: { section: 'OBS', topic: 'OBS-ACT', format: 'matching' }, taskIds: pool.map((t) => t.id) });
  pool.forEach((t) => A.recordAnswer(first, t, Array.from(S.getCorrect(t))));
  A.finishAttempt(first);

  const second = A.createAttempt({ settings: first.settings, taskIds: pool.map((t) => t.id) });
  assert.notEqual(second.id, first.id);
  assert.equal(second.finishedAt, null);
  assert.equal(second.answers.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(second.settings)), { section: 'OBS', topic: 'OBS-ACT', format: 'matching' });
  // Новая попытка не зависит от первой.
  A.recordAnswer(second, pool[0], Array.from(S.getCorrect(pool[0])));
  assert.equal(first.answers.length, pool.length);
});

test('формат в попытке: необязателен, пустой — «all»', () => {
  assert.equal(A.createAttempt({ taskIds: ['X'] }).settings.format, undefined);
  assert.equal(A.createAttempt({ settings: { format: '' }, taskIds: ['X'] }).settings.format, 'all');
  const a = A.createAttempt({ settings: { section: 'SOC', topic: 'SOC-FAM', format: 'multiple' }, taskIds: ['X'] });
  assert.deepEqual(JSON.parse(JSON.stringify(a.settings)), { section: 'SOC', topic: 'SOC-FAM', format: 'multiple' });
});

/* ---------- Источник в разборе ---------- */

test('подпись источника: показывается только для установленного источника', () => {
  const V = loadWithView().taskView;
  assert.equal(V.sourceLabel({}), null);
  assert.equal(V.sourceLabel({ source: { kind: 'author' } }), 'Авторское задание');
  assert.equal(V.sourceLabel({ source: { kind: 'original' } }), null, 'без названия пособия источник не показывается');
  assert.equal(V.sourceLabel({ source: { kind: 'original', title: 'Пособие', authors: 'Иванов И. И.', year: 2025, ref: 'с. 22, № 3', adapted: true } }),
    'Источник: Пособие, Иванов И. И., 2025, с. 22, № 3 (формулировка адаптирована)');
  assert.equal(V.sourceLabel({ source: { kind: 'original', title: 'Пособие' } }), 'Источник: Пособие');
});
