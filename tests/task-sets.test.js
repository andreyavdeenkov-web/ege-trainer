'use strict';

/**
 * Наборы заданий (тренажёры) внутри темы: раздел → тема → наборы → задания.
 * Банк загружается так же, как в браузере (в порядке <script> из index.html).
 * Второй набор в тестах — тестовый: он добавляется в загруженный банк
 * и в данные проекта не попадает.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

function loadBank() {
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of scripts.filter((s) => s !== 'js/app.js' && s !== 'js/task-view.js')) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

/** Тестовое задание с выбором суждений; ключ — 1 и 3. */
function sampleTask(id) {
  return {
    id,
    question: 'Выберите верные суждения (тестовое задание).',
    statements: [
      { text: 'первое', correct: true },
      { text: 'второе', correct: false },
      { text: 'третье', correct: true }
    ]
  };
}

const ids = (list) => [...list.map((x) => x.id)];

test('у каждой темы с заданиями есть наборы; каждое задание — ровно в одном наборе своей темы', () => {
  const EGE = loadBank();
  const seen = new Set();
  for (const section of EGE.sections) {
    for (const topic of section.topics) {
      for (const set of topic.sets) {
        assert.match(set.id, EGE.SET_ID_PATTERN, `${set.id}: формат id набора`);
        assert.ok(set.id.startsWith(topic.id + '-T'), `${set.id}: набор не из темы ${topic.id}`);
        assert.ok(set.title && set.title.trim(), `${set.id}: нет названия`);
        assert.equal(set.topic, topic.id);
        assert.equal(EGE.getSet(set.id), set);
        for (const task of set.tasks) {
          assert.ok(!seen.has(task.id), `${task.id}: задание в нескольких наборах`);
          seen.add(task.id);
          assert.equal(task.set, set.id, `${task.id}: поле set`);
          assert.equal(task.topic, topic.id, `${task.id}: набор и задание из разных тем`);
        }
      }
      // Задания темы — это ровно задания её наборов, в том же порядке.
      const fromSets = topic.sets.flatMap((s) => EGE.getTasksBySet(s.id));
      assert.deepEqual(ids(fromSets), ids(EGE.getTasksByTopic(topic.id)), `${topic.id}: задания темы = задания наборов`);
    }
  }
  assert.equal(seen.size, EGE.tasks.length, 'все задания банка лежат в наборах');
});

test('счётчики: тема = сумма её наборов, раздел = сумма тем, «Все разделы» — без двойного подсчёта', () => {
  const EGE = loadBank();
  let total = 0;
  for (const section of EGE.sections) {
    let sectionSum = 0;
    for (const topic of section.topics) {
      const setsSum = EGE.getAvailableSets(topic.id).reduce((n, s) => n + EGE.getTasksBySet(s.id).length, 0);
      assert.equal(EGE.getTasksByTopic(topic.id).length, setsSum, topic.id);
      sectionSum += setsSum;
    }
    assert.equal(EGE.getTasksBySection(section.id).length, sectionSum, section.id);
    total += sectionSum;
  }
  const all = EGE.getTasksBySection('all');
  assert.equal(all.length, total);
  assert.equal(new Set(ids(all)).size, all.length, 'задания не повторяются');
});

test('«Человек и общество»: только содержательные темы, у каждой — явные тренажёры', () => {
  const EGE = loadBank();
  assert.equal(EGE.getTopic('OBS-GEN'), null, '«Общие вопросы» удалены');
  assert.deepEqual(ids(EGE.getSection('OBS').topics), ['OBS-SOC', 'OBS-ACT', 'OBS-COG']);
  assert.deepEqual(ids(EGE.getAvailableTopics('OBS')), ['OBS-SOC', 'OBS-ACT', 'OBS-COG']);
  const sets = (topicId) => [...EGE.getAvailableSets(topicId).map((s) => s.title + ' — ' + EGE.getTasksBySet(s.id).length)];
  assert.deepEqual(sets('OBS-SOC'), ['Тренажёр 1 — 1']);
  assert.deepEqual(sets('OBS-ACT'), ['Тренажёр 1 — 17']);
  assert.deepEqual(sets('OBS-COG'), ['Тренажёр 1 — 20', 'Тренажёр 2 — 1']);
  for (const topicId of ['OBS-SOC', 'OBS-ACT', 'OBS-COG']) {
    assert.ok(EGE.getSection('OBS').topics.find((t) => t.id === topicId).sets.every((s) => s.explicit), `${topicId}: наборы явные`);
    assert.equal(EGE.showsSetChoice(topicId), true, `${topicId}: блок «Тренажёр» показывается`);
  }
  assert.equal(EGE.getTasksBySection('OBS').length, 39, '1 + 17 + 21');
  assert.equal(EGE.getTasksBySection('all').length, 56, 'общее число заданий не изменилось');
});

test('перенесённые из «Общих вопросов» задания: новые ID, темы и наборы, прежние ключи', () => {
  const EGE = loadBank();
  const moved = {
    'OBS-SOC-001': ['OBS-SOC', 'OBS-SOC-T1', [1, 4, 5], 'Выберите верные суждения об обществе и его сферах.'],
    'OBS-ACT-017': ['OBS-ACT', 'OBS-ACT-T1', [2, 3, 5], 'Выберите верные суждения о деятельности человека.'],
    'OBS-COG-021': ['OBS-COG', 'OBS-COG-T2', [2, 4, 5], 'Выберите верные суждения о познании и истине.']
  };
  for (const [id, [topic, set, key, question]] of Object.entries(moved)) {
    const task = EGE.getTask(id);
    assert.ok(task, `${id} есть в банке`);
    assert.equal(task.topic, topic);
    assert.equal(task.set, set);
    assert.equal(task.question, question);
    assert.equal(task.statements.length, 5);
    assert.ok(task.statements.every((st) => st.explanation), `${id}: объяснения на месте`);
    assert.deepEqual([...EGE.scoring.getCorrect(task)], key, `${id}: ключ`);
  }
  for (const old of ['OBS-GEN-001', 'OBS-GEN-002', 'OBS-GEN-003']) assert.equal(EGE.getTask(old), null, `${old} больше не используется`);
  // «Деятельность»: 16 прежних заданий по порядку, перенесённое — 17-м.
  const act = Array.from({ length: 17 }, (_, i) => 'OBS-ACT-' + String(i + 1).padStart(3, '0'));
  assert.deepEqual(ids(EGE.getTasksBySet('OBS-ACT-T1')), act);
  assert.deepEqual(ids(EGE.getTasksBySet('OBS-COG-T2')), ['OBS-COG-021']);
  assert.deepEqual(ids(EGE.getTasksBySet('OBS-SOC-T1')), ['OBS-SOC-001']);
});

test('«Познание», «Тренажёр 1» (OBS-COG-T1) — прежние 20 заданий в исходном порядке', () => {
  const EGE = loadBank();
  const expected = Array.from({ length: 20 }, (_, i) => 'OBS-COG-' + String(i + 1).padStart(3, '0'));
  assert.equal(EGE.getSet('OBS-COG-T1').title, 'Тренажёр 1');
  assert.deepEqual(ids(EGE.getTasksBySet('OBS-COG-T1')), expected);
  assert.deepEqual(ids(EGE.getPool('OBS', 'OBS-COG', 'OBS-COG-T1')), expected);
  assert.deepEqual(ids(EGE.getPool('OBS', 'OBS-COG', 'OBS-COG-T2')), ['OBS-COG-021']);
  assert.deepEqual(ids(EGE.getPool('OBS', 'OBS-COG')), [...expected, 'OBS-COG-021'], 'без выбора набора — вся тема');
});

test('каждый тренажёр — отдельная тренировка: максимумы наборов «Человека и общества»', () => {
  const EGE = loadBank();
  const A = EGE.attempt;
  const expected = { 'OBS-SOC-T1': 2, 'OBS-ACT-T1': 33, 'OBS-COG-T1': 39, 'OBS-COG-T2': 2 };
  for (const [setId, max] of Object.entries(expected)) {
    const set = EGE.getSet(setId);
    const tasks = EGE.getPool('OBS', set.topic, setId);
    const a = A.createAttempt({ settings: { section: 'OBS', topic: set.topic, set: setId }, taskIds: ids(tasks) });
    for (const task of tasks) A.recordAnswer(a, task, [...EGE.scoring.getCorrect(task)]);
    assert.equal(A.totalScore(a), max, setId);
    assert.equal(A.maxScore(a), max, setId);
    assert.equal(a.settings.set, setId, 'попытка помнит тренажёр');
  }
});

test('темы других разделов (addTasks) — неявный «Тренажёр 1», без выбора тренажёра', () => {
  const EGE = loadBank();
  for (const topicId of ['ECO-GEN', 'SOC-STR', 'SOC-MOB', 'SOC-FAM', 'POL-GEN', 'LAW-GEN']) {
    const sets = EGE.getAvailableSets(topicId);
    assert.deepEqual(ids(sets), [topicId + '-T1'], topicId);
    assert.equal(sets[0].title, 'Тренажёр 1');
    assert.equal(sets[0].explicit, false, topicId);
    assert.equal(EGE.showsSetChoice(topicId), false, `${topicId}: без выбора тренажёра`);
    assert.deepEqual(ids(EGE.getPool('X', topicId, topicId + '-T1')), ids(EGE.getTasksByTopic(topicId)));
  }
  // Тема без заданий и несуществующая тема — без выбора.
  assert.equal(EGE.showsSetChoice('SOC-GRP'), false);
  assert.equal(EGE.showsSetChoice('OBS-XXX'), false);
});

test('новый набор темы: появляется в выборе, считается в теме и разделе один раз, пулы раздельны', () => {
  const EGE = loadBank();
  const sectionBefore = EGE.getTasksBySection('OBS').length;
  const allBefore = EGE.getTasksBySection('all').length;

  const set = EGE.addTaskSet('OBS-SOC', {
    id: 'OBS-SOC-T2',
    title: 'Тренажёр 2',
    tasks: [sampleTask('OBS-SOC-901'), sampleTask('OBS-SOC-902')]
  });
  assert.equal(set.title, 'Тренажёр 2');

  assert.deepEqual(ids(EGE.getAvailableSets('OBS-SOC')), ['OBS-SOC-T1', 'OBS-SOC-T2'], 'порядок — порядок регистрации');
  assert.equal(EGE.getTasksBySet('OBS-SOC-T1').length, 1, 'первый набор не изменился');
  assert.deepEqual(ids(EGE.getPool('OBS', 'OBS-SOC', 'OBS-SOC-T2')), ['OBS-SOC-901', 'OBS-SOC-902']);
  assert.equal(EGE.getTasksByTopic('OBS-SOC').length, 3);
  assert.equal(EGE.getTasksBySection('OBS').length, sectionBefore + 2);
  assert.equal(EGE.getTasksBySection('all').length, allBefore + 2);

  // Набор другой темы в пул не попадает.
  assert.deepEqual(ids(EGE.getPool('OBS', 'OBS-ACT', 'OBS-SOC-T2')), []);

  // Проверка и баллы — общие: новый набор — самостоятельная тренировка со своим результатом.
  const A = EGE.attempt;
  const tasks = EGE.getPool('OBS', 'OBS-SOC', 'OBS-SOC-T2');
  const a = A.createAttempt({ settings: { section: 'OBS', topic: 'OBS-SOC', set: 'OBS-SOC-T2' }, taskIds: ids(tasks) });
  assert.equal(A.recordAnswer(a, tasks[0], [1, 3]).points, 2);
  assert.equal(A.recordAnswer(a, tasks[1], [1]).points, 1);
  assert.equal(A.totalScore(a), 3);
  assert.equal(A.maxScore(a), 4);
});

test('выбор тренажёра у темы из addTasks: только со вторым непустым набором', () => {
  const EGE = loadBank();
  EGE.addTasks('ECO-GEN', [sampleTask('ECO-GEN-901')]);
  assert.equal(EGE.showsSetChoice('ECO-GEN'), false, 'addTasks не делает набор явным');
  EGE.addTaskSet('ECO-GEN', { id: 'ECO-GEN-T2', title: 'Тренажёр 2', tasks: [] });
  assert.equal(EGE.showsSetChoice('ECO-GEN'), false, 'пустой явный набор выбор не включает');
  assert.deepEqual(ids(EGE.getAvailableSets('ECO-GEN')), ['ECO-GEN-T1'], 'пустой набор не показывается');
  EGE.addTaskSet('ECO-GEN', { id: 'ECO-GEN-T2', tasks: [sampleTask('ECO-GEN-902')] });
  assert.equal(EGE.showsSetChoice('ECO-GEN'), true);
  assert.deepEqual(ids(EGE.getAvailableSets('ECO-GEN')), ['ECO-GEN-T1', 'ECO-GEN-T2']);
  assert.equal(EGE.getSet('ECO-GEN-T1').explicit, false);
});

test('набор из одних снятых заданий не показывается и не считается', () => {
  const EGE = loadBank();
  EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T3', title: 'Тренажёр 3', tasks: [{ ...sampleTask('OBS-COG-903'), retired: true }] });
  assert.deepEqual(ids(EGE.getAvailableSets('OBS-COG')), ['OBS-COG-T1', 'OBS-COG-T2']);
  assert.equal(EGE.getTasksByTopic('OBS-COG').length, 21);
  assert.equal(EGE.getTasksBySection('OBS').length, 39);
});

test('набор можно дополнять повторным вызовом; addTasks дописывает в «Тренажёр 1»', () => {
  const EGE = loadBank();
  EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T3', title: 'Тренажёр 3', tasks: [sampleTask('OBS-COG-901')] });
  EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T3', tasks: [sampleTask('OBS-COG-902')] });
  assert.deepEqual(ids(EGE.getTasksBySet('OBS-COG-T3')), ['OBS-COG-901', 'OBS-COG-902']);

  EGE.addTasks('OBS-COG', [sampleTask('OBS-COG-904')]);
  assert.equal(EGE.getTask('OBS-COG-904').set, 'OBS-COG-T1');
  assert.equal(EGE.getTasksBySet('OBS-COG-T1').length, 21);
  assert.equal(EGE.getSet('OBS-COG-T1').title, 'Тренажёр 1');
  assert.equal(EGE.getSet('OBS-COG-T1').explicit, true, 'явный набор остаётся явным');
});

test('некорректные наборы отклоняются', () => {
  const EGE = loadBank();
  assert.throws(() => EGE.addTaskSet('OBS-XXX', { id: 'OBS-XXX-T1', title: 't', tasks: [] }), /Неизвестная тема/);
  assert.throws(() => EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-2', title: 't', tasks: [] }), /Некорректный id набора/);
  assert.throws(() => EGE.addTaskSet('OBS-COG', { id: 'OBS-ACT-T2', title: 't', tasks: [] }), /Некорректный id набора/);
  assert.throws(() => EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T3', tasks: [] }), /нет названия/);
  assert.throws(() => EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T1', title: 'Другое', tasks: [] }), /уже зарегистрирован/);
  // id задания уникален во всём банке, в том числе между наборами.
  assert.throws(() => EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T3', title: 'Тренажёр 3', tasks: [sampleTask('OBS-COG-001')] }),
    /Повторяющийся id/);
});

test('попытка: набор записывается, только если выбрана тема', () => {
  const EGE = loadBank();
  const A = EGE.attempt;
  const one = ['OBS-COG-001'];
  assert.deepEqual({ ...A.createAttempt({ settings: { section: 'OBS', topic: 'all', set: 'all' }, taskIds: one }).settings },
    { section: 'OBS', topic: 'all' });
  assert.deepEqual({ ...A.createAttempt({ settings: { section: 'OBS', topic: 'OBS-COG', set: 'OBS-COG-T1' }, taskIds: one }).settings },
    { section: 'OBS', topic: 'OBS-COG', set: 'OBS-COG-T1' });
});

test('интерфейс: выбор тренажёра — общий для всех тем, по EGE.showsSetChoice', () => {
  const appCode = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(html, /id="set-field" hidden/);
  assert.match(html, /id="set-options"/);
  assert.match(appCode, /EGE\.showsSetChoice\(settings\.topic\)/);
  assert.match(appCode, /ui\.setField\.hidden = !show;/);
  assert.match(appCode, /EGE\.getPool\(settings\.section, settings\.topic, settings\.set\)/);
  assert.doesNotMatch(appCode, /OBS-|Познание|Деятельность|Общество/, 'в интерфейсе нет логики для конкретной темы');
});

test('интерфейс: в блоке «Тема» нет «Весь раздел», при выборе раздела выбирается его первая тема', () => {
  const appCode = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.doesNotMatch(appCode, /optionCard\('topic', 'all'/, 'карточки «Весь раздел» нет');
  assert.match(appCode, /function resolveTopic\(sectionId, topicId\)/);
  assert.match(appCode, /settings\.topic = resolveTopic\(section, null\);/);
  // Пул всего раздела в реестре сохранён — для будущих обобщающих тренажёров.
  const EGE = loadBank();
  assert.equal(EGE.getPool('OBS', 'all').length, 39);
});
