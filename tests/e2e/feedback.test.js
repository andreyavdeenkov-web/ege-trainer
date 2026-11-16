'use strict';

/**
 * Разбор позиций в тренировочном практикуме (решение преподавателя от 15.11.2026):
 * правильность варианта — нейтральная метка по формату задания, действие ученика — цвет и значок,
 * стандартный вердикт объяснения не повторяется, в соответствии не повторяется правильный тип.
 * Форматы: исключение двух позиций, выбор суждений, выбор из списка, соответствие.
 * Приоритет — смартфон в светлой теме; также компьютер и тёмная тема.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..');
const port = 20000 + Math.floor(Math.random() * 1000);
const base = `http://localhost:${port}/`;
const shotsDir = process.env.E2E_SCREENSHOTS || null;

const CONFIGS = [
  { name: 'mobile-light', viewport: { width: 360, height: 740 }, colorScheme: 'light', isMobile: true, hasTouch: true },
  { name: 'desktop-light', viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
  { name: 'mobile-dark', viewport: { width: 360, height: 740 }, colorScheme: 'dark', isMobile: true, hasTouch: true },
  { name: 'desktop-dark', viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }
];

const VERDICT = /^(Верно[.:]|Неверно[.:]|Выпадает( из общего ряда)?\.|Не выпадает( из общего ряда)?\.|Подходит\.|Не подходит\.)\s/;

let server;
let browser;

test.before(async () => {
  server = spawn(process.execPath, [path.join(root, 'scripts/serve.js'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
  });
  browser = await chromium.launch();
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

async function shot(locator, config, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await locator.screenshot({ path: path.join(shotsDir, `${config.name}-feedback-${name}.png`) });
}

async function keyOf(page, index) {
  return page.evaluate((i) => {
    const t = EGE.getTask(EGE.getPracticum('OBS-TYP-P01').taskIds[i]);
    return { matching: EGE.scoring.getTaskType(t) === 'matching', key: Array.from(EGE.scoring.getCorrect(t)) };
  }, index);
}

async function answer(page, numbers) {
  for (const n of numbers) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
  await page.click('#submit-btn');
  await page.waitForSelector('#feedback:not([hidden])');
}

/** Разбор каждой позиции: одна метка варианта, одна метка действия, объяснение без вердикта. */
async function checkStatements(page, expected) {
  const rows = await page.locator('#statements .statement').evaluateAll((lis) => lis.map((li) => ({
    n: Number(li.dataset.number),
    status: (li.className.match(/status-(\w+)/) || [])[1],
    truth: Array.from(li.querySelectorAll('.statement__truth'), (x) => x.textContent),
    action: Array.from(li.querySelectorAll('.statement__action'), (x) => x.textContent.replace(/^[✓✕!–]/, '')),
    explanation: (li.querySelector('.statement__explanation') || {}).textContent || '',
    truthColor: getComputedStyle(li.querySelector('.statement__truth')).color,
    actionColor: getComputedStyle(li.querySelector('.statement__action')).color,
    label: li.querySelector('.statement__btn').getAttribute('aria-label')
  })));
  for (const r of rows) {
    const want = expected[r.n];
    assert.equal(r.truth.length, 1, `позиция ${r.n}: одна метка варианта`);
    assert.equal(r.action.length, 1, `позиция ${r.n}: одна метка действия`);
    assert.equal(r.truth[0], want[0], `позиция ${r.n}: правильность варианта`);
    assert.equal(r.action[0], want[1], `позиция ${r.n}: действие ученика`);
    assert.ok(r.explanation.length > 0, `позиция ${r.n}: объяснение`);
    assert.doesNotMatch(r.explanation, VERDICT, `позиция ${r.n}: вердикт не повторяется`);
    assert.match(r.label, new RegExp(want[0] + '; ' + want[1].toLowerCase()), `позиция ${r.n}: подпись для экранного диктора`);
  }
  // Метка варианта нейтральна (один цвет у всех), цвет несёт только действие ученика.
  assert.equal(new Set(rows.map((r) => r.truthColor)).size, 1, 'метка варианта без цвета статуса');
  const colorOf = (s) => rows.find((r) => r.status === s);
  const hit = colorOf('hit');
  const wrong = colorOf('wrong');
  if (hit && wrong) assert.notEqual(hit.actionColor, wrong.actionColor, 'верный и ошибочный выбор различаются цветом');
  return rows;
}

for (const config of CONFIGS) {
  test(`${config.name}: разбор — исключение, суждения, выбор из списка, соответствие`, async () => {
    const context = await browser.newContext({
      viewport: config.viewport, colorScheme: config.colorScheme, isMobile: !!config.isMobile, hasTouch: !!config.hasTouch
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base);
    await page.locator('label.topic-option:has(input[name="section"][value="OBS"])').click();
    await page.locator('label.topic-option:has(input[name="topic"][value="OBS-TYP"])').click();
    const card = page.locator('[data-practicum="OBS-TYP-P01"]');
    await card.locator('.practicum-card__start').click();
    await card.locator('.practicum-card__confirm-yes').click();

    // № 1 — исключение (ключ 3 5): ответ 3 4 — выбрано верно, выбрано ошибочно, пропуск, верно не выбрано.
    await answer(page, [3, 4]);
    const excl = await checkStatements(page, {
      1: ['Не выпадает из общего ряда', 'Верно не выбрано'],
      2: ['Не выпадает из общего ряда', 'Верно не выбрано'],
      3: ['Выпадает из общего ряда', 'Выбрано верно'],
      4: ['Не выпадает из общего ряда', 'Выбрано ошибочно'],
      5: ['Выпадает из общего ряда', 'Пропущен верный вариант'],
      6: ['Не выпадает из общего ряда', 'Верно не выбрано']
    });
    assert.equal(excl.find((r) => r.n === 4).explanation, 'Замена ручного труда машинным — суть промышленного переворота.');
    assert.equal(await page.textContent('.points__value'), '0 из 1 балла', 'оценивание не изменилось');
    await shot(page.locator('#task-card'), config, '1-exclude');
    await page.click('#next-btn');

    // № 2 — суждения (ключ 2 4 5): ответ 1 2 4.
    await answer(page, [1, 2, 4]);
    const judg = await checkStatements(page, {
      1: ['Неверное суждение', 'Выбрано ошибочно'],
      2: ['Верное суждение', 'Выбрано верно'],
      3: ['Неверное суждение', 'Верно не выбрано'],
      4: ['Верное суждение', 'Выбрано верно'],
      5: ['Верное суждение', 'Пропущен верный вариант']
    });
    assert.match(judg.find((r) => r.n === 1).explanation, /^Основной фактор производства в традиционном обществе — земля/);
    assert.equal(await page.textContent('.points__value'), '1 из 2 баллов', 'одна цифра заменена (5 → 1) — одна ошибка по правилу ФИПИ');
    await shot(page.locator('#task-card'), config, '2-judgments');
    await page.click('#next-btn');

    // № 3, 4 — верно; № 5 — выбор из списка (ключ 1 2 5): ответ 1 2 5 — 2 балла.
    for (const i of [2, 3]) {
      const k = await keyOf(page, i);
      await answer(page, k.key);
      await page.click('#next-btn');
    }
    await answer(page, [1, 2, 5]);
    await checkStatements(page, {
      1: ['Подходит', 'Выбрано верно'], 2: ['Подходит', 'Выбрано верно'], 3: ['Не подходит', 'Верно не выбрано'],
      4: ['Не подходит', 'Верно не выбрано'], 5: ['Подходит', 'Выбрано верно'], 6: ['Не подходит', 'Верно не выбрано']
    });
    assert.equal(await page.textContent('.points__value'), '2 из 2 баллов');
    await shot(page.locator('#task-card'), config, '3-items');
    await page.click('#next-btn');

    // № 6–12 — верно; № 13 — соответствие (ключ 1 2 3 1 3): ошибка в позиции Д.
    for (let i = 5; i < 12; i++) {
      const k = await keyOf(page, i);
      await answer(page, k.key);
      await page.click('#next-btn');
    }
    for (const [row, n] of [[0, 1], [1, 2], [2, 3], [3, 1], [4, 2]]) await page.click(`.match-choice[data-row="${row}"][data-n="${n}"]`);
    await page.click('#submit-btn');
    await page.waitForSelector('#feedback:not([hidden])');
    const rows = await page.locator('#matching .match-row').evaluateAll((lis) => lis.map((li) => ({
      ok: li.classList.contains('status-right'),
      tag: li.querySelector('.statement__tag').textContent.replace(/^[✓✕]/, ''),
      lines: Array.from(li.querySelectorAll('.match-row__line'), (x) => x.textContent),
      explanation: li.querySelector('.statement__explanation').textContent
    })));
    assert.deepEqual(rows.map((r) => r.ok), [true, true, true, true, false]);
    assert.deepEqual(rows.map((r) => r.tag), ['Выбрано верно', 'Выбрано верно', 'Выбрано верно', 'Выбрано верно', 'Выбрано ошибочно']);
    for (const r of rows) assert.doesNotMatch(r.explanation, /^\d — /, 'правильный тип не повторяется в объяснении');
    assert.equal(rows[0].explanation, 'Большинство населения занято земледелием, а земля — основной фактор производства.');
    assert.deepEqual(rows[4].lines, ['Ваш ответ: 2 — индустриальное', 'Правильно: 3 — постиндустриальное']);
    assert.equal(await page.textContent('.points__value'), '0 из 1 балла', 'соответствие КИМ 3 — только за полностью верный ответ');
    await shot(page.locator('#task-card'), config, '4-matching');

    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth
    }));
    assert.ok(scroll <= client, 'нет горизонтальной прокрутки');
    assert.deepEqual(errors, []);
    await context.close();
  });
}
