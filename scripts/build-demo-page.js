#!/usr/bin/env node
/**
 * Собирает из olympiad.html непубликуемые страницы практикума «Норма права»:
 *   • olympiad-demo.html — демонстрация форматов на тестовых данных (трек DEMO);
 *   • olympiad-work.html — рабочий банк заданий (трек PR, тема LAW-NRM) до официальной
 *     сверки нормативных текстов и методической проверки;
 *   • olympiad-nrm-simple.html — упрощённый тренажёр «Классификация правовых норм»
 *     (трек PR, тема LAW-NKL).
 *
 * Отличия от olympiad.html (и только они):
 *   • плашка «Демонстрация: тестовые данные» и кнопка сброса демо-попытки;
 *   • стили css/olymp-nrm.css;
 *   • скрипты новых типов заданий, правила оценивания и отрисовки;
 *   • демонстрационные данные demo/law-nrm-demo.js (трек DEMO).
 * Основная страница olympiad.html не меняется. Тест tests/olymp-nrm-demo.test.js
 * проверяет, что olympiad-demo.html совпадает с результатом этого скрипта.
 *
 * Запуск: node scripts/build-demo-page.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

/** Скрипты, которые добавляются после указанного скрипта olympiad.html. */
const INSERT_AFTER = [
  ['js/olymp/types.js', ['js/olymp/types/nrm-rows.js', 'js/olymp/types/analysis-grid.js', 'js/olymp/types/text-markup.js', 'js/olymp/types/reasoning-check.js', 'js/olymp/types/nrm-choice.js', 'js/olymp/types/formula-builder.js', 'js/olymp/types/systematize.js', 'js/olymp/types/link-map.js', 'js/olymp/types/short-answer.js', 'js/olymp/types/argument-check.js', 'js/olymp/types/compound.js']],
  ['js/olymp/scoring-rules.js', ['js/olymp/rules/components.js']],
  ['data/olympiads/practicum/social/law/concept.js', ['@DATA']],
  ['js/olymp/ui/views/matching.js', ['js/olymp/ui/views/nrm-common.js', 'js/olymp/ui/views/grid.js', 'js/olymp/ui/views/markup.js', 'js/olymp/ui/views/reasoning.js', 'js/olymp/ui/views/formula.js', 'js/olymp/ui/views/short.js', 'js/olymp/ui/views/sort.js', 'js/olymp/ui/views/links.js', 'js/olymp/ui/views/arguments.js', 'js/olymp/ui/views/compound.js']]
];

const PAGES = {
  demo: {
    file: 'olympiad-demo.html',
    title: 'Демо',
    data: ['demo/law-nrm-demo.js'],
    banner: '<strong>Демонстрация.</strong> Тестовые задания новых форматов; тексты норм не сверены с официальным источником. Это не публикуемая версия практикума.',
    reset: 'Сбросить демо-попытку',
    scope: 'DEMO/'
  },
  work: {
    file: 'olympiad-work.html',
    title: 'Рабочий банк',
    data: ['work/law-nrm/classify.js', 'work/law-nrm/mandatory.js', 'work/law-nrm/block-a.js', 'work/law-nrm/block-b.js', 'work/law-nrm/block-c.js', 'work/law-nrm/block-d.js'],
    banner: '<strong>Рабочий банк — не опубликован.</strong> Обязательная часть и дополнительные блоки на методической проверке; нормативные тексты не сверены с официальными источниками (задания помечены как неподтверждённые).',
    reset: 'Сбросить попытку рабочего банка',
    scope: 'PR/LAW/LAW-NR'
  },
  simple: {
    file: 'olympiad-nrm-simple.html',
    title: 'Классификация норм',
    data: ['work/law-nrm/classify.js', 'work/law-nrm-simple/common.js', 'work/law-nrm-simple/series-1.js', 'work/law-nrm-simple/series-2.js'],
    banner: '<strong>Тренажёр «Классификация правовых норм» — не опубликован.</strong> Задания на методической проверке; нормативные тексты не сверены с официальными источниками.',
    reset: 'Сбросить попытку тренажёра',
    scope: 'PR/LAW/LAW-NKL'
  }
};

function banner(page) {
  return [
    '  <div class="nrm-demo-banner" role="note">',
    '    <span>' + page.banner + '</span>',
    '    <button type="button" class="btn btn--ghost btn--sm" id="nrm-demo-reset">' + page.reset + '</button>',
    '  </div>'
  ].join('\n');
}

function resetScript(page) {
  return [
    '  <script>',
    '    // Сброс попыток только этой страницы; попытки других тем не затрагиваются.',
    "    document.getElementById('nrm-demo-reset').addEventListener('click', function () {",
    "      var KEY = 'olymp-trainer:attempts:v1';",
    '      try {',
    "        var all = JSON.parse(localStorage.getItem(KEY) || '{}');",
    "        Object.keys(all).forEach(function (scope) { if (scope.indexOf('" + page.scope + "') === 0) delete all[scope]; });",
    '        localStorage.setItem(KEY, JSON.stringify(all));',
    '      } catch (e) { /* хранилище недоступно — сбрасывать нечего */ }',
    "      window.location.hash = '#/';",
    '      window.location.reload();',
    '    });',
    '  </script>'
  ].join('\n');
}

function replaceOnce(html, search, replacement) {
  const at = html.indexOf(search);
  if (at === -1 || html.indexOf(search, at + search.length) !== -1) {
    throw new Error('Ожидалось ровно одно вхождение: ' + search);
  }
  return html.slice(0, at) + replacement + html.slice(at + search.length);
}

function build(kind) {
  const page = PAGES[kind || 'demo'];
  let html = fs.readFileSync(path.join(root, 'olympiad.html'), 'utf8');
  html = html.replace(/<title>([^<]*)<\/title>/, (m, title) => '<title>' + page.title + ' · ' + title + '</title>');
  html = replaceOnce(html, '<link rel="stylesheet" href="css/olymp.css">',
    '<link rel="stylesheet" href="css/olymp.css">\n  <link rel="stylesheet" href="css/olymp-nrm.css">');
  html = replaceOnce(html, '<body class="olymp">\n', '<body class="olymp">\n' + banner(page) + '\n');
  for (const [after, list] of INSERT_AFTER) {
    const scripts = list.flatMap((s) => (s === '@DATA' ? page.data : [s]));
    const tag = '<script src="' + after + '"></script>';
    html = replaceOnce(html, tag, tag + scripts.map((s) => '\n  <script src="' + s + '"></script>').join(''));
  }
  html = replaceOnce(html, '</body>', resetScript(page) + '\n</body>');
  return replaceOnce(html, '<!DOCTYPE html>\n',
    '<!DOCTYPE html>\n<!-- Сгенерировано scripts/build-demo-page.js из olympiad.html. Не редактировать вручную. -->\n');
}

if (require.main === module) {
  for (const kind of Object.keys(PAGES)) {
    fs.writeFileSync(path.join(root, PAGES[kind].file), build(kind));
    console.log(PAGES[kind].file + ' обновлён');
  }
}

module.exports = { build, INSERT_AFTER, PAGES };
