'use strict';

/**
 * Загрузка учебника для тестов. Каждый вызов даёт независимый экземпляр TXT.
 * Скрипты выполняются в текущем realm с пустым sandbox вместо глобального объекта.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

/** Ядро учебника в порядке подключения. */
const CORE_SCRIPTS = [
  'js/textbook/inline.js',
  'js/textbook/schema.js',
  'js/textbook/registry.js',
  'js/textbook/progress.js',
  'js/textbook/router.js'
];

/** Скрипты, которые при загрузке обращаются к DOM, — в Node не выполняются. */
const DOM_SCRIPTS = ['js/textbook/app.js'];

function pageScripts() {
  const html = fs.readFileSync(path.join(root, 'textbook.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
}

function run(scripts, sandbox) {
  for (const src of scripts) {
    const code = fs.readFileSync(path.join(root, src), 'utf8');
    const fn = vm.runInThisContext('(function (window, globalThis, TXT) {\n' + code + '\n})', { filename: src });
    fn(undefined, sandbox, sandbox.TXT);
  }
  return sandbox.TXT;
}

/** Только ядро: пустой каталог, без глав. */
function loadCore() {
  return run(CORE_SCRIPTS, {});
}

/** Всё, что подключает textbook.html, кроме app.js: ядро, содержание, отрисовка блоков. */
function loadBook() {
  return run(pageScripts().filter((s) => !DOM_SCRIPTS.includes(s)), {});
}

/** Каталог и минимальная корректная глава для тестов ядра. */
function testCatalog(TXT) {
  TXT.defineCatalog({
    areas: [{ id: 'TST', title: 'Тестовый раздел', chapters: [{ id: 'demo', title: 'Демо' }, { id: 'later', title: 'Позже' }] }]
  });
}

function demoChapter() {
  return {
    id: 'demo',
    area: 'TST',
    title: 'Демо',
    description: 'Тестовая глава.',
    practice: [{ kind: 'olympiad', title: 'Практика', label: 'Перейти', href: 'olympiad.html#/hp/POL/POL-POW' }],
    sections: [
      { id: 'read', title: 'Чтение', blocks: [{ type: 'text', text: ['Абзац с **выделением**.', 'И [[термин|пояснение]].'] }] },
      {
        id: 'act',
        title: 'Задания',
        blocks: [
          { type: 'predict', id: 'guess', prompt: 'Как думаете?', options: [{ text: 'А', response: 'Так.' }, { text: 'Б', response: 'Иначе.' }] },
          {
            type: 'classify', id: 'sort', prompt: 'Разложите', options: ['X', 'Y'],
            items: [{ id: 'one', text: 'Первое', answer: 0, explanation: 'Потому что.' }, { id: 'two', text: 'Второе', answer: 1, explanation: 'Потому что.' }]
          }
        ]
      },
      {
        id: 'deep', title: 'Глубже', level: 'olympiad',
        blocks: [{ type: 'think', id: 'hmm', prompt: 'Подумайте', answer: 'Ответ.' }]
      },
      {
        id: 'final', title: 'Проверка',
        blocks: [{
          type: 'quiz', id: 'q', mode: 'final',
          questions: [
            { id: 'a', type: 'single', text: 'Вопрос 1', ref: 'read', explanation: 'Потому что.', options: [{ text: 'да', correct: true }, { text: 'нет', correct: false }] },
            { id: 'b', type: 'multiple', text: 'Вопрос 2', ref: 'act', explanation: 'Потому что.', options: [{ text: 'да', correct: true }, { text: 'тоже', correct: true }, { text: 'нет', correct: false }] },
            { id: 'c', type: 'single', text: 'Вопрос 3', ref: 'deep', explanation: 'Потому что.', options: [{ text: 'да', correct: true }, { text: 'нет', correct: false }] }
          ]
        }]
      },
      { id: 'result', title: 'Итоги', progress: false, blocks: [{ type: 'summary' }, { type: 'practice' }] }
    ]
  };
}

module.exports = { root, CORE_SCRIPTS, DOM_SCRIPTS, pageScripts, loadCore, loadBook, testCatalog, demoChapter };
