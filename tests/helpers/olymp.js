'use strict';

/**
 * Загрузка олимпиадного ядра для тестов и тестовый каталог.
 * Каждый вызов loadCore() даёт независимый экземпляр OLY с пустым реестром.
 * Всё здесь — тестовые данные (олимпиада TST), а не реальные задания.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

/** Порядок подключения ядра — такой же будет в olympiad.html. */
const CORE_SCRIPTS = [
  'js/olymp/normalize.js',
  'js/olymp/types.js',
  'js/olymp/scoring-rules.js',
  'js/olymp/registry.js',
  'js/olymp/grade.js',
  'js/olymp/attempt.js'
];

/**
 * Выполняет скрипты в текущем realm (чтобы массивы и объекты сравнивались
 * assert.deepEqual без оговорок), подменяя глобальный объект пустым sandbox.
 */
function loadCore() {
  const sandbox = {};
  for (const src of CORE_SCRIPTS) {
    const code = fs.readFileSync(path.join(root, src), 'utf8');
    const run = vm.runInThisContext('(function (window, globalThis) {\n' + code + '\n})', { filename: src });
    run(undefined, sandbox);
  }
  return sandbox.OLY;
}

/** Предмет и олимпиада для тестов. */
function defineCatalog(OLY) {
  OLY.defineSubject({
    id: 'social',
    title: 'Обществознание',
    disciplines: [
      { id: 'SOC', title: 'Социология', topics: [
        { id: 'SOC-MOB', title: 'Социальная мобильность' },
        { id: 'SOC-STR', title: 'Социальная структура и стратификация' },
        { id: 'SOC-FAM', title: 'Семья' }
      ] },
      { id: 'PHI', title: 'Философия', topics: [
        { id: 'PHI-HIS', title: 'Философия истории' }
      ] },
      { id: 'LAW', title: 'Право', topics: [] }
    ]
  });
  OLY.defineOlympiad({ id: 'TST', title: 'Тестовая олимпиада', subjects: ['social'], classes: [9, 10, 11], rounds: [1, 2] });
}

/** Задания всех пяти типов (scoring: null — критерии не определены). */
function sampleTasks() {
  return [
    {
      id: 'TST-SOC-MOB-001', olympiad: 'TST', subject: 'social', discipline: 'SOC', topic: 'SOC-MOB',
      type: 'multiple-select', question: 'Выберите верные суждения о мобильности.',
      options: [
        { text: 'a', correct: true }, { text: 'b', correct: false },
        { text: 'c', correct: true }, { text: 'd', correct: false }
      ],
      scoring: null
    },
    {
      id: 'TST-SOC-MOB-002', olympiad: 'TST', subject: 'social', discipline: 'SOC', topic: 'SOC-MOB',
      type: 'single-select', question: 'Выберите один вариант.',
      options: [{ text: 'a', correct: false }, { text: 'b', correct: true }, { text: 'c', correct: false }],
      scoring: null
    },
    {
      id: 'TST-PHI-HIS-001', olympiad: 'TST', subject: 'social', discipline: 'PHI', topic: 'PHI-HIS',
      type: 'short-text', question: 'Как называется учение о конце истории?',
      acceptedAnswers: ['эсхатология', 'учение о конце истории'],
      scoring: null
    },
    {
      id: 'TST-SOC-STR-001', olympiad: 'TST', subject: 'social', discipline: 'SOC', topic: 'SOC-STR',
      type: 'numeric', question: 'Сколько страт?', answer: 12.5, unit: '%',
      scoring: null
    },
    {
      id: 'TST-SOC-FAM-001', olympiad: 'TST', subject: 'social', discipline: 'SOC', topic: 'SOC-FAM',
      type: 'matching', question: 'Установите соответствие.', oneToOne: true,
      items: [{ text: 'x', match: 2 }, { text: 'y', match: 1 }, { text: 'z', match: 3 }],
      options: ['1', '2', '3'],
      scoring: null
    }
  ];
}

/** Задание с заменёнными полями (для проверок валидации). */
function taskWith(overrides) {
  return Object.assign({}, sampleTasks()[0], overrides);
}

/**
 * Правила, объявленные только в тестах, — чтобы проверить механизм оценивания.
 * В js/olymp/scoring-rules.js правил нет, пока их не даст источник.
 */
function registerTestRules(OLY) {
  OLY.scoringRules.register('test-all-or-nothing', {
    supports: '*',
    score: (result, maxPoints) => (result.verdict === 'correct' ? maxPoints : 0)
  });
  OLY.scoringRules.register('test-minus-per-mistake', {
    supports: ['multiple-select', 'matching'],
    validateParams: (params) => (typeof params.penalty === 'number' ? [] : ['penalty должно быть числом']),
    score: (result, maxPoints, params) => maxPoints - result.details.mistakes * params.penalty
  });
}

/** Официальные критерии для тестов. */
function officialScoring(rule, maxPoints, params) {
  const scoring = { maxPoints, rule, basis: 'official', ref: 'Тестовый документ, п. 1' };
  if (params) scoring.params = params;
  return scoring;
}

module.exports = {
  CORE_SCRIPTS,
  loadCore,
  defineCatalog,
  sampleTasks,
  taskWith,
  registerTestRules,
  officialScoring
};
