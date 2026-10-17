'use strict';

/** Единая навигация ЕГЭ | Олимпиады в шапке обеих страниц. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function siteNav(html) {
  const header = html.slice(html.indexOf('<header class="topbar">'), html.indexOf('</header>'));
  const m = header.match(/<nav class="site-nav" aria-label="Направления">([\s\S]*?)<\/nav>/);
  assert.ok(m, 'навигация находится в шапке');
  return [...m[1].matchAll(/<a class="site-nav__link" href="([^"]+)"( aria-current="page")?>([^<]+)<\/a>/g)]
    .map(([, href, current, label]) => ({ href, current: Boolean(current), label }));
}

for (const [file, active] of [['index.html', 'ЕГЭ'], ['olympiad.html', 'Олимпиады']]) {
  test(`${file}: ссылки ЕГЭ | Олимпиады, активен «${active}»`, () => {
    const html = read(file);
    assert.deepEqual(siteNav(html), [
      { href: 'index.html', current: active === 'ЕГЭ', label: 'ЕГЭ' },
      { href: 'olympiad.html', current: active === 'Олимпиады', label: 'Олимпиады' }
    ]);
    assert.match(html, /<span class="brand__title">Андрей Авдеенков<\/span>/);
  });
}

test('«ЕГЭ» ведёт на index.html, а не на адрес папки: работает и на домене, и на тестовой копии (Githack)', () => {
  for (const file of ['index.html', 'olympiad.html', 'preview-cognition.html', 'preview-poznanie.html']) {
    const links = siteNav(read(file));
    assert.equal(links.find((l) => l.label === 'ЕГЭ').href, 'index.html', file);
    assert.equal(links.find((l) => l.label === 'Олимпиады').href, 'olympiad.html', file);
    assert.doesNotMatch(read(file), /href="\.\/"/, `${file}: ссылок на адрес папки нет`);
  }
});
