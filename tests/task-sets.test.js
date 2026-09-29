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

test('«Познание»: один набор «Тренажёр 1» (OBS-COG-T1) — все 18 заданий в исходном порядке', () => {
  const EGE = loadBank();
  const sets = EGE.getAvailableSets('OBS-COG');
  assert.deepEqual(ids(sets), ['OBS-COG-T1']);
  assert.equal(sets[0].title, 'Тренажёр 1');
  const expected = Array.from({ length: 18 }, (_, i) => 'OBS-COG-' + String(i + 1).padStart(3, '0'));
  assert.deepEqual(ids(EGE.getTasksBySet('OBS-COG-T1')), expected);
  assert.deepEqual(ids(EGE.getPool('OBS', 'OBS-COG', 'OBS-COG-T1')), expected);
  assert.deepEqual(ids(EGE.getPool('OBS', 'OBS-COG')), expected, 'без выбора набора — вся тема');
});

test('«Познание», «Тренажёр 1»: все 18 заданий верно — 35 баллов из 35', () => {
  const EGE = loadBank();
  const A = EGE.attempt;
  const tasks = EGE.getPool('OBS', 'OBS-COG', 'OBS-COG-T1');
  const a = A.createAttempt({
    settings: { section: 'OBS', topic: 'OBS-COG', set: 'OBS-COG-T1' },
    taskIds: ids(tasks)
  });
  for (const task of tasks) A.recordAnswer(a, task, [...EGE.scoring.getCorrect(task)]);
  assert.equal(A.totalScore(a), 35);
  assert.equal(A.maxScore(a), 35);
  assert.deepEqual({ ...a.settings }, { section: 'OBS', topic: 'OBS-COG', set: 'OBS-COG-T1' }, 'попытка помнит тренажёр');
});

test('темы с одним набором (addTasks) — набор по умолчанию «Тренажёр 1»; «Деятельность» — 16 заданий', () => {
  const EGE = loadBank();
  for (const topicId of ['OBS-GEN', 'OBS-ACT', 'ECO-GEN', 'SOC-STR', 'POL-GEN', 'LAW-GEN']) {
    const sets = EGE.getAvailableSets(topicId);
    assert.deepEqual(ids(sets), [topicId + '-T1'], topicId);
    assert.equal(sets[0].title, 'Тренажёр 1');
    assert.deepEqual(ids(EGE.getPool('X', topicId, topicId + '-T1')), ids(EGE.getTasksByTopic(topicId)));
  }
  assert.equal(EGE.getTasksBySet('OBS-ACT-T1').length, 16);
  assert.equal(EGE.getPool('OBS', 'OBS-ACT').length, 16);
  assert.equal(EGE.getTasksBySection('OBS').length, 37);
});

test('второй набор темы: появляется в выборе, считается в теме и разделе один раз, пулы раздельны', () => {
  const EGE = loadBank();
  const sectionBefore = EGE.getTasksBySection('OBS').length;
  const allBefore = EGE.getTasksBySection('all').length;

  const set = EGE.addTaskSet('OBS-COG', {
    id: 'OBS-COG-T2',
    title: 'Тренажёр 2',
    tasks: [sampleTask('OBS-COG-901'), sampleTask('OBS-COG-902')]
  });
  assert.equal(set.title, 'Тренажёр 2');

  assert.deepEqual(ids(EGE.getAvailableSets('OBS-COG')), ['OBS-COG-T1', 'OBS-COG-T2'], 'порядок — порядок регистрации');
  assert.equal(EGE.getTasksBySet('OBS-COG-T1').length, 18, 'первый набор не изменился');
  assert.deepEqual(ids(EGE.getPool('OBS', 'OBS-COG', 'OBS-COG-T2')), ['OBS-COG-901', 'OBS-COG-902']);
  assert.ok(EGE.getPool('OBS', 'OBS-COG', 'OBS-COG-T1').every((t) => t.set === 'OBS-COG-T1'));

  assert.equal(EGE.getTasksByTopic('OBS-COG').length, 20);
  assert.equal(EGE.getTasksBySection('OBS').length, sectionBefore + 2);
  assert.equal(EGE.getTasksBySection('all').length, allBefore + 2);
  assert.equal(EGE.getTask('OBS-COG-901').set, 'OBS-COG-T2');

  // Набор другой темы в пул не попадает.
  assert.deepEqual(ids(EGE.getPool('OBS', 'OBS-ACT', 'OBS-COG-T2')), []);

  // Проверка и баллы — общие: второй набор — самостоятельная тренировка со своим результатом.
  const A = EGE.attempt;
  const tasks = EGE.getPool('OBS', 'OBS-COG', 'OBS-COG-T2');
  const a = A.createAttempt({ settings: { section: 'OBS', topic: 'OBS-COG', set: 'OBS-COG-T2' }, taskIds: ids(tasks) });
  assert.equal(A.recordAnswer(a, tasks[0], [1, 3]).points, 2);
  assert.equal(A.recordAnswer(a, tasks[1], [1]).points, 1);
  assert.equal(A.totalScore(a), 3);
  assert.equal(A.maxScore(a), 4);
  assert.equal(a.settings.set, 'OBS-COG-T2');
});

test('выбор тренажёра: у тем из addTaskSet — даже при одном наборе, у тем из addTasks — нет', () => {
  const EGE = loadBank();
  assert.equal(EGE.getSet('OBS-COG-T1').explicit, true, '«Познание» объявлено через addTaskSet');
  assert.equal(EGE.showsSetChoice('OBS-COG'), true, '«Познание»: «Тренажёр 1» показывается');
  for (const topicId of ['OBS-GEN', 'OBS-ACT', 'ECO-GEN', 'SOC-STR', 'SOC-MOB', 'SOC-FAM', 'POL-GEN', 'LAW-GEN']) {
    assert.equal(EGE.getSet(topicId + '-T1').explicit, false, topicId);
    assert.equal(EGE.showsSetChoice(topicId), false, `${topicId}: без выбора тренажёра`);
  }
  // Тема без заданий и несуществующая тема — без выбора.
  assert.equal(EGE.showsSetChoice('SOC-GRP'), false);
  assert.equal(EGE.showsSetChoice('OBS-XXX'), false);
});

test('выбор тренажёра: второй набор добавляет карточку; тема из addTasks получает выбор со вторым набором', () => {
  const EGE = loadBank();
  EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T2', title: 'Тренажёр 2', tasks: [sampleTask('OBS-COG-901')] });
  assert.equal(EGE.showsSetChoice('OBS-COG'), true);
  assert.deepEqual(ids(EGE.getAvailableSets('OBS-COG')), ['OBS-COG-T1', 'OBS-COG-T2']);

  // «Деятельность» остаётся без выбора, пока у неё один неявный набор…
  assert.equal(EGE.showsSetChoice('OBS-ACT'), false);
  EGE.addTasks('OBS-ACT', [sampleTask('OBS-ACT-901')]);
  assert.equal(EGE.showsSetChoice('OBS-ACT'), false, 'addTasks не делает набор явным');
  // …а со вторым набором выбор появляется.
  EGE.addTaskSet('OBS-ACT', { id: 'OBS-ACT-T2', title: 'Тренажёр 2', tasks: [sampleTask('OBS-ACT-902')] });
  assert.equal(EGE.showsSetChoice('OBS-ACT'), true);
  assert.deepEqual(ids(EGE.getAvailableSets('OBS-ACT')), ['OBS-ACT-T1', 'OBS-ACT-T2']);
  assert.equal(EGE.getSet('OBS-ACT-T1').explicit, false);
});

test('выбор тренажёра: пустой явный набор выбор не включает', () => {
  const EGE = loadBank();
  EGE.addTaskSet('OBS-ACT', { id: 'OBS-ACT-T2', title: 'Тренажёр 2', tasks: [] });
  assert.equal(EGE.showsSetChoice('OBS-ACT'), false, '«Деятельность» выглядит как раньше');
  assert.deepEqual(ids(EGE.getAvailableSets('OBS-ACT')), ['OBS-ACT-T1'], 'пустой набор не показывается');
});

test('пустой набор и набор только из снятых заданий не показываются', () => {
  const EGE = loadBank();
  EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T2', title: 'Тренажёр 2', tasks: [] });
  EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T3', title: 'Тренажёр 3', tasks: [{ ...sampleTask('OBS-COG-903'), retired: true }] });
  assert.deepEqual(ids(EGE.getAvailableSets('OBS-COG')), ['OBS-COG-T1']);
  assert.equal(EGE.getTasksByTopic('OBS-COG').length, 18);
  assert.equal(EGE.getTasksBySection('OBS').length, 37);
});

test('набор можно дополнять повторным вызовом; addTasks дописывает в «Тренажёр 1»', () => {
  const EGE = loadBank();
  EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T2', title: 'Тренажёр 2', tasks: [sampleTask('OBS-COG-901')] });
  EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T2', tasks: [sampleTask('OBS-COG-902')] });
  assert.deepEqual(ids(EGE.getTasksBySet('OBS-COG-T2')), ['OBS-COG-901', 'OBS-COG-902']);

  EGE.addTasks('OBS-COG', [sampleTask('OBS-COG-904')]);
  assert.equal(EGE.getTask('OBS-COG-904').set, 'OBS-COG-T1');
  assert.equal(EGE.getTasksBySet('OBS-COG-T1').length, 19);
  assert.equal(EGE.getSet('OBS-COG-T1').title, 'Тренажёр 1');
});

test('некорректные наборы отклоняются', () => {
  const EGE = loadBank();
  assert.throws(() => EGE.addTaskSet('OBS-XXX', { id: 'OBS-XXX-T1', title: 't', tasks: [] }), /Неизвестная тема/);
  assert.throws(() => EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-2', title: 't', tasks: [] }), /Некорректный id набора/);
  assert.throws(() => EGE.addTaskSet('OBS-COG', { id: 'OBS-ACT-T2', title: 't', tasks: [] }), /Некорректный id набора/);
  assert.throws(() => EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T2', tasks: [] }), /нет названия/);
  assert.throws(() => EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T1', title: 'Другое', tasks: [] }), /уже зарегистрирован/);
  // id задания уникален во всём банке, в том числе между наборами.
  assert.throws(() => EGE.addTaskSet('OBS-COG', { id: 'OBS-COG-T2', title: 'Тренажёр 2', tasks: [sampleTask('OBS-COG-001')] }),
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
  assert.doesNotMatch(appCode, /OBS-COG|Познание/, 'в интерфейсе нет логики для конкретной темы');
});
