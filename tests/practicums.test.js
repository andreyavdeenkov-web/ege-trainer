'use strict';

/**
 * Реестр практикумов (data/practicums.js, EGE.addPracticums в js/registry.js):
 * структура «раздел → тема → практикум → задания», состав опубликованных
 * практикумов, уникальность ID, видимость только готовых практикумов и тем,
 * совместимость с наборами страниц предпросмотра.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, scripts, loadBank, contentHash } = require('./helpers/ege.js');

const EGE = loadBank();
const ids = (list) => Array.from(list, (x) => x.id);

/** Ядро и задания без реестра практикумов: для проверок EGE.addPracticums на тестовых данных. */
function loadTasksOnly() {
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of ['js/registry.js', 'js/scoring.js', ...scripts.filter((s) => s.startsWith('data/tasks/'))]) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

/** Набор страницы предпросмотра (EGE.preview) — как его видит страница. */
function previewSet(page) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const context = vm.createContext({});
  context.globalThis = context;
  for (const [, src] of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    if (src === 'js/task-view.js' || src === 'js/app.js') continue;
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

/** Опубликованные практикумы и их точный состав. */
const PUBLISHED = {
  'OBS-ACT-P01': {
    topic: 'OBS-ACT', number: 1, shuffle: true, max: 31,
    taskIds: Array.from({ length: 16 }, (_, i) => 'OBS-ACT-' + String(i + 1).padStart(3, '0'))
  },
  'OBS-COG-P01': {
    topic: 'OBS-COG', number: 1, shuffle: false, max: 33,
    taskIds: ['OBS-COG-031', 'OBS-COG-002', 'OBS-COG-032', 'OBS-COG-008', 'OBS-COG-033', 'OBS-COG-003',
      'OBS-COG-034', 'OBS-COG-035', 'OBS-COG-039', 'OBS-COG-019', 'OBS-COG-016', 'OBS-COG-017', 'OBS-COG-036',
      'OBS-COG-037', 'OBS-COG-025', 'OBS-COG-026', 'OBS-COG-006', 'OBS-COG-038', 'OBS-COG-028']
  },
  'OBS-SCK-P01': {
    topic: 'OBS-SCK', number: 1, shuffle: false, max: 39,
    taskIds: [34, 17, 21, 22, 1, 13, 19, 35, 15, 25, 33, 28, 40, 3, 11, 7, 45, 41, 10, 27, 9, 43, 39, 31, 50]
      .map((n) => 'OBS-SCK-' + String(n).padStart(3, '0'))
  },
  'OBS-SCK-P02': {
    topic: 'OBS-SCK', number: 2, shuffle: false, max: 39,
    taskIds: [2, 4, 26, 23, 5, 20, 12, 32, 24, 36, 29, 8, 37, 14, 49, 38, 6, 42, 16, 30, 48, 46, 47, 44, 18]
      .map((n) => 'OBS-SCK-' + String(n).padStart(3, '0'))
  },
  'OBS-SYS-P01': {
    topic: 'OBS-SYS', number: 1, shuffle: false, max: 32,
    taskIds: Array.from({ length: 18 }, (_, i) => 'OBS-SYS-' + String(i + 1).padStart(3, '0'))
  },
  'OBS-SYS-P02': {
    topic: 'OBS-SYS', number: 2, shuffle: false, max: 31,
    taskIds: Array.from({ length: 18 }, (_, i) => 'OBS-SYS-' + String(i + 19).padStart(3, '0'))
  },
  'SOC-FAM-P01': {
    topic: 'SOC-FAM', number: 1, shuffle: true, max: 29,
    taskIds: ['SOC-FAM-001', 'SOC-FAM-004', 'SOC-FAM-005', 'SOC-FAM-012', 'SOC-FAM-014', 'SOC-FAM-017', 'SOC-FAM-019', 'SOC-FAM-022', 'SOC-FAM-024', 'SOC-FAM-031', 'SOC-FAM-032', 'SOC-FAM-034', 'SOC-FAM-037', 'SOC-FAM-038', 'SOC-FAM-041', 'SOC-FAM-042']
  },
  'SOC-FAM-P02': {
    topic: 'SOC-FAM', number: 2, shuffle: true, max: 28,
    taskIds: ['SOC-FAM-002', 'SOC-FAM-003', 'SOC-FAM-006', 'SOC-FAM-007', 'SOC-FAM-016', 'SOC-FAM-018', 'SOC-FAM-021', 'SOC-FAM-023', 'SOC-FAM-025', 'SOC-FAM-026', 'SOC-FAM-033', 'SOC-FAM-035', 'SOC-FAM-036', 'SOC-FAM-039', 'SOC-FAM-040']
  }
};

/* ---------- Темы раздела «Человек и общество» ---------- */

test('«Человек и общество»: 14 тем кодификатора и «Научное познание» в заданном порядке, ID постоянные', () => {
  const topics = EGE.getSection('OBS').topics.filter((t) => t.id !== 'OBS-GEN');
  assert.deepEqual([...topics.map((t) => t.title)], [
    'Человек и личность', 'Мировоззрение и сознание', 'Деятельность', 'Познание',
    'Научное познание', 'Общество как система. Социальные институты', 'Социальные институты', 'Типы обществ',
    'Общественное развитие и глобализация', 'Культура', 'Мораль',
    'Наука и научное познание', 'Образование', 'Религия', 'Искусство'
  ]);
  // Существующие ID сохранены.
  assert.equal(EGE.getTopic('OBS-ACT').title, 'Деятельность');
  assert.equal(EGE.getTopic('OBS-COG').title, 'Познание');
  assert.equal(EGE.getTopic('OBS-SCI').title, 'Наука и научное познание');
  // «Научное познание» — отдельная тема, не связанная с «Познанием».
  assert.equal(EGE.getTopic('OBS-SCK').title, 'Научное познание');
  // Новые ID — по схеме РАЗДЕЛ-ТЕМА и уникальны во всём реестре.
  const all = EGE.sections.flatMap((s) => s.topics.map((t) => t.id));
  assert.equal(new Set(all).size, all.length);
  for (const t of topics) assert.match(t.id, /^OBS-[A-Z]{3}$/);
  // Отдельной темы «Истина» нет: её задания — в «Познании».
  assert.ok(!EGE.sections.some((s) => s.topics.some((t) => /истин/i.test(t.title))));
});

test('«Общие вопросы» остаются в реестре (их задания не удалены), но в практикумы не входят', () => {
  const general = EGE.sections.flatMap((sec) => sec.topics).filter((t) => t.general).map((t) => t.id);
  assert.deepEqual([...general], ['OBS-GEN', 'ECO-GEN', 'POL-GEN', 'LAW-GEN']);
  for (const id of ['OBS-GEN', 'ECO-GEN', 'POL-GEN', 'LAW-GEN']) {
    assert.ok(EGE.getTopic(id), id);
    assert.equal(EGE.getTasksByTopic(id).length, 3, `${id}: задания на месте`);
    assert.equal(EGE.getPracticumsByTopic(id).length, 0, `${id}: практикумов нет`);
  }
  for (const p of EGE.practicums) {
    for (const id of p.taskIds) assert.ok(!/-GEN-/.test(id), `${p.id}: ${id}`);
  }
});

/* ---------- Реестр ---------- */

test('у каждого практикума: постоянный уникальный ID, тема, номер, задания, статус', () => {
  const seen = new Set();
  for (const p of EGE.practicums) {
    assert.match(p.id, EGE.PRACTICUM_ID_PATTERN);
    assert.ok(!seen.has(p.id), `повтор ${p.id}`);
    seen.add(p.id);
    assert.ok(EGE.getTopic(p.topic), p.id);
    const kind = p.status === 'retired' ? 'R' : 'P';
    assert.equal(p.id, `${p.topic}-${kind}${String(p.number).padStart(2, '0')}`);
    assert.ok(EGE.PRACTICUM_STATUSES.includes(p.status), p.id);
    assert.ok(p.taskIds.length > 0, p.id);
    assert.equal(new Set(p.taskIds).size, p.taskIds.length, `${p.id}: задания повторяются`);
    assert.equal(p.section, EGE.getTopic(p.topic).section);
    // ID практикума не совпадает с форматом ID задания и не занят заданием.
    assert.doesNotMatch(p.id, EGE.TASK_ID_PATTERN);
    assert.equal(EGE.getTask(p.id), null);
  }
});

test('опубликованы ровно восемь практикумов с утверждённым составом', () => {
  const published = EGE.practicums.filter((p) => p.status === 'published');
  assert.deepEqual(ids(published).sort(), Object.keys(PUBLISHED).sort());
  for (const [id, want] of Object.entries(PUBLISHED)) {
    const p = EGE.getPracticum(id);
    assert.equal(p.topic, want.topic, id);
    assert.equal(p.number, want.number, id);
    assert.equal(!!p.shuffle, want.shuffle, id);
    assert.deepEqual(Array.from(p.taskIds), want.taskIds, `${id}: состав и порядок`);
    assert.equal(EGE.getPracticumMaxScore(p), want.max, `${id}: максимум баллов`);
    assert.ok(EGE.isPracticumReady(p), id);
    assert.equal(EGE.practicumTitle(p), `Практикум № ${want.number}`);
  }
});

test('«Деятельность», Практикум № 1 — все 16 заданий основного каталога', () => {
  assert.deepEqual(Array.from(EGE.getPracticum('OBS-ACT-P01').taskIds).sort(),
    ids(EGE.getTasksByTopic('OBS-ACT')).sort());
});

test('«Познание», Практикум № 1 — набор страницы предпросмотра: 19 заданий, тот же порядок, 33 балла', () => {
  const page = previewSet('preview-poznanie.html');
  const p = EGE.getPracticum('OBS-COG-P01');
  assert.equal(page.preview.id, 'poznanie-19');
  assert.deepEqual(Array.from(p.taskIds), Array.from(page.preview.taskIds));
  // Задания на странице и в основном банке — одни и те же: формулировки, ключи, объяснения.
  for (const id of p.taskIds) assert.equal(contentHash(page.getTask(id)), contentHash(EGE.getTask(id)), id);
  // Система оценивания та же: 14 заданий по 2 балла + 5 соответствий модели 3 по 1 баллу.
  const tasks = EGE.getPracticumTasks(p);
  assert.equal(tasks.filter((t) => EGE.scoring.getMaxPoints(t) === 2).length, 14);
  assert.equal(tasks.filter((t) => EGE.scoring.getScoringModel(t) === 'matching-1').length, 5);
  assert.equal(EGE.getPracticumMaxScore(p), 33);
});

test('«Семья и брак»: два самостоятельных практикума из всех 31 задания, без повторов', () => {
  const p1 = EGE.getPracticum('SOC-FAM-P01');
  const p2 = EGE.getPracticum('SOC-FAM-P02');
  assert.equal(p1.taskIds.length, 16);
  assert.equal(p2.taskIds.length, 15);
  assert.ok(p1.taskIds.every((id) => !p2.taskIds.includes(id)), 'задания не повторяются');
  assert.deepEqual([...p1.taskIds, ...p2.taskIds].sort(), [...ids(EGE.getTasksByTopic('SOC-FAM'))].sort(), 'все 31 задание темы');
  // В каждом — все три формата и разные уровни сложности.
  for (const [p, formats] of [[p1, { multiple: 8, 'exclude-two': 3, matching: 5 }], [p2, { multiple: 8, 'exclude-two': 2, matching: 5 }]]) {
    const tasks = EGE.getPracticumTasks(p);
    const count = {};
    for (const t of tasks) count[EGE.scoring.getTaskType(t)] = (count[EGE.scoring.getTaskType(t)] || 0) + 1;
    assert.deepEqual(count, formats, p.id);
    const levels = new Set(tasks.map((t) => t.difficulty).filter(Boolean));
    assert.deepEqual([...levels].sort(), [1, 2, 3], `${p.id}: сложность 1–3`);
  }
});

test('«Семья и брак»: прежний набор из 31 задания — только для продолжения начатых попыток', () => {
  const old = EGE.getPracticum('SOC-FAM-R01');
  assert.equal(old.status, 'retired');
  assert.equal(EGE.practicumTitle(old), 'Прежний набор (31 задание)');
  assert.deepEqual([...old.taskIds].sort(), [...ids(EGE.getTasksByTopic('SOC-FAM'))].sort());
  assert.equal(EGE.getPracticumMaxScore(old), 57);
  assert.ok(old.legacyTopicAttempts, 'сюда переносятся попытки темы целиком');
  assert.equal(EGE.getPracticum('SOC-FAM-P01').legacyTopicAttempts, undefined);
  // Новым ученикам не предлагается, но продолжить начатое можно.
  assert.ok(!EGE.isPracticumReady(old));
  assert.ok(EGE.isPracticumContinuable(old));
  assert.deepEqual(ids(EGE.getPublishedPracticums('SOC-FAM')), ['SOC-FAM-P01', 'SOC-FAM-P02']);
  assert.deepEqual(ids(EGE.getRetiredPracticums('SOC-FAM')), ['SOC-FAM-R01']);
  assert.deepEqual(ids(EGE.getRetiredPracticums('OBS-ACT')), []);
});

test('«Наука и научное познание»: задания сохранены, неполный набор не опубликован', () => {
  assert.equal(EGE.getTasksByTopic('OBS-SCI').length, 10);
  assert.equal(EGE.getPublishedPracticums('OBS-SCI').length, 0);
  assert.ok(!ids(EGE.getAvailableTopics('OBS')).includes('OBS-SCI'));
});

test('задание входит не больше чем в один действующий практикум; ID заданий и практикумов не повторяются', () => {
  const owner = new Map();
  // Прежний набор (retired) намеренно повторяет задания действующих практикумов.
  for (const p of EGE.practicums.filter((x) => x.status !== 'retired')) {
    for (const id of p.taskIds) {
      assert.ok(!owner.has(id), `${id}: и в ${owner.get(id)}, и в ${p.id}`);
      owner.set(id, p.id);
    }
  }
  const taskIds = EGE.tasks.map((t) => t.id);
  assert.equal(new Set(taskIds).size, taskIds.length);
});

/* ---------- Видимость для ученика ---------- */

test('ученик видит только темы и разделы с опубликованными практикумами', () => {
  assert.deepEqual(ids(EGE.getAvailableTopics('OBS')), ['OBS-ACT', 'OBS-COG', 'OBS-SCK', 'OBS-SYS']);
  assert.deepEqual(ids(EGE.getAvailableTopics('SOC')), ['SOC-FAM']);
  for (const section of ['ECO', 'POL', 'LAW']) assert.deepEqual(ids(EGE.getAvailableTopics(section)), [], section);
  assert.deepEqual(ids(EGE.getAvailableSections()), ['OBS', 'SOC']);
  // Темы с заданиями, но без практикума, скрыты.
  assert.ok(EGE.getTasksByTopic('SOC-STR').length > 0);
  assert.ok(!ids(EGE.getAvailableTopics('SOC')).includes('SOC-STR'));
});

test('черновик и практикум со снятым с выдачи заданием не показываются; пустых практикумов нет', () => {
  const T = loadTasksOnly();
  T.addPracticums([
    { id: 'SOC-STR-P01', topic: 'SOC-STR', number: 1, status: 'draft', taskIds: ['SOC-STR-001', 'SOC-STR-002'] },
    { id: 'SOC-STR-P02', topic: 'SOC-STR', number: 2, status: 'published', taskIds: ['SOC-STR-003'] },
    { id: 'SOC-MOB-P01', topic: 'SOC-MOB', number: 1, status: 'published', taskIds: ['SOC-MOB-001'] }
  ]);
  assert.deepEqual(ids(T.getPracticumsByTopic('SOC-STR')), ['SOC-STR-P01', 'SOC-STR-P02']);
  assert.deepEqual(ids(T.getPublishedPracticums('SOC-STR')), ['SOC-STR-P02']);
  assert.deepEqual(ids(T.getAvailableTopics('SOC')), ['SOC-STR', 'SOC-MOB']);
  T.getTask('SOC-MOB-001').retired = true;
  assert.deepEqual(ids(T.getPublishedPracticums('SOC-MOB')), [], 'снятое задание — практикум недоступен');
  assert.deepEqual(ids(T.getAvailableTopics('SOC')), ['SOC-STR']);
  assert.throws(() => T.addPracticums([{ id: 'SOC-GRP-P01', topic: 'SOC-GRP', number: 1, status: 'published', taskIds: [] }]),
    /нет заданий/);
});

test('практикумы темы упорядочены по номеру', () => {
  const T = loadTasksOnly();
  T.addPracticums([
    { id: 'SOC-STR-P02', topic: 'SOC-STR', number: 2, status: 'published', taskIds: ['SOC-STR-003'] },
    { id: 'SOC-STR-P01', topic: 'SOC-STR', number: 1, status: 'published', taskIds: ['SOC-STR-001'] }
  ]);
  assert.deepEqual(Array.from(T.getPublishedPracticums('SOC-STR'), T.practicumTitle), ['Практикум № 1', 'Практикум № 2']);
});

test('реестр отклоняет некорректные практикумы', () => {
  const T = loadTasksOnly();
  const ok = { id: 'SOC-STR-P01', topic: 'SOC-STR', number: 1, status: 'published', taskIds: ['SOC-STR-001'] };
  const bad = (patch) => () => T.addPracticums([Object.assign({}, ok, patch)]);
  assert.throws(bad({ id: 'SOC-STR-1' }), /Некорректный id практикума/);
  assert.throws(bad({ id: 'SOC-STR-001' }), /Некорректный id практикума/);
  assert.throws(bad({ topic: 'SOC-XXX', id: 'SOC-XXX-P01' }), /Неизвестная тема/);
  assert.throws(bad({ number: 2 }), /Номер практикума не совпадает/);
  // Практикум в «Общих вопросах» отклоняется, даже если задания из этой темы.
  assert.throws(() => T.addPracticums([{ id: 'ECO-GEN-P01', topic: 'ECO-GEN', number: 1, status: 'published', taskIds: ['ECO-GEN-001'] }]),
    /Общих вопросах/);
  assert.throws(bad({ status: 'ready' }), /Неизвестный статус/);
  // Прежний набор: id с R, обязательное название; у обычного практикума названия нет.
  assert.throws(bad({ status: 'retired', title: 'Прежний набор' }), /Номер практикума не совпадает/);
  assert.throws(bad({ id: 'SOC-STR-R01', status: 'retired' }), /нет названия/);
  assert.throws(bad({ id: 'SOC-STR-R01', status: 'published' }), /Номер практикума не совпадает/);
  assert.throws(bad({ title: 'Особый практикум' }), /только «Практикум № N»/);
  assert.throws(bad({ taskIds: ['SOC-STR-001', 'SOC-STR-001'] }), /повторяются/);
  assert.throws(bad({ taskIds: ['SOC-STR-999'] }), /Неизвестное задание/);
  assert.throws(bad({ taskIds: ['SOC-MOB-001'] }), /не из темы/);
  T.addPracticums([ok]);
  assert.throws(() => T.addPracticums([ok]), /Повторяющийся id практикума/);
  assert.throws(() => T.addPracticums([Object.assign({}, ok, { id: 'SOC-STR-P02', number: 2, legacyTopicAttempts: true }),
    Object.assign({}, ok, { id: 'SOC-STR-P03', number: 3, legacyTopicAttempts: true })]), /legacyTopicAttempts/);
});

test('реестр практикумов подключён после всех заданий и до интерфейса', () => {
  const at = (s) => scripts.indexOf(s);
  assert.ok(at('data/practicums.js') > 0);
  for (const s of scripts.filter((x) => x.startsWith('data/tasks/'))) assert.ok(at(s) < at('data/practicums.js'), s);
  assert.ok(at('data/practicums.js') < at('js/app.js'));
});

test('«Научное познание»: два самостоятельных практикума из всех 50 заданий, без повторов', () => {
  const p1 = EGE.getPracticum('OBS-SCK-P01');
  const p2 = EGE.getPracticum('OBS-SCK-P02');
  assert.equal(p1.taskIds.length, 25);
  assert.equal(p2.taskIds.length, 25);
  assert.ok(p1.taskIds.every((id) => !p2.taskIds.includes(id)), 'задания не повторяются');
  const all = Array.from({ length: 50 }, (_, i) => 'OBS-SCK-' + String(i + 1).padStart(3, '0'));
  assert.deepEqual([...p1.taskIds, ...p2.taskIds].sort(), all, 'все 50 заданий документа');
  assert.deepEqual([...ids(EGE.getTasksByTopic('OBS-SCK'))].sort(), all);
  // Близкие по содержанию задания — в разных практикумах.
  const where = (n) => (p1.taskIds.includes('OBS-SCK-' + String(n).padStart(3, '0')) ? 1 : 2);
  for (const [a, b] of [[32, 33], [19, 20], [24, 25], [28, 29], [21, 26], [22, 23], [30, 43], [31, 44], [41, 42], [42, 45], [7, 14], [5, 13], [9, 46], [3, 37], [2, 34], [47, 50], [39, 44]]) {
    assert.notEqual(where(a), where(b), `задания ${a} и ${b} — в разных практикумах`);
  }
  // Все четыре формата части 1 (позиции КИМ 1–4), все уровни сложности, без длинных серий одного формата.
  for (const [p, kim] of [[p1, { 1: 3, 2: 9, 3: 8, 4: 5 }], [p2, { 1: 2, 2: 10, 3: 9, 4: 4 }]]) {
    const tasks = EGE.getPracticumTasks(p);
    const count = {};
    for (const t of tasks) count[t.kimTask] = (count[t.kimTask] || 0) + 1;
    assert.deepEqual(count, kim, p.id);
    assert.deepEqual([...new Set(tasks.map((t) => t.difficulty))].sort(), [1, 2, 3], `${p.id}: сложность 1–3`);
    tasks.forEach((t, i) => {
      if (i < 2) return;
      assert.ok(!(t.kimTask === tasks[i - 1].kimTask && t.kimTask === tasks[i - 2].kimTask), `${p.id}: три задания одного формата подряд (${t.id})`);
    });
    assert.ok(!p.shuffle, `${p.id}: порядок постоянный`);
  }
  assert.deepEqual(ids(EGE.getPublishedPracticums('OBS-SCK')), ['OBS-SCK-P01', 'OBS-SCK-P02']);
});
