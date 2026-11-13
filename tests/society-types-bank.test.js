'use strict';

/**
 * Тема «Типы обществ» (OBS-TYP): 25 заданий утверждённого банка преподавателя
 * (окончательная редакция; документ хранится вне репозитория). Ключи, форматы, уровни,
 * критерии и действия ниже переписаны из паспорта заданий банка (раздел V.1) — менять
 * только по решению преподавателя. Данные собирает scripts/build-society-types.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../js/scoring.js');
const { loadBank, root } = require('./helpers/ege.js');

const EGE = loadBank();
const id = (n) => 'OBS-TYP-' + String(n).padStart(3, '0');

/** Паспорт банка (V.1): формат, ключ, типы, критерии, уровень, действие. */
const PASSPORT = [
  [1, 'EXCL', '24', 'Т/И', 'Э, С, ПЛ, Д', 'Б', 'Уз'],
  [2, 'EXCL', '46', 'П/Т', 'ПР, Э, ПЛ, Д', 'Б', 'Уз'],
  [3, 'EXCL', '26', 'И/Т/П', 'С, Д', 'С', 'Рз'],
  [4, 'EXCL', '25', 'Т/И', 'С', 'С', 'Пн'],
  [5, 'EXCL', '15', 'П/Т/И', 'Ф, Э, С, Д', 'С', 'Рз'],
  [6, 'EXCL', '36', 'И/П', 'ПР, Ф, Э', 'Пв', 'Рз'],
  [7, 'MATCH', '12122', 'Т/И', 'Ф, Э, С, Д', 'Б', 'Уз'],
  [8, 'MATCH', '21211', 'Т/П', 'Ф, Э, ПЛ, Д', 'Б', 'Уз'],
  [9, 'MATCH', '22121', 'И/П', 'Ф, Э', 'С', 'Рз'],
  [10, 'MATCH', '32123', 'Т/И/П', 'ПР, Ф', 'С', 'Рз'],
  [11, 'MATCH', '31231', 'Т/И/П', 'Д', 'С', 'Рз'],
  [12, 'MATCH', '21212', 'Т/И', 'ПЛ', 'С', 'Уз, Рз'],
  [13, 'MATCH', '13212', 'Т/И/П', 'С', 'С', 'Рз'],
  [14, 'MATCH', '12212', 'И/П', 'ПР, Э, Д', 'Пв', 'Пн'],
  [15, 'MULTI', '135', 'Т/И/П', 'Ф, Э, С, Д', 'Б', 'Уз'],
  [16, 'MULTI', '1345', 'Т/И/П', 'ПЛ, Д', 'Пв', 'Пн'],
  [17, 'MULTI', '235', 'Т/И/П', 'С', 'С', 'Рз'],
  [18, 'MULTI', '1245', 'Т/И/П', 'ПР, Ф, Э', 'С', 'Пн'],
  [19, 'MULTI', '245', 'И/П', 'ПР, Ф, Э', 'Пв', 'Рз'],
  [20, 'MULTI', '14', 'Т/И/П', 'ПР, Ф, ПЛ, Д', 'Пв', 'Рз'],
  [21, 'COND', '124', 'Т', 'Э, С, ПЛ, Д', 'Б', 'Уз'],
  [22, 'COND', '1356', 'И', 'Ф, Э, С, Д', 'С', 'Рз'],
  [23, 'COND', '136', 'П', 'ПР, Э, Д', 'С', 'Пн'],
  [24, 'COND', '25', 'П', 'ПР, Ф, Э, Д', 'С', 'Рз'],
  [25, 'MATCH', '12321', 'Т/И/П', 'Э, Д', 'Пв', 'Пн']
];
const SOC = { 'Т': 'traditional', 'И': 'industrial', 'П': 'postindustrial' };
const CRIT = { 'ПР': 'nature', 'Ф': 'factor', 'Э': 'economy', 'С': 'social', 'ПЛ': 'politics', 'Д': 'spiritual' };
const LEVEL = { 'Б': 1, 'С': 2, 'Пв': 3 };
const ACT = { 'Уз': 'recognition', 'Пн': 'understanding', 'Рз': 'distinction' };

const tasks = EGE.getTasksByTopic('OBS-TYP');
const keyOf = (task) => S.getCorrect(task).join('');

test('OBS-TYP: загружены ровно 25 заданий OBS-TYP-001…025 в порядке банка', () => {
  assert.equal(tasks.length, 25);
  assert.deepEqual(Array.from(tasks, (t) => t.id), PASSPORT.map((p) => id(p[0])));
  tasks.forEach((t, i) => assert.equal(t.bankNumber, i + 1, t.id));
  assert.equal(EGE.getTopic('OBS-TYP').title, 'Типы обществ');
});

test('OBS-TYP: форматы 6 EXCL, 9 MATCH, 6 MULTI, 4 COND; тип задания по формату', () => {
  const count = {};
  tasks.forEach((t) => { count[t.bankFormat] = (count[t.bankFormat] || 0) + 1; });
  assert.deepEqual({ ...count }, { EXCL: 6, MATCH: 9, MULTI: 6, COND: 4 });
  const type = { EXCL: 'exclude-two', MATCH: 'matching', MULTI: 'multiple', COND: 'multiple' };
  for (const t of tasks) {
    assert.equal(S.getTaskType(t), type[t.bankFormat], t.id);
    assert.equal(t.choiceOf, t.bankFormat === 'COND' ? 'items' : undefined, t.id);
  }
});

test('OBS-TYP: каждый ключ совпадает с банком; метаданные — с паспортом V.1', () => {
  for (const [n, format, key, types, criteria, level, actions] of PASSPORT) {
    const t = EGE.getTask(id(n));
    assert.equal(t.bankFormat, format, `№ ${n}: формат`);
    assert.equal(keyOf(t), key, `№ ${n}: ключ`);
    assert.deepEqual(Array.from(t.societyTypes), types.split('/').map((x) => SOC[x]), `№ ${n}: типы обществ`);
    assert.deepEqual(Array.from(t.criteria), criteria.split(', ').map((x) => CRIT[x]), `№ ${n}: критерии`);
    assert.equal(t.difficulty, LEVEL[level], `№ ${n}: уровень`);
    assert.deepEqual(Array.from(t.cognitiveActions), actions.split(', ').map((x) => ACT[x]), `№ ${n}: действие`);
    assert.ok(t.checks && t.typicalMistake && t.basis, `№ ${n}: проверяемое знание, типичная ошибка, источник`);
    assert.equal(t.source.kind, 'author', `№ ${n}`);
  }
});

test('OBS-TYP: в каждом EXCL 6 позиций и ровно две исключаемые', () => {
  for (const t of tasks.filter((x) => x.bankFormat === 'EXCL')) {
    assert.equal(t.statements.length, 6, t.id);
    assert.equal(S.getCorrectNumbers(t).length, 2, t.id);
    assert.ok(t.instruction.startsWith('Найдите две характеристики'), t.id);
  }
});

test('OBS-TYP: в MATCH пять буквенных позиций, 2–3 типа обществ, все номера второго столбца используются', () => {
  for (const t of tasks.filter((x) => x.bankFormat === 'MATCH')) {
    assert.equal(t.items.length, 5, t.id);
    assert.ok(t.options.length === 2 || t.options.length === 3, t.id);
    assert.deepEqual(new Set(t.items.map((i) => i.match)).size, t.options.length, t.id);
    assert.ok(!t.oneToOne, `${t.id}: номера могут повторяться`);
    assert.deepEqual(Array.from(t.columns), ['Характеристики', 'Типы обществ'], t.id);
    t.items.forEach((item, i) => assert.ok(item.explanation.includes('(' + item.match + ')'), `${t.id} ${S.letter(i + 1)}: объяснение согласовано с ключом`));
  }
});

test('OBS-TYP: в MULTI и COND по 2, 3 и 4 верных — 2, 5 и 3 задания', () => {
  const dist = { 2: [], 3: [], 4: [] };
  tasks.filter((t) => t.bankFormat === 'MULTI' || t.bankFormat === 'COND')
    .forEach((t) => dist[S.getCorrectNumbers(t).length].push(t.bankNumber));
  assert.deepEqual(dist, { 2: [20, 24], 3: [15, 17, 19, 21, 23], 4: [16, 18, 22] });
});

test('OBS-TYP: уровни 6 / 13 / 6, как в банке', () => {
  const by = { 1: [], 2: [], 3: [] };
  tasks.forEach((t) => by[t.difficulty].push(t.bankNumber));
  assert.deepEqual(by[1], [1, 2, 7, 8, 15, 21]);
  assert.deepEqual(by[2], [3, 4, 5, 9, 10, 11, 12, 13, 17, 18, 22, 23, 24]);
  assert.deepEqual(by[3], [6, 14, 16, 19, 20, 25]);
});

test('OBS-TYP: оценивание по позиции КИМ — EXCL и MATCH по 1 баллу, MULTI и COND по 2; максимум 35', () => {
  const kim = { EXCL: 1, MULTI: 2, MATCH: 3, COND: 4 };
  const points = { EXCL: 1, MULTI: 2, MATCH: 1, COND: 2 };
  for (const t of tasks) {
    assert.equal(t.kimTask, kim[t.bankFormat], t.id);
    assert.equal(S.getMaxPoints(t), points[t.bankFormat], t.id);
  }
  assert.equal(EGE.getPracticumMaxScore(EGE.getPracticum('OBS-TYP-P01')), 35);
});

test('OBS-TYP: объяснение каждой позиции согласовано с ключом (формулировки банка)', () => {
  const verdict = {
    EXCL: [/^Выпадает\./, /^Верно\./],
    MULTI: [/^Верно\./, /^Неверно[.: ]/],
    COND: [/^Подходит\./, /^Не подходит\./]
  };
  for (const t of tasks.filter((x) => x.statements)) {
    t.statements.forEach((s, i) => {
      const re = verdict[t.bankFormat][s.correct ? 0 : 1];
      assert.match(s.explanation, re, `${t.id}, позиция ${i + 1}`);
    });
  }
});

test('OBS-TYP: разметка ошибок V.2 — только у неверных позиций; положения сверх таблицы V.3', () => {
  for (const t of tasks.filter((x) => x.statements)) {
    t.statements.forEach((s, i) => {
      const wrongPosition = t.bankFormat === 'EXCL' ? s.correct : !s.correct;
      assert.equal(!!s.trap, wrongPosition, `${t.id}, позиция ${i + 1}: trap только у неверной позиции`);
      if (s.trap) s.trap.tags.forEach((tag) => assert.ok(EGE.TRAP_TAGS[tag], tag));
    });
  }
  const extras = [];
  for (const t of tasks) {
    (t.statements || []).forEach((s, i) => { if (s.extra) extras.push(t.bankNumber + '.' + (i + 1)); });
    (t.items || []).forEach((it, i) => { if (it.extra) extras.push(t.bankNumber + S.letter(i + 1)); });
  }
  assert.deepEqual(extras.sort(), ['11В', '16.5', '18.4', '20.1', '20.2', '20.4', '22.5', '6.5'].sort());
});

test('OBS-TYP: утверждённая правка объяснения № 20 внесена, прежняя категоричная фраза удалена', () => {
  const s = EGE.getTask(id(20)).statements[1];
  assert.ok(s.explanation.includes('Свободные конкурентные выборы сами по себе не определяют традиционную легитимность, основанную на признании обычаев и исторически сложившихся порядков.'));
  assert.ok(!s.explanation.includes('не связаны вовсе'));
  const file = fs.readFileSync(path.join(root, 'data/tasks/society/society-types.js'), 'utf8');
  assert.ok(!file.includes('не связаны вовсе'));
  assert.ok(file.includes('ФАЙЛ СГЕНЕРИРОВАН'), 'файл собирается скриптом');
});

test('OBS-TYP: из условий убраны только бланковые указания', () => {
  for (const t of tasks) {
    assert.doesNotMatch(t.question + ' ' + (t.instruction || ''), /запишите|Запишите|Ответ:/, t.id);
  }
  assert.equal(EGE.getTask(id(15)).question, 'Выберите верные суждения о типах обществ.');
  assert.match(EGE.getTask(id(21)).question, /является традиционным \(аграрным\)\?$/);
});

test('OBS-TYP: практикум с режимами «Обучение» и «Экзамен», постоянный порядок, шесть критериев', () => {
  const p = EGE.getPracticum('OBS-TYP-P01');
  assert.deepEqual(Array.from(p.modes), ['learn', 'exam']);
  assert.ok(!p.shuffle);
  assert.deepEqual(Array.from(p.taskIds), PASSPORT.map((x) => id(x[0])));
  assert.deepEqual(Array.from(p.criteria, (c) => c.id), ['nature', 'factor', 'economy', 'social', 'politics', 'spiritual']);
  assert.deepEqual(Array.from(p.criteria, (c) => c.title), ['Отношение к природе', 'Основной фактор производства', 'Экономика',
    'Социальная структура', 'Политическая жизнь', 'Духовная жизнь']);
  // Каждое значение criteria заданий описано у практикума.
  const known = new Set(p.criteria.map((c) => c.id));
  tasks.forEach((t) => t.criteria.forEach((c) => assert.ok(known.has(c), t.id + ': ' + c)));
});

test('реестр: поле modes проверяется', () => {
  const T = loadBank();
  const base = { topic: 'OBS-TYP', status: 'draft', taskIds: ['OBS-TYP-001'] };
  assert.throws(() => T.addPracticums([{ ...base, id: 'OBS-TYP-P02', number: 2, modes: ['quiz'] }]), /modes/);
  assert.throws(() => T.addPracticums([{ ...base, id: 'OBS-TYP-P03', number: 3, modes: [] }]), /modes/);
  assert.throws(() => T.addPracticums([{ ...base, id: 'OBS-TYP-P04', number: 4, modes: ['exam'], shuffle: true }]), /постоянным порядком/);
  assert.throws(() => T.addPracticums([{ ...base, id: 'OBS-TYP-P05', number: 5, criteria: [{ id: 'x' }] }]), /criteria/);
});
