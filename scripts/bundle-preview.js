#!/usr/bin/env node
'use strict';
/**
 * Собирает olympiad-work.html в один самодостаточный файл для закрытого предпросмотра
 * (стили и скрипты встроены; внешних загрузок нет). Основной сайт не затрагивается.
 *
 * Запуск: node scripts/bundle-preview.js <выходной файл>
 * Страница открывается сразу на теме LAW-NRM трека PR (обязательная часть практикума).
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
  "<script>document.body.classList.add('olymp'); document.documentElement.lang = 'ru'; if (!location.hash || location.hash === '#') { try { history.replaceState(null, '', '#/pr/LAW/LAW-NRM'); } catch (e) { location.hash = '#/pr/LAW/LAW-NRM'; } }</script>",
  inlined
].join('\n');
fs.writeFileSync(out, page);
console.log(out + ': ' + Math.round(page.length / 1024) + ' КБ');
