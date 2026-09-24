'use strict';

/**
 * Олимпиады: проверка реального банка заданий. Загружает скрипты так же,
 * как браузер (в порядке <script> из olympiad.html), и валидирует данные.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CORE_SCRIPTS, pageScripts, loadBank } = require('./helpers/olymp.js');

const root = path.join(__dirname, '..');
const scripts = pageScripts();
const dataScripts = scripts.filter((s) => s.startsWith('data/olympiads/'));

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const PILOT_SOURCE = 'HP-2026-27-DEMO-9-1';

/** Официальные ключи демоверсии 2026/27, 9 класс, отборочный этап, I тур. */
const PILOT = [
  { number: 1, id: 'HP-PHI-RUS-001', discipline: 'PHI', topic: 'PHI-RUS', type: 'multiple-select', options: 6, key: [1, 2, 3, 4] },
  { number: 2, id: 'HP-SOC-CAR-001', discipline: 'SOC', topic: 'SOC-CAR', type: 'single-select', options: 4, key: 2 },
  { number: 3, id: 'HP-POL-RAT-001', discipline: 'POL', topic: 'POL-RAT', type: 'single-select', options: 4, key: 1 },
  { number: 4, id: 'HP-ECO-INE-001', discipline: 'ECO', topic: 'ECO-INE', type: 'multiple-select', options: 5, key: [1, 2, 4] },
  { number: 5, id: 'HP-LAW-FAM-001', discipline: 'LAW', topic: 'LAW-FAM', type: 'multiple-select', options: 6, key: [1, 3, 4] }
];

test('olympiad.html: сначала ядро в нужном порядке, затем данные; все файлы подключены', () => {
  assert.deepEqual(scripts.slice(0, CORE_SCRIPTS.length), CORE_SCRIPTS);
  for (const s of scripts) {
    assert.ok(fs.existsSync(path.join(root, s)), `Скрипт ${s} из olympiad.html не найден`);
  }
  const files = listJsFiles(path.join(root, 'data/olympiads'))
    .map((f) => path.relative(root, f).split(path.sep).join('/'));
  assert.ok(files.length > 0);
  for (const f of files) {
    assert.ok(dataScripts.includes(f), `Файл ${f} не подключён в olympiad.html`);
  }
});

test('olympiad.html не подключает тренажёр ЕГЭ, index.html — олимпиады', () => {
  assert.ok(!scripts.some((s) => s.startsWith('data/tasks/') || /^js\/[^/]+\.js$/.test(s)));
  const egeHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!egeHtml.includes('js/olymp/') && !egeHtml.includes('data/olympiads/'));
});

test('банк загружается; каталог и олимпиада «Высшая проба»', () => {
  const OLY = loadBank();
  const hp = OLY.getOlympiad('HP');
  assert.equal(hp.title, 'Высшая проба');
  assert.deepEqual(hp.stages, ['qualifying', 'final']);
  assert.deepEqual(OLY.getSubject('social').disciplines.map((d) => d.id), ['PHI', 'SOC', 'POL', 'ECO', 'LAW']);
});

test('каждое задание корректно: тип, критерии, нет полей источника', () => {
  const OLY = loadBank();
  assert.ok(OLY.tasks.length > 0);
  for (const task of OLY.tasks) {
    assert.deepEqual(OLY.types.get(task.type).validateTask(task), [], task.id);
    assert.deepEqual(OLY.scoringRules.validateScoring(task.scoring, task.type), [], task.id);
    for (const field of ['class', 'classes', 'stage', 'round', 'year', 'source']) {
      assert.ok(!(field in task), `${task.id}: поле ${field} относится к источнику`);
    }
  }
});

test('тексты заданий без переносов строк и лишних пробелов', () => {
  const OLY = loadBank();
  const clean = (text, where) => {
    assert.equal(text, text.trim(), where + ': пробелы по краям');
    assert.ok(!/\s{2,}|\n/.test(text), where + ': перенос строки или двойной пробел');
  };
  for (const task of OLY.tasks) {
    clean(task.question, task.id);
    (task.options || []).forEach((o, i) => clean(typeof o === 'string' ? o : o.text, `${task.id}, вариант ${i + 1}`));
  }
});

test('пилот: пять заданий, официальные ключи, исходная нумерация вариантов', () => {
  const OLY = loadBank();
  for (const p of PILOT) {
    const task = OLY.getTask(p.id);
    assert.ok(task, p.id);
    assert.equal(task.olympiad, 'HP');
    assert.equal(task.subject, 'social');
    assert.equal(task.discipline, p.discipline, p.id);
    assert.equal(task.topic, p.topic, p.id);
    assert.equal(task.type, p.type, p.id);
    assert.equal(task.options.length, p.options, p.id);
    assert.deepEqual(OLY.types.get(task.type).getCorrect(task), p.key, p.id);
  }
});

test('пилот: критерии оценивания не придуманы, объяснений нет', () => {
  const OLY = loadBank();
  for (const p of PILOT) {
    const task = OLY.getTask(p.id);
    assert.equal(task.scoring, null, p.id);
    assert.equal(task.explanation, undefined, p.id);
    task.options.forEach((o, i) => assert.equal(o.explanation, undefined, `${p.id}, вариант ${i + 1}`));
    assert.equal(OLY.getSourceItem(PILOT_SOURCE, p.id).scoring, undefined, p.id);
  }
});

test('источник пилота: официальная демоверсия, 9 класс, отборочный этап, I тур', () => {
  const OLY = loadBank();
  const source = OLY.getSource(PILOT_SOURCE);
  assert.equal(source.olympiad, 'HP');
  assert.equal(source.subject, 'social');
  assert.equal(source.kind, 'demo');
  assert.equal(source.year, '2026/27');
  assert.deepEqual(source.classes, [9]);
  assert.equal(source.stage, 'qualifying');
  assert.equal(source.round, 1);
  assert.equal(source.answersBasis, 'official');
  assert.equal(source.playable, true);
  assert.deepEqual(source.items.map((i) => [i.number, i.taskId]), PILOT.map((p) => [p.number, p.id]));
});

test('фильтр «Высшая проба → обществознание → 9 класс → qualifying → I тур» — ровно пять заданий по порядку', () => {
  const OLY = loadBank();
  const filters = { olympiad: 'HP', subject: 'social', class: 9, stage: 'qualifying', round: 1 };
  assert.deepEqual(OLY.query(filters).map((t) => t.id), PILOT.map((p) => p.id));
  // Пробный тур: тот же набор в порядке номеров демоверсии.
  const sources = OLY.getPlayableSources(filters);
  assert.deepEqual(sources.map((s) => s.id), [PILOT_SOURCE]);
  assert.deepEqual(OLY.getSourceTaskIds(PILOT_SOURCE), PILOT.map((p) => p.id));
  // Другие классы, этап и тур этих заданий не находят.
  assert.deepEqual(OLY.query({ ...filters, class: 10 }), []);
  assert.deepEqual(OLY.query({ ...filters, stage: 'final' }), []);
  assert.deepEqual(OLY.query({ ...filters, round: 2 }), []);
});

test('тематический режим: задание находится по теме без указания класса', () => {
  const OLY = loadBank();
  for (const p of PILOT) {
    const found = OLY.query({ olympiad: 'HP', subject: 'social', discipline: p.discipline, topic: p.topic, class: 'all', round: 'all' });
    assert.deepEqual(found.map((t) => t.id), [p.id]);
    assert.deepEqual(OLY.getTaskFacets(p.id), { classes: [9], stages: ['qualifying'], rounds: [1], years: ['2026/27'], sourceKinds: ['demo'] });
  }
  assert.deepEqual(OLY.getAvailableDisciplines({ olympiad: 'HP', subject: 'social' }).map((d) => d.id),
    ['PHI', 'SOC', 'POL', 'ECO', 'LAW']);
});

test('пилот проходится как пробный тур; без критериев — вердикты без баллов', () => {
  const OLY = loadBank();
  const A = OLY.attempt;
  const attempt = A.createAttempt({ mode: 'mock', settings: { sourceId: PILOT_SOURCE } });
  assert.deepEqual(attempt.taskIds, PILOT.map((p) => p.id));
  A.setResponse(attempt, 'HP-PHI-RUS-001', [1, 2, 3, 4]);
  A.setResponse(attempt, 'HP-SOC-CAR-001', 2);
  A.setResponse(attempt, 'HP-POL-RAT-001', 2);
  A.setResponse(attempt, 'HP-ECO-INE-001', [1, 2]);
  A.finish(attempt);
  assert.deepEqual(A.summary(attempt), {
    total: 5, correct: 2, incorrect: 2, skipped: 1,
    points: 0, maxPoints: 0, scoredCount: 0, unscoredCount: 5
  });
  assert.equal(A.getResult(attempt, 'HP-PHI-RUS-001').points, null);
});

/* ---------- Авторские задания: Политология · Власть и легитимность ---------- */

const POW_SOURCE = 'HP-AUTHOR-POL-POW';

/** Утверждённые ключи (single-select — число, multiple-select — список). */
const POW_KEYS = {
  '003': 1, '004': [1, 2, 3], '005': 1, '006': 1, '007': [1, 2, 3], '008': 1,
  '009': [1, 2, 3], '010': 1, '012': 3, '013': 1, '014': [1, 2, 3], '015': [1, 2, 3],
  '016': 1, '017': 1, '018': 1, '020': 1, '021': [1, 2, 3], '022': [1, 2, 3],
  '023': [1, 2, 3], '024': [1, 2]
};
const POW_IDS = Object.keys(POW_KEYS).map((n) => 'HP-POL-POW-' + n);

test('власть и легитимность: 20 утверждённых заданий с ключами', () => {
  const OLY = loadBank();
  const found = OLY.query({ olympiad: 'HP', subject: 'social', discipline: 'POL', topic: 'POL-POW' });
  assert.deepEqual(found.map((t) => t.id).sort(), [...POW_IDS].sort());
  for (const [n, key] of Object.entries(POW_KEYS)) {
    const task = OLY.getTask('HP-POL-POW-' + n);
    assert.equal(task.type, Array.isArray(key) ? 'multiple-select' : 'single-select', task.id);
    assert.deepEqual(OLY.types.get(task.type).getCorrect(task), key, task.id);
    assert.equal(task.scoring, null, task.id);
  }
});

test('власть и легитимность: в активном банке только single-select и multiple-select', () => {
  const OLY = loadBank();
  for (const task of OLY.query({ olympiad: 'HP', subject: 'social', topic: 'POL-POW' })) {
    assert.ok(['single-select', 'multiple-select'].includes(task.type), task.id);
    assert.ok(OLY.ui.views.has(task.type), task.id);
  }
  // Задания на соответствие — в резерве (docs/drafts), в банке их нет.
  assert.equal(OLY.getTask('HP-POL-POW-011'), null);
  assert.equal(OLY.getTask('HP-POL-POW-019'), null);
});

test('власть и легитимность: авторский источник, не официальный и не пробный тур', () => {
  const OLY = loadBank();
  const source = OLY.getSource(POW_SOURCE);
  assert.equal(source.kind, 'author-set');
  assert.equal(source.answersBasis, 'author');
  assert.equal(source.playable, false);
  for (const field of ['year', 'classes', 'stage', 'round']) assert.equal(source[field], undefined, field);
  assert.deepEqual(OLY.getSourceTaskIds(POW_SOURCE).slice().sort(), [...POW_IDS].sort());
  assert.deepEqual(source.items.map((i) => i.number), POW_IDS.map((_, i) => i + 1));
  // В пробные туры и в выборку «9 класс, отбор, I тур» авторские задания не попадают.
  assert.deepEqual(OLY.getPlayableSources({ olympiad: 'HP' }).map((s) => s.id), [PILOT_SOURCE]);
  assert.equal(OLY.query({ olympiad: 'HP', subject: 'social', class: 9, stage: 'qualifying', round: 1 }).length, 5);
});

test('власть и легитимность: строка источника для ученика — «авторские задания», без номера', () => {
  const OLY = loadBank();
  const [appearance] = OLY.getAppearances('HP-POL-POW-024');
  assert.equal(OLY.ui.format.sourceLine(appearance), 'Авторские задания в формате «Высшей пробы»');
  assert.deepEqual(OLY.getTaskFacets('HP-POL-POW-024'),
    { classes: [], stages: [], rounds: [], years: [], sourceKinds: ['author-set'] });
});

test('политология: фильтры «Источник» и «Тип задания» появляются, когда в данных больше одного значения', () => {
  const OLY = loadBank();
  const F = OLY.ui.filters;
  const all = { olympiad: 'HP', subject: 'social', discipline: 'POL', topic: 'all' };
  const groups = F.describe(all, {});
  assert.deepEqual(groups.map((g) => g.key), ['class', 'round', 'sourceKind', 'type']);
  const source = groups.find((g) => g.key === 'sourceKind');
  assert.deepEqual(source.options.map((o) => [o.label, o.count]),
    [['Все', 21], ['Официальные демоверсии', 1], ['Авторские задания', 20]]);
  assert.deepEqual(groups.find((g) => g.key === 'type').options.map((o) => [o.label, o.count]),
    [['Все', 21], ['Один вариант ответа', 12], ['Несколько вариантов ответа', 9]]);
  assert.equal(F.buildPool(all, { class: 9 }).length, 1);
  assert.equal(F.buildPool(all, { sourceKind: 'author-set', type: 'single-select' }).length, 11);
  // Внутри темы источник один — фильтр источника скрыт; класс и тур показаны, но без заданий.
  const topic = F.describe({ ...all, topic: 'POL-POW' }, {});
  assert.deepEqual(topic.map((g) => g.key), ['class', 'round', 'type']);
  assert.deepEqual(topic[0].options.map((o) => o.count), [20, 0, 0, 0]);
});
