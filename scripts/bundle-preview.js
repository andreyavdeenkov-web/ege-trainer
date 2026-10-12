#!/usr/bin/env node
'use strict';
/**
 * Собирает olympiad-work.html в один самодостаточный файл для закрытого предпросмотра
 * (стили и скрипты встроены; внешних загрузок нет). Основной сайт не затрагивается.
 *
 * Запуск: node scripts/bundle-preview.js <выходной файл>
 * Страница открывается на списке тем практикума по праву (трек PR): обязательная часть LAW-NRM и блоки А–Г.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = process.argv[2];
if (!out) { console.error('Укажите выходной файл'); process.exit(1); }

const html = fs.readFileSync(path.join(root, 'olympiad-work.html'), 'utf8');
const body = html.slice(html.indexOf('<body class="olymp">') + '<body class="olymp">'.length, html.lastIndexOf('</body>'));
const css = ['css/styles.css', 'css/olymp.css', 'css/olymp-nrm.css']
  .map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');

const inlined = body.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  if (/<\/script/i.test(code)) throw new Error('В ' + src + ' есть </script>');
  return '<script>/* ' + src + ' */\n' + code + '\n</script>';
});

const page = [
  '<title>Рабочий банк «Норма права»</title>',
  '<style>\n' + css + '\n</style>',
  // Классы и маршрут, которые в исходной странице задаёт <body class="olymp"> и ссылка темы.
  "<script>(function () { function mark() { document.body.classList.add('olymp'); } if (document.body) mark(); else document.addEventListener('DOMContentLoaded', mark); })(); document.documentElement.lang = 'ru'; if (!location.hash || location.hash === '#') { try { history.replaceState(null, '', '#/pr/LAW'); } catch (e) { location.hash = '#/pr/LAW'; } }</script>",
  inlined
].join('\n');
fs.writeFileSync(out, page);
console.log(out + ': ' + Math.round(page.length / 1024) + ' КБ');
