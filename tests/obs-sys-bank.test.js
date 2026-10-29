'use strict';

/**
 * Тема «Общество как система. Социальные институты» (OBS-SYS): 36 заданий двух
 * практикумов по 18. Ключи, коды и порядок — по утверждённой экспертизе преподавателя
 * (итоговые ключи редакции от 28.10.2026; документ хранится вне репозитория), менять только
 * по решению преподавателя. Оценивание — по действующей модели ЕГЭ (js/scoring.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/scoring.js');
const { loadBank } = require('./helpers/ege.js');

const EGE = loadBank();
const id = (n) => 'OBS-SYS-' + String(n).padStart(3, '0');

/** Практикум → коды заданий экспертизы, позиции КИМ и ключи (в порядке практикума). */
const PRACTICUMS = {
  'OBS-SYS-P01': {
    max: 32,
    codes: ['К1-1', 'В1-2', 'К1-2', 'В1-11', 'К1-5', 'В1-9', 'К1-3', 'К2-5', 'К1-8',
      'Н3', 'К1-7', 'Н1', 'К1-9', 'Н5', 'К1-4', 'В1-4', 'К2-7', 'К2-8'],
    kim: [1, 2, 4, 2, 4, 2, 4, 4, 3, 2, 4, 2, 3, 2, 4, 2, 4, 3],
    keys: ['36', '124', '135', '125', '246', '1245', '35', '156', '12432', '235', '236', '134',
      '12313', '13', '34', '1234', '1346', '31242']
  },
  'OBS-SYS-P02': {
    max: 31,
    codes: ['В1-1', 'В2-2', 'В2-14', 'К1-6', 'В2-16', 'К2-4', 'В2-6', 'В2-1', 'К2-3',
      'В1-3', 'В2-12', 'В1-6', 'Н4', 'Н2', 'Н6', 'К2-2', 'В2-7', 'В1-7'],
    kim: [1, 2, 2, 4, 2, 4, 2, 1, 4, 3, 3, 2, 4, 2, 4, 4, 2, 3],
    keys: ['25', '124', '14', '1356', '134', '35', '1234', '46', '1345', '21432', '21342', '13',
      '125', '135', '134', '246', '124', '13242']
  }
};

/** Ключ задания строкой, как в экспертизе: номера верных (выпадающих) позиций или цифры А–Д. */
const keyOf = (task) => S.getCorrect(task).join('');

test('OBS-SYS: 36 заданий, OBS-SYS-001…036, все в теме OBS-SYS', () => {
  const tasks = EGE.getTasksByTopic('OBS-SYS');
  assert.deepEqual(Array.from(tasks, (t) => t.id), Array.from({ length: 36 }, (_, i) => id(i + 1)));
  const topic = EGE.getTopic('OBS-SYS');
  assert.equal(topic.title, 'Общество как система. Социальные институты');
  assert.equal(topic.subtitle, 'Темы 1.6–1.7 кодификатора ЕГЭ');
  assert.equal(topic.section, 'OBS');
});

test('OBS-SYS: состав, порядок, коды экспертизы, позиции КИМ и ключи практикумов', () => {
  for (const [pid, want] of Object.entries(PRACTICUMS)) {
    const p = EGE.getPracticum(pid);
    assert.equal(p.status, 'published', pid);
    assert.ok(!p.shuffle, `${pid}: порядок постоянный`);
    assert.equal(p.taskIds.length, 18, pid);
    p.taskIds.forEach((tid, i) => {
      const task = EGE.getTask(tid);
      const where = `${pid}, № ${i + 1} (${tid})`;
      assert.equal(task.source.kind, 'author', where);
      assert.equal(task.source.ref, want.codes[i], where);
      assert.equal(task.kimTask, want.kim[i], where);
      assert.equal(keyOf(task), want.keys[i], `${where}: ключ`);
    });
  }
});

test('OBS-SYS: тип и максимальный балл по позиции КИМ; 32 и 31 балл за практикумы', () => {
  const types = { 1: 'exclude-two', 2: 'multiple', 3: 'matching', 4: 'multiple' };
  const models = { 1: 'exclude-two', 2: 'multiple', 3: 'matching-1', 4: 'multiple' };
  const points = { 1: 1, 2: 2, 3: 1, 4: 2 };
  for (const task of EGE.getTasksByTopic('OBS-SYS')) {
    assert.equal(S.getTaskType(task), types[task.kimTask], task.id);
    assert.equal(S.getScoringModel(task), models[task.kimTask], task.id);
    assert.equal(S.getMaxPoints(task), points[task.kimTask], task.id);
    // Позиция 4 — выбор из списка (choiceOf: 'items'), позиция 2 — суждения.
    assert.equal(task.choiceOf, task.kimTask === 4 ? 'items' : undefined, task.id);
  }
  for (const [pid, want] of Object.entries(PRACTICUMS)) {
    assert.equal(EGE.getPracticumMaxScore(EGE.getPracticum(pid)), want.max, pid);
  }
});

test('OBS-SYS: у всех вариантов — объяснение; «Как решать» у каждого задания; общий признак у задания 1', () => {
  for (const task of EGE.getTasksByTopic('OBS-SYS')) {
    assert.ok(typeof task.solution === 'string' && task.solution.length > 40, `${task.id}: «Как решать»`);
    const parts = task.type === 'matching' ? task.items : task.statements;
    for (const part of parts) assert.ok(part.explanation && part.explanation.length >= 25, task.id);
    assert.equal(!!task.commonFeature, task.type === 'exclude-two', `${task.id}: commonFeature`);
    if (task.type === 'exclude-two') {
      for (const s of task.statements) assert.match(s.explanation, s.correct ? /^Выпадает\. / : /^Не выпадает\. /, task.id);
    } else if (task.type !== 'matching') {
      for (const s of task.statements) assert.match(s.explanation, s.correct ? /^Верно\. / : /^Неверно\. /, task.id);
    }
    // Остатков разметки Markdown нет.
    assert.doesNotMatch(JSON.stringify(task), /\*\*|(^|\s)\*\S|→ \*\*|<br>/, task.id);
  }
});

test('OBS-SYS: условия заданий не повторяются, варианты внутри задания различны', () => {
  const tasks = EGE.getTasksByTopic('OBS-SYS');
  const conditions = tasks.map((t) => t.question + '|' + (t.type === 'matching'
    ? t.items.map((x) => x.text).join('|') : t.statements.map((x) => x.text).join('|')));
  assert.equal(new Set(conditions).size, conditions.length);
  for (const t of tasks) {
    const texts = t.type === 'matching' ? t.options : t.statements.map((s) => s.text);
    assert.equal(new Set(texts).size, texts.length, t.id);
  }
});

/* ---------- Начисление 0, 1 и 2 баллов на заданиях темы ---------- */

/** Номера вариантов задания с выбором, не входящие в ключ. */
const wrongOf = (task) => task.statements.map((_, i) => i + 1).filter((n) => !S.getCorrect(task).includes(n));

test('OBS-SYS, позиции 2 и 4: 2 балла за точный ответ, 1 — за одну ошибку, 0 — за две', () => {
  for (const task of EGE.getTasksByTopic('OBS-SYS').filter((t) => S.getScoringModel(t) === 'multiple')) {
    const key = Array.from(S.getCorrect(task));
    const wrong = wrongOf(task);
    assert.ok(wrong.length >= 1, task.id);
    assert.equal(S.scoreTask(task, key), 2, `${task.id}: точный ответ`);
    assert.equal(S.scoreTask(task, key.slice().reverse()), 2, `${task.id}: порядок цифр не важен`);
    assert.equal(S.scoreTask(task, [...key.slice(1), wrong[0]]), 1, `${task.id}: замена`);
    assert.equal(S.scoreTask(task, key.slice(1)), 1, `${task.id}: пропуск`);
    assert.equal(S.scoreTask(task, [...key, wrong[0]]), 1, `${task.id}: лишняя цифра`);
    // Две ошибки: две лишние и замена с лишней — если неверных вариантов хватает (при 4 верных из 5 он один).
    if (wrong.length >= 2) {
      assert.equal(S.scoreTask(task, [...key, wrong[0], wrong[1]]), 0, `${task.id}: две лишние`);
      assert.equal(S.scoreTask(task, [...key.slice(1), wrong[0], wrong[1]]), 0, `${task.id}: замена и лишняя`);
    }
    assert.equal(S.scoreTask(task, [...key.slice(2), wrong[0]]), 0, `${task.id}: замена и пропуск`);
    if (key.length >= 3) assert.equal(S.scoreTask(task, key.slice(2)), 0, `${task.id}: два пропуска`);
    assert.equal(S.scoreTask(task, []), 0, `${task.id}: пустой ответ`);
  }
});

test('OBS-SYS, позиция 1: 1 балл только за оба «выпадающих» понятия', () => {
  const tasks = EGE.getTasksByTopic('OBS-SYS').filter((t) => t.kimTask === 1);
  assert.equal(tasks.length, 3);
  for (const task of tasks) {
    const key = Array.from(S.getCorrect(task));
    assert.equal(key.length, 2, task.id);
    assert.equal(S.scoreTask(task, key), 1, task.id);
    assert.equal(S.scoreTask(task, key.slice().reverse()), 1, task.id);
    assert.equal(S.scoreTask(task, [key[0], wrongOf(task)[0]]), 0, `${task.id}: одна замена`);
    assert.equal(S.scoreTask(task, [key[0]]), 0, `${task.id}: одно понятие`);
    assert.equal(S.scoreTask(task, [...key, wrongOf(task)[0]]), 0, `${task.id}: лишнее понятие`);
  }
});

test('OBS-SYS, позиция 3: 1 балл только при полном совпадении соответствия', () => {
  const tasks = EGE.getTasksByTopic('OBS-SYS').filter((t) => t.kimTask === 3);
  assert.equal(tasks.length, 6);
  for (const task of tasks) {
    const key = Array.from(S.getCorrect(task));
    assert.equal(S.scoreTask(task, key), 1, task.id);
    for (let i = 0; i < key.length; i++) {
      const one = key.slice();
      one[i] = key[i] === 1 ? 2 : 1;
      assert.equal(S.scoreTask(task, one), 0, `${task.id}: одна неверная позиция (${'АБВГД'[i]})`);
    }
    assert.equal(S.scoreTask(task, key.slice(0, 4)), 0, `${task.id}: не все позиции`);
  }
});

/* ---------- Число верных ответов (редакция 2) ---------- */

test('OBS-SYS: в заданиях с выбором 2, 3 или 4 верных — 6 / 15 / 6, по позициям 2 и 4 — 3 / 8 / 3 и 3 / 7 / 3', () => {
  const count = (kim) => {
    const c = { 2: 0, 3: 0, 4: 0 };
    for (const t of EGE.getTasksByTopic('OBS-SYS').filter((x) => x.kimTask === kim)) c[S.getCorrect(t).length]++;
    return c;
  };
  assert.deepEqual(count(2), { 2: 3, 3: 8, 4: 3 });
  assert.deepEqual(count(4), { 2: 3, 3: 7, 4: 3 });
  // Число вариантов не изменилось: 5 у позиции 2, 6 у позиции 4.
  for (const t of EGE.getTasksByTopic('OBS-SYS').filter((x) => x.kimTask === 2 || x.kimTask === 4)) {
    assert.equal(t.statements.length, t.kimTask === 2 ? 5 : 6, t.id);
  }
});

test('OBS-SYS: ключ в практикуме повторяется не больше двух раз и не стоит в соседних заданиях', () => {
  for (const [pid, want] of Object.entries(PRACTICUMS)) {
    const seen = {};
    want.keys.forEach((k, i) => {
      seen[k] = (seen[k] || 0) + 1;
      assert.ok(seen[k] <= 2, `${pid}: ключ ${k} — больше двух раз`);
      if (i > 0) assert.notEqual(k, want.keys[i - 1], `${pid}, № ${i} и № ${i + 1}: одинаковые ключи`);
    });
  }
});

test('OBS-SYS: два и четыре верных — 2 балла за полный ответ, 1 за одну ошибку, 0 за две', () => {
  const tasks = EGE.getTasksByTopic('OBS-SYS').filter((t) => S.getScoringModel(t) === 'multiple');
  for (const size of [2, 4]) {
    const list = tasks.filter((t) => S.getCorrect(t).length === size);
    assert.equal(list.length, 6, `${size} верных`);
    for (const task of list) {
      const key = Array.from(S.getCorrect(task));
      const wrong = wrongOf(task);
      assert.equal(S.scoreTask(task, key), 2, `${task.id}: полный ответ`);
      assert.equal(S.scoreTask(task, key.slice(1)), 1, `${task.id}: пропуск`);
      assert.equal(S.scoreTask(task, [...key, wrong[0]]), 1, `${task.id}: лишняя`);
      assert.equal(S.scoreTask(task, [...key.slice(1), wrong[0]]), 1, `${task.id}: замена`);
      assert.equal(S.scoreTask(task, [...key.slice(2), wrong[0]]), 0, `${task.id}: замена и пропуск`);
      if (wrong.length >= 2) assert.equal(S.scoreTask(task, [...key.slice(1), wrong[0], wrong[1]]), 0, `${task.id}: замена и лишняя`);
      if (size === 4) assert.equal(S.scoreTask(task, key.slice(2)), 0, `${task.id}: два пропуска`);
      if (size === 2) assert.equal(S.scoreTask(task, [key[0]]), 1, `${task.id}: одна верная цифра из двух`);
      if (size === 2) assert.equal(S.scoreTask(task, [wrong[0], wrong[1]]), 0, `${task.id}: обе цифры неверные`);
    }
  }
});

test('OBS-SYS-018 (П1-18): институты в единой форме, экономические институты вместо права, ключ 31242', () => {
  const task = EGE.getTask('OBS-SYS-018');
  assert.deepEqual(Array.from(task.items, (x) => x.text), ['государство', 'семья', 'религия', 'экономические институты', 'образование']);
  assert.equal(task.options.length, 4);
  assert.equal(keyOf(task), '31242');
  assert.equal(S.getMaxPoints(task), 1);
});

