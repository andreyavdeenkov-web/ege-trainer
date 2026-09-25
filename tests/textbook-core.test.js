'use strict';

/** Учебник: ядро — разметка текста, проверка глав, адреса. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, testCatalog, demoChapter } = require('./helpers/textbook.js');

function withDemo() {
  const TXT = loadCore();
  testCatalog(TXT);
  return TXT;
}

/** Ошибки главы, в которую внесена правка. */
function errorsOf(mutate) {
  const TXT = withDemo();
  const ch = demoChapter();
  mutate(ch);
  return TXT.validateChapter(ch).join('\n');
}

test('inline: выделение, термин, обычный текст', () => {
  const TXT = loadCore();
  const { tokens, errors } = TXT.inline.parse('Власть — **отношение**, см. [[ресурсы|средства власти]].');
  assert.deepEqual(errors, []);
  assert.deepEqual(tokens, [
    { type: 'text', text: 'Власть — ' },
    { type: 'strong', text: 'отношение' },
    { type: 'text', text: ', см. ' },
    { type: 'term', text: 'ресурсы', gloss: 'средства власти' },
    { type: 'text', text: '.' }
  ]);
  assert.equal(TXT.inline.plain('**А** и [[Б|пояснение]]'), 'А и Б');
});

test('inline: ошибки разметки находятся', () => {
  const TXT = loadCore();
  assert.match(TXT.inline.errors('незакрытое **выделение').join(), /незакрытое выделение/);
  assert.match(TXT.inline.errors('[[термин без пояснения]]').join(), /нет пояснения/);
  assert.match(TXT.inline.errors('[[термин|').join(), /незакрытый термин/);
  assert.match(TXT.inline.errors('лишние ]] скобки').join(), /лишние/);
  assert.match(TXT.inline.errors('**[[a|b]]**').join(), /внутри выделения/);
  assert.deepEqual(TXT.inline.errors('Обычный текст без разметки.'), []);
});

test('корректная глава проходит проверку и регистрируется', () => {
  const TXT = withDemo();
  const ch = demoChapter();
  assert.deepEqual(TXT.validateChapter(ch), []);
  TXT.defineChapter(ch);
  assert.equal(TXT.getChapter('demo'), ch);
  assert.equal(TXT.getChapter('later'), null);
  assert.equal(TXT.getArea('demo').id, 'TST');
  assert.throws(() => TXT.defineChapter(demoChapter()), /уже определена/);
});

test('проверка главы: типичные ошибки автора', () => {
  assert.match(errorsOf((c) => { c.id = 'nope'; }), /нет в каталоге/);
  assert.match(errorsOf((c) => { c.area = 'POL'; }), /относится к разделу TST/);
  assert.match(errorsOf((c) => { c.sections[1].id = 'read'; }), /повторяющийся id раздела/);
  assert.match(errorsOf((c) => { c.sections[0].blocks.push({ type: 'video' }); }), /неизвестный тип блока/);
  assert.match(errorsOf((c) => { c.sections[0].blocks[0].txt = 'опечатка'; }), /txt: неизвестное поле/);
  assert.match(errorsOf((c) => { c.sections[0].blocks[0].text = 'сломано **'; }), /незакрытое выделение/);
  assert.match(errorsOf((c) => { delete c.sections[1].blocks[0].id; }), /id: ожидается id/);
  assert.match(errorsOf((c) => { c.sections[1].blocks[1].id = 'guess'; }), /повторяющийся id блока/);
  assert.match(errorsOf((c) => { c.sections[1].blocks[1].items[1].id = 'one'; }), /повторяющийся id one/);
  assert.match(errorsOf((c) => { c.sections[1].blocks[1].items[0].answer = 5; }), /answer: ожидается целое число от 0 до 1/);
  assert.match(errorsOf((c) => { c.sections[3].blocks[0].questions[0].options[1].correct = true; }), /ровно один верный/);
  assert.match(errorsOf((c) => { c.sections[3].blocks[0].questions[1].options.forEach((o) => { o.correct = true; }); }), /хотя бы один неверный/);
  assert.match(errorsOf((c) => { delete c.sections[3].blocks[0].questions[0].explanation; }), /explanation/);
  assert.match(errorsOf((c) => { delete c.sections[3].blocks[0].questions[0].ref; }), /ref: ожидается id/);
  assert.match(errorsOf((c) => { c.sections[3].blocks[0].questions[0].ref = 'missing'; }), /несуществующий раздел missing/);
  assert.match(errorsOf((c) => { c.sections[3].blocks = [{ type: 'text', text: 'нет проверки' }]; }), /нужна финальная проверка/);
  assert.match(errorsOf((c) => { c.practice[0].kind = 'exam'; }), /kind: ожидается одно из: ege, olympiad/);
  assert.match(errorsOf((c) => { c.practice[0].href = 'https://example.com'; }), /страницу платформы/);
  assert.match(errorsOf((c) => { c.practice[0].href = 'javascript:alert(1)'; }), /страницу платформы/);
  assert.match(errorsOf((c) => { c.sections[2].level = 'expert'; }), /level/);
});

test('практика: допускаются ЕГЭ и олимпиадная, в любом количестве', () => {
  const TXT = withDemo();
  const ch = demoChapter();
  ch.practice.unshift({ kind: 'ege', title: 'ЕГЭ', label: 'К заданиям ЕГЭ', href: 'index.html' });
  assert.deepEqual(TXT.validateChapter(ch), []);
  assert.deepEqual(Object.keys(TXT.PRACTICE_KINDS), ['ege', 'olympiad']);
});

test('каталог: повторы и некорректные id отклоняются', () => {
  const TXT = loadCore();
  assert.throws(() => TXT.defineCatalog({ areas: [{ id: 'X', title: 'x', chapters: [] }] }), /некорректный id раздела/);
  const T2 = loadCore();
  assert.throws(() => T2.defineCatalog({
    areas: [{ id: 'AAA', title: 'a', chapters: [{ id: 'x', title: 'x' }] }, { id: 'BBB', title: 'b', chapters: [{ id: 'x', title: 'x' }] }]
  }), /повторяющаяся глава/);
});

test('задания раздела: ключи «раздел/блок/элемент»', () => {
  const TXT = withDemo();
  const ch = demoChapter();
  TXT.defineChapter(ch);
  assert.deepEqual(TXT.sectionKeys(ch.sections[0]), []);
  assert.deepEqual(TXT.sectionKeys(ch.sections[1]).map((k) => [k.key, k.graded]), [
    ['act/guess', false],
    ['act/sort/one', true],
    ['act/sort/two', true]
  ]);
  assert.equal(TXT.findFinalQuiz(ch).block.id, 'q');
  assert.equal(TXT.isCoreSection(ch.sections[2]), false);
  assert.equal(TXT.isCoreSection(ch.sections[4]), false);
});

test('router: разбор и сборка адресов', () => {
  const { router } = loadCore();
  assert.deepEqual(router.parse(''), { name: 'home' });
  assert.deepEqual(router.parse('#/'), { name: 'home' });
  assert.deepEqual(router.parse('#/power'), { name: 'chapter', chapter: 'power' });
  assert.deepEqual(router.parse('#/Power/Legitimacy/'), { name: 'section', chapter: 'power', section: 'legitimacy' });
  assert.deepEqual(router.parse('#/power/a/b'), { name: 'unknown' });
  assert.deepEqual(router.parse('#/<script>'), { name: 'unknown' });
  for (const hash of ['#/', '#/power', '#/power/weber']) assert.equal(router.format(router.parse(hash)), hash);
});
