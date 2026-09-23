'use strict';

/**
 * Проверка банка заданий: загружает файлы так же, как браузер
 * (в порядке <script> из index.html), и валидирует каждое задание.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const dataScripts = scripts.filter((s) => s.startsWith('data/tasks/'));

function loadBank() {
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of ['js/registry.js', 'js/scoring.js', 'js/attempt.js', ...dataScripts]) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('все файлы из data/tasks подключены в index.html', () => {
  const files = listJsFiles(path.join(root, 'data/tasks'))
    .map((f) => path.relative(root, f).split(path.sep).join('/'));
  assert.ok(files.length > 0);
  for (const f of files) {
    assert.ok(dataScripts.includes(f), `Файл ${f} не подключён в index.html`);
  }
  for (const s of scripts) {
    assert.ok(fs.existsSync(path.join(root, s)), `Скрипт ${s} из index.html не найден`);
  }
});

test('структура разделов и тем корректна', () => {
  const EGE = loadBank();
  const sectionIds = new Set();
  const topicIds = new Set();
  for (const section of EGE.sections) {
    assert.match(section.id, /^[A-Z]{3}$/, `Раздел ${section.id}: некорректный id`);
    assert.ok(!sectionIds.has(section.id), `Повторяющийся раздел ${section.id}`);
    sectionIds.add(section.id);
    assert.ok(section.title && section.color, `Раздел ${section.id}: нет названия или цвета`);
    assert.ok(section.topics.length > 0, `Раздел ${section.id}: нет тем`);
    for (const topic of section.topics) {
      assert.match(topic.id, EGE.TOPIC_ID_PATTERN);
      assert.ok(topic.id.startsWith(section.id + '-'), `Тема ${topic.id} не относится к разделу ${section.id}`);
      assert.ok(!topicIds.has(topic.id), `Повторяющаяся тема ${topic.id}`);
      topicIds.add(topic.id);
      assert.equal(topic.section, section.id);
      assert.ok(topic.title, `Тема ${topic.id}: нет названия`);
    }
  }
});

test('темы раздела «Социальные отношения»', () => {
  const EGE = loadBank();
  assert.deepEqual([...EGE.getSection('SOC').topics.map((t) => t.title)], [
    'Социальная стратификация',
    'Социальная мобильность',
    'Социальные группы',
    'Молодёжь как социальная группа',
    'Этнические общности',
    'Социальный конфликт',
    'Социальный контроль',
    'Семья и брак'
  ]);
});

test('банк заданий корректен', () => {
  const EGE = loadBank();
  assert.ok(EGE.tasks.length > 0, 'Нет ни одного задания');
  const ids = new Set();

  for (const task of EGE.tasks) {
    const where = `Задание ${task.id}`;
    assert.match(task.id, EGE.TASK_ID_PATTERN, `${where}: id должен иметь вид SOC-STR-001`);
    assert.ok(!ids.has(task.id), `${where}: повторяющийся id`);
    ids.add(task.id);
    assert.equal(EGE.getTask(task.id), task);
    assert.ok(EGE.getTopic(task.topic), `${where}: неизвестная тема`);
    assert.equal(EGE.getTopic(task.topic).section, task.section, `${where}: тема не из своего раздела`);
    if (task.version !== undefined) {
      assert.ok(Number.isInteger(task.version) && task.version >= 1, `${where}: version — целое число от 1`);
    }
    if (task.retired !== undefined) assert.equal(typeof task.retired, 'boolean', `${where}: retired — true/false`);

    assert.equal(typeof task.question, 'string', `${where}: нет вопроса`);
    assert.ok(task.question.trim().length > 0, `${where}: пустой вопрос`);
    const type = EGE.scoring.getTaskType(task);
    assert.ok(EGE.scoring.TYPES.includes(type), `${where}: неизвестный тип ${type}`);
    if (task.instruction !== undefined) {
      assert.ok(typeof task.instruction === 'string' && task.instruction.trim(), `${where}: пустая инструкция`);
    }
    if (type === 'matching') checkMatching(task, where);
    else checkChoice(EGE, task, type, where);
  }
});

/** Задания с выбором суждений: multiple и exclude-two. */
function checkChoice(EGE, task, type, where) {
  assert.ok(Array.isArray(task.statements), `${where}: нет суждений`);
  assert.ok(task.statements.length >= 3 && task.statements.length <= 9,
    `${where}: суждений должно быть от 3 до 9 (для выбора цифрами на клавиатуре)`);
  // В exclude-two correct: true означает «выпадает из ряда».
  const prefixes = type === 'exclude-two' ? ['Выпадает.', 'Не выпадает.'] : ['Верно.', 'Неверно.'];

  task.statements.forEach((s, i) => {
    const w = `${where}, суждение ${i + 1}`;
    assert.equal(typeof s.correct, 'boolean', `${w}: поле correct должно быть true/false`);
    assert.ok(typeof s.text === 'string' && s.text.trim(), `${w}: пустой текст`);
    if (s.explanation !== undefined) {
      assert.ok(typeof s.explanation === 'string' && s.explanation.trim(), `${w}: пустое объяснение`);
      // Объяснение не должно противоречить ключу.
      const prefix = s.correct ? prefixes[0] : prefixes[1];
      assert.ok(s.explanation.startsWith(prefix), `${w}: объяснение должно начинаться с «${prefix}» — как в ключе`);
    }
  });

  const correct = EGE.scoring.getCorrectNumbers(task);
  assert.ok(correct.length >= 1, `${where}: нет верных суждений`);
  assert.ok(correct.length < task.statements.length, `${where}: все суждения верные`);
  if (type === 'exclude-two') {
    assert.equal(correct.length, EGE.scoring.EXCLUDE_COUNT, `${where}: «выпадающих» позиций должно быть две`);
  }
}

/** Задания на соответствие. */
function checkMatching(task, where) {
  assert.equal(task.statements, undefined, `${where}: у matching вместо statements — items и options`);
  assert.ok(Array.isArray(task.items) && task.items.length >= 2 && task.items.length <= 9, `${where}: от 2 до 9 позиций`);
  assert.ok(Array.isArray(task.options) && task.options.length >= 2 && task.options.length <= 9, `${where}: от 2 до 9 вариантов`);
  task.options.forEach((o, i) => assert.ok(typeof o === 'string' && o.trim(), `${where}, вариант ${i + 1}: пустой текст`));
  if (task.columns !== undefined) {
    assert.ok(Array.isArray(task.columns) && task.columns.length === 2, `${where}: columns — два заголовка`);
  }
  task.items.forEach((item, i) => {
    const w = `${where}, позиция ${i + 1}`;
    assert.ok(typeof item.text === 'string' && item.text.trim(), `${w}: пустой текст`);
    assert.ok(Number.isInteger(item.match) && item.match >= 1 && item.match <= task.options.length,
      `${w}: match — номер варианта от 1 до ${task.options.length}`);
    if (item.explanation !== undefined) {
      assert.ok(typeof item.explanation === 'string' && item.explanation.trim(), `${w}: пустое объяснение`);
    }
  });
  if (task.oneToOne !== undefined) assert.equal(typeof task.oneToOne, 'boolean', `${where}: oneToOne — true/false`);
  if (task.oneToOne) {
    const matches = task.items.map((item) => item.match);
    assert.equal(new Set(matches).size, matches.length, `${where}: при oneToOne варианты в ключе не повторяются`);
  }
}

test('в каждом разделе есть задания; темы без заданий скрываются', () => {
  const EGE = loadBank();
  for (const section of EGE.sections) {
    assert.ok(EGE.getTasksBySection(section.id).length > 0, `Раздел «${section.title}» пуст`);
  }
  assert.equal(EGE.getTasksBySection('all').length, EGE.tasks.length);
  assert.equal(EGE.getAvailableSections().length, EGE.sections.length);

  const available = [...EGE.getAvailableTopics('SOC').map((t) => t.id)];
  assert.deepEqual(available, ['SOC-STR', 'SOC-MOB', 'SOC-FAM']);
  assert.equal(EGE.getTasksByTopic('SOC-GRP').length, 0);
});

test('пул заданий: тема, раздел, все разделы', () => {
  const EGE = loadBank();
  assert.ok(EGE.getPool('SOC', 'SOC-STR').every((t) => t.topic === 'SOC-STR'));
  assert.ok(EGE.getPool('SOC', 'all').every((t) => t.section === 'SOC'));
  assert.equal(EGE.getPool('all', 'all').length, EGE.tasks.length);
  const sum = EGE.sections.reduce((n, s) => n + EGE.getPool(s.id, 'all').length, 0);
  assert.equal(sum, EGE.tasks.length);
});

test('снятые с выдачи задания не попадают в пул, но их ID занят', () => {
  const EGE = loadBank();
  const before = EGE.getPool('SOC', 'SOC-CNF').length;
  EGE.addTasks('SOC-CNF', [{ id: 'SOC-CNF-999', retired: true, question: 'q', statements: [] }]);
  assert.equal(EGE.getPool('SOC', 'SOC-CNF').length, before);
  assert.ok(EGE.getTask('SOC-CNF-999'));
  assert.throws(() => EGE.addTasks('SOC-CNF', [{ id: 'SOC-CNF-999' }]), /Повторяющийся id/);
});

test('повторяющийся id, неверный формат id и неизвестная тема отклоняются', () => {
  const EGE = loadBank();
  const sample = { id: EGE.tasks[0].id, question: 'q', statements: [] };
  assert.throws(() => EGE.addTasks('ECO-GEN', [sample]), /Повторяющийся id/);
  assert.throws(() => EGE.addTasks('ECO-GEN', [{ id: 'economy-004' }]), /Некорректный id/);
  assert.throws(() => EGE.addTasks('HIS-GEN', [{ id: 'HIS-GEN-001' }]), /Неизвестная тема/);
});

test('ключи проверенных заданий темы «Социальная стратификация»', () => {
  const EGE = loadBank();
  // Ключи утверждены преподавателем — менять только по его решению.
  const keys = {
    'SOC-STR-001': [1, 3, 5],
    'SOC-STR-002': [2, 4, 5],
    'SOC-STR-003': [1, 3, 5],
    'SOC-STR-004': [2, 4, 5],
    'SOC-STR-005': [1, 3, 5],
    'SOC-STR-006': [1, 4, 5]
  };
  const topicTasks = EGE.getTasksByTopic('SOC-STR');
  assert.deepEqual([...topicTasks.map((t) => t.id)], Object.keys(keys), 'в теме только проверенные задания');
  for (const [id, key] of Object.entries(keys)) {
    const task = EGE.getTask(id);
    assert.equal(task.statements.length, 5, `${id}: должно быть 5 суждений`);
    assert.deepEqual([...EGE.scoring.getCorrectNumbers(task)], key, `${id}: ключ не совпадает`);
  }
});

test('тема «Деятельность» в разделе «Человек и общество»: 16 заданий', () => {
  const EGE = loadBank();
  const topic = EGE.getTopic('OBS-ACT');
  assert.equal(topic.title, 'Деятельность');
  assert.equal(topic.section, 'OBS');
  assert.equal(EGE.getSection('OBS').title, 'Человек и общество');
  assert.equal(EGE.getTasksByTopic('OBS-ACT').length, 16);
  assert.deepEqual([...EGE.getAvailableTopics('OBS').map((t) => t.id)], ['OBS-GEN', 'OBS-ACT']);
});

test('ключи проверенных заданий темы «Деятельность»', () => {
  const EGE = loadBank();
  // Ключи утверждены преподавателем — менять только по его решению.
  // Для matching — номера вариантов по порядку позиций А, Б, В, Г, Д.
  const keys = {
    'OBS-ACT-001': ['exclude-two', [2, 5]],
    'OBS-ACT-002': ['multiple', [2, 3, 4]],
    'OBS-ACT-003': ['matching', [1, 2, 3, 4, 5]],
    'OBS-ACT-004': ['multiple', [1, 2, 3]],
    'OBS-ACT-005': ['multiple', [1, 2, 4, 6]],
    'OBS-ACT-006': ['multiple', [1, 3, 4]],
    'OBS-ACT-007': ['multiple', [1, 4, 5]],
    'OBS-ACT-008': ['multiple', [2, 3, 4]],
    'OBS-ACT-009': ['matching', [2, 4, 1, 3, 5]],
    'OBS-ACT-010': ['multiple', [1, 2, 3, 5]],
    'OBS-ACT-011': ['multiple', [1, 3, 5]],
    'OBS-ACT-012': ['matching', [3, 5, 2, 4, 1]],
    'OBS-ACT-013': ['multiple', [1, 2, 3, 5]],
    'OBS-ACT-014': ['multiple', [1, 3, 5]],
    'OBS-ACT-015': ['multiple', [1, 3, 5]],
    'OBS-ACT-016': ['multiple', [1, 2, 3, 5]]
  };
  const topicTasks = EGE.getTasksByTopic('OBS-ACT');
  assert.deepEqual([...topicTasks.map((t) => t.id)], Object.keys(keys), 'в теме только проверенные задания');
  for (const [id, [type, key]] of Object.entries(keys)) {
    const task = EGE.getTask(id);
    assert.equal(EGE.scoring.getTaskType(task), type, `${id}: тип задания`);
    assert.deepEqual([...EGE.scoring.getCorrect(task)], key, `${id}: ключ не совпадает`);
    if (type === 'matching') {
      assert.equal(task.items.length, 5, `${id}: 5 позиций`);
      assert.equal(task.options.length, 5, `${id}: 5 вариантов`);
      assert.equal(task.oneToOne, true, `${id}: взаимно-однозначное соответствие`);
      assert.ok(task.items.every((item) => item.explanation), `${id}: у каждой позиции есть объяснение`);
    } else {
      assert.ok(task.statements.every((st) => st.explanation), `${id}: у каждого суждения есть объяснение`);
    }
  }
  assert.equal(EGE.getTask('OBS-ACT-001').statements.length, 6);
  assert.equal(EGE.getTask('OBS-ACT-005').statements.length, 6);
});

test('тема «Деятельность»: все 16 заданий верно — 31 балл из 31', () => {
  const EGE = loadBank();
  const A = EGE.attempt;
  const tasks = EGE.getTasksByTopic('OBS-ACT');
  const a = A.createAttempt({ taskIds: tasks.map((t) => t.id) });
  assert.equal(A.maxScore(a, EGE.getTask), 31);
  for (const task of tasks) {
    const answer = A.recordAnswer(a, task, [...EGE.scoring.getCorrect(task)]);
    assert.equal(answer.points, answer.maxPoints, `${task.id}: верный ответ — максимум баллов`);
    assert.equal(answer.maxPoints, task.type === 'exclude-two' ? 1 : 2, `${task.id}: максимум баллов`);
  }
  assert.equal(A.totalScore(a), 31);
  assert.equal(A.maxScore(a), 31);
});

// Действия с ответом выполняются кнопками — бланковые указания ЕГЭ не показываются.
const PAPER_INSTRUCTIONS = [/запишите/i, /цифрами без пробелов/i, /в порядке, соответствующем буквам/i, /в ответ цифры/i];

test('формулировки заданий без технических указаний бумажного бланка', () => {
  const EGE = loadBank();
  for (const task of EGE.tasks) {
    for (const text of [task.question, task.instruction].filter(Boolean)) {
      for (const re of PAPER_INSTRUCTIONS) {
        assert.ok(!re.test(text), `${task.id}: «${text}» содержит указание для бланка (${re})`);
      }
    }
  }
  assert.equal(EGE.getTask('OBS-ACT-005').question, 'Укажите компоненты структуры деятельности.');
  assert.equal(EGE.getTask('OBS-ACT-001').instruction, 'Найдите два термина, «выпадающих» из общего ряда.');
});

test('multiple: выбор не суждений, а терминов помечен choiceOf: «items»', () => {
  const EGE = loadBank();
  for (const task of EGE.tasks) {
    if (task.choiceOf !== undefined) {
      assert.ok(['statements', 'items'].includes(task.choiceOf), `${task.id}: choiceOf — statements или items`);
    }
    if (EGE.scoring.getTaskType(task) !== 'multiple') continue;
    const aboutStatements = /суждени/i.test(task.question);
    assert.equal(task.choiceOf === 'items', !aboutStatements,
      `${task.id}: в вопросе ${aboutStatements ? '' : 'не '}говорится о суждениях — choiceOf должен быть ${aboutStatements ? 'не задан' : '«items»'}`);
  }
  const itemTasks = EGE.getTasksByTopic('OBS-ACT').filter((t) => t.choiceOf === 'items').map((t) => t.id);
  assert.deepEqual([...itemTasks], ['OBS-ACT-005']);
});
