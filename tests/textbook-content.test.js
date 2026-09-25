'use strict';

/**
 * Учебник: проверка настоящего содержания. Загружает скрипты так же, как
 * браузер (в порядке <script> из textbook.html), и проверяет главы.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, CORE_SCRIPTS, pageScripts, loadBook } = require('./helpers/textbook.js');
const olymp = require('./helpers/olymp.js');

const scripts = pageScripts();

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/** Все строки главы (для проверок текста). */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

test('textbook.html: ядро в нужном порядке, затем данные и интерфейс; все файлы подключены', () => {
  assert.deepEqual(scripts.slice(0, CORE_SCRIPTS.length), CORE_SCRIPTS);
  for (const s of scripts) assert.ok(fs.existsSync(path.join(root, s)), `Скрипт ${s} не найден`);
  const data = scripts.filter((s) => s.startsWith('data/textbook/'));
  assert.equal(data[0], 'data/textbook/catalog.js', 'каталог подключается первым');
  const files = listJsFiles(path.join(root, 'data/textbook')).map((f) => path.relative(root, f).split(path.sep).join('/'));
  for (const f of files) assert.ok(data.includes(f), `Файл ${f} не подключён в textbook.html`);
  const lastData = scripts.lastIndexOf(data[data.length - 1]);
  assert.ok(scripts.slice(0, lastData).every((s) => !s.startsWith('js/textbook/ui/')), 'интерфейс подключается после данных');
  assert.equal(scripts[scripts.length - 1], 'js/textbook/app.js');
});

test('учебник не подключает тренажёры, тренажёры — учебник', () => {
  assert.ok(scripts.every((s) => s.startsWith('js/textbook/') || s.startsWith('data/textbook/')));
  for (const page of ['index.html', 'olympiad.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.ok(!/<script src="[^"]*textbook/.test(html), `${page} не должен подключать скрипты учебника`);
  }
});

test('у каждого типа блока есть и схема данных, и отрисовка', () => {
  const TXT = loadBook();
  assert.deepEqual(TXT.ui.blocks.list().sort(), TXT.schema.list().sort());
});

test('глава «Власть»: структура и драматургия', () => {
  const TXT = loadBook();
  const ch = TXT.getChapter('power');
  assert.ok(ch, 'глава power определена');
  assert.deepEqual(TXT.validateChapter(ch), []);
  assert.deepEqual(ch.sections.map((s) => s.id), [
    'intro', 'concept', 'relation', 'structure', 'resources', 'force',
    'legitimacy', 'weber', 'check', 'deeper', 'final', 'result'
  ]);
  const types = (id) => TXT.getSection(ch, id).blocks.map((b) => b.type);
  assert.ok(types('intro').includes('predict'), 'вход через проблему и версию ученика');
  assert.ok(types('concept').includes('assemble'), 'понятие собирается');
  assert.ok(types('structure').includes('flow'), 'интерактивная схема');
  assert.ok(types('resources').includes('cards'), 'карточки ресурсов');
  assert.ok(types('force').includes('classify'), '«власть или сила?»');
  assert.ok(types('weber').includes('cards'), 'типы господства');
  assert.ok(types('check').includes('quiz'));
  assert.equal(TXT.getSection(ch, 'deeper').level, 'olympiad');
  assert.ok(types('deeper').includes('ladder'), 'олимпиадный раздел — лестница моделей');
  assert.deepEqual(types('result'), ['summary', 'practice']);
});

test('глава «Власть»: лестница моделей Даль → Бахрах и Барац → Льюкс → Фуко', () => {
  const TXT = loadBook();
  const ladder = TXT.getSection(TXT.getChapter('power'), 'deeper').blocks.find((b) => b.type === 'ladder');
  assert.deepEqual(ladder.steps.map((s) => s.id), ['dahl', 'bachrach-baratz', 'lukes', 'foucault']);
  assert.deepEqual(ladder.steps.map((s) => !!s.diffuse), [false, false, false, true]);
});

test('глава «Власть»: веберовские карточки — объяснение, пример, признак, ошибка', () => {
  const TXT = loadBook();
  const cards = TXT.getSection(TXT.getChapter('power'), 'weber').blocks.find((b) => b.type === 'cards');
  assert.deepEqual(cards.items.map((i) => i.id), ['traditional', 'charismatic', 'legal']);
  for (const item of cards.items) {
    assert.deepEqual(item.steps.map((s) => s.label), ['Объяснение', 'Пример', 'Признак', 'Типичная ошибка']);
  }
});

test('финальная проверка ссылается на разделы и охватывает основную часть', () => {
  const TXT = loadBook();
  const ch = TXT.getChapter('power');
  const quiz = TXT.findFinalQuiz(ch).block;
  const refs = new Set(quiz.questions.map((q) => q.ref));
  for (const s of ch.sections.filter((x) => TXT.isCoreSection(x) && !['intro', 'check', 'final'].includes(x.id))) {
    assert.ok(refs.has(s.id), `в финальной проверке нет вопроса по разделу ${s.id}`);
  }
  assert.ok(refs.has('deeper'), 'есть вопросы олимпиадного уровня');
});

test('верные ответы в вопросах с одним ответом стоят на разных позициях', () => {
  const TXT = loadBook();
  const ch = TXT.getChapter('power');
  const positions = [];
  ch.sections.forEach((s) => s.blocks.forEach((b) => {
    if (b.type === 'quiz') b.questions.filter((q) => q.type === 'single').forEach((q) => positions.push(q.options.findIndex((o) => o.correct)));
    if (b.type === 'ladder') b.steps.forEach((st) => positions.push(st.question.options.findIndex((o) => o.correct)));
  }));
  assert.ok(new Set(positions).size >= 3, 'верные ответы стоят на разных позициях: ' + positions.join(','));
});

test('тексты главы: без эмодзи и HTML', () => {
  const TXT = loadBook();
  for (const s of strings(TXT.getChapter('power'))) {
    assert.ok(!/\p{Extended_Pictographic}/u.test(s.replace(/[→↓]/g, '')), 'эмодзи: ' + s);
    assert.ok(!/<[a-z/][^>]*>/i.test(s), 'HTML в тексте: ' + s);
  }
});

test('переход к практике ведёт в существующую тему олимпиадного тренажёра', () => {
  const TXT = loadBook();
  const OLY = olymp.loadBank();
  const ch = TXT.getChapter('power');
  const olympiad = ch.practice.filter((p) => p.kind === 'olympiad');
  assert.equal(olympiad.length, 1);
  assert.equal(olympiad[0].href, 'olympiad.html#/hp/POL/POL-POW');
  for (const p of olympiad) {
    const route = OLY.ui.router.parse(p.href.slice(p.href.indexOf('#')));
    assert.equal(route.name, 'setup');
    const tasks = OLY.query({ olympiad: route.olympiad, subject: 'social', discipline: route.discipline, topic: route.topic });
    assert.ok(tasks.length > 0, 'в теме тренажёра есть задания');
  }
});
