'use strict';

/**
 * Браузерные тесты тренажёра ЕГЭ (Playwright + Chromium):
 * компьютер и смартфон, светлая и тёмная темы. Проверяют три формата,
 * фильтры раздела, темы и формата, повторное прохождение, отсутствие
 * горизонтальной прокрутки и ошибок в консоли.
 *
 * Запуск: npm run test:e2e
 * Снимки экрана: E2E_SCREENSHOTS=путь/к/папке npm run test:e2e
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..');
const port = 18000 + Math.floor(Math.random() * 1000);
const base = `http://localhost:${port}/`;
const shotsDir = process.env.E2E_SCREENSHOTS || null;

const CONFIGS = [
  { name: 'desktop-light', viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
  { name: 'desktop-dark', viewport: { width: 1280, height: 900 }, colorScheme: 'dark' },
  { name: 'mobile-light', viewport: { width: 360, height: 740 }, colorScheme: 'light', isMobile: true, hasTouch: true },
  { name: 'mobile-dark', viewport: { width: 360, height: 740 }, colorScheme: 'dark', isMobile: true, hasTouch: true }
];

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

/** Новая страница с журналом ошибок консоли. withFixture — подставить тестовые задания схемы 2. */
async function open(config, options = {}) {
  const context = await browser.newContext({
    viewport: config.viewport,
    colorScheme: config.colorScheme,
    isMobile: !!config.isMobile,
    hasTouch: !!config.hasTouch
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  if (options.withFixture) {
    await page.route(base, async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace('<script src="js/task-view.js"></script>',
        '<script src="tests/e2e/fixture-tasks.js"></script>\n  <script src="js/task-view.js"></script>');
      await route.fulfill({ response, body: html });
    });
  }
  if (options.storage) {
    await page.addInitScript((value) => localStorage.setItem('ege-trainer:settings', value), options.storage);
  }
  await page.goto(base);
  return { page, context, errors };
}

async function shot(page, config, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `${config.name}-${name}.png`), fullPage: true });
}

async function assertNoHorizontalScroll(page, where) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth
  }));
  assert.ok(scroll <= client, `${where}: горизонтальная прокрутка (${scroll} > ${client})`);
}

const radio = (page, name, value) => page.locator(`input[name="${name}"][value="${value}"]`);
const pick = (page, name, value) => page.locator(`label.topic-option:has(input[name="${name}"][value="${value}"])`).click();

/** Ключ текущего задания: ищем задание банка по тексту вопроса на экране. */
async function currentKey(page) {
  return page.evaluate(() => {
    const q = document.getElementById('task-question').textContent;
    const task = window.EGE.tasks.find((t) => t.question === q);
    return { id: task.id, type: window.EGE.scoring.getTaskType(task), key: window.EGE.scoring.getCorrect(task) };
  });
}

for (const config of CONFIGS) {
  test(`${config.name}: стартовый экран, тема и фильтры`, async () => {
    const { page, context, errors } = await open(config);
    await assert.doesNotReject(page.waitForSelector('#start-title'));
    assert.equal(await page.textContent('#start-title'),
      'Практикуй задания ЕГЭ по обществознанию и разбирай каждую ошибку');

    // Тема оформления применилась: фон страницы тёмный только в тёмной теме.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    const dark = (r + g + b) / 3 < 100;
    assert.equal(dark, config.colorScheme === 'dark', `фон ${bg}`);

    // Четыре формата, по умолчанию — все.
    assert.deepEqual(await page.locator('#format-options .topic-option__title').allTextContents(),
      ['Все типы заданий', 'Выбор нескольких ответов', 'Два лишних термина', 'Установление соответствия']);
    assert.ok(await radio(page, 'format', 'all').isChecked());
    await assertNoHorizontalScroll(page, 'старт');
    await shot(page, config, '1-start');

    // Раздел → тема → формат.
    await pick(page, 'section', 'OBS');
    await pick(page, 'topic', 'OBS-ACT');
    await pick(page, 'format', 'exclude-two');
    assert.equal(await page.textContent('#start-btn'), 'Начать: 1 задание');
    // Счётчик темы показывает задания выбранного формата.
    assert.match(await page.locator('label.topic-option:has(input[value="OBS-ACT"]) .topic-option__count').textContent(), /^1 задание$/);

    // Смена раздела: тема сбрасывается, формат сохраняется; в разделе нет заданий формата.
    await pick(page, 'section', 'SOC');
    assert.ok(await radio(page, 'topic', 'all').isChecked());
    assert.ok(await radio(page, 'format', 'exclude-two').isChecked());
    assert.ok(await page.locator('#start-btn').isDisabled());
    assert.equal(await page.textContent('#start-btn'), 'Здесь нет заданий формата «Два лишних термина»');
    // Пустой формат недоступен, выбранный — нет (с него можно уйти).
    assert.ok(await radio(page, 'format', 'matching').isDisabled());
    assert.ok(!(await radio(page, 'format', 'exclude-two').isDisabled()));
    await shot(page, config, '2-filter-empty');

    await pick(page, 'format', 'all');
    assert.ok(!(await page.locator('#start-btn').isDisabled()));

    // Выбор запоминается.
    await pick(page, 'format', 'multiple');
    await page.reload();
    assert.ok(await radio(page, 'format', 'multiple').isChecked());
    assert.ok(await radio(page, 'section', 'SOC').isChecked());

    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: старые настройки без формата и неизвестный формат`, async () => {
    for (const storage of [JSON.stringify({ section: 'OBS', topic: 'OBS-ACT' }), JSON.stringify({ section: 'OBS', topic: 'all', format: 'essay' })]) {
      const { page, context, errors } = await open(config, { storage });
      assert.ok(await radio(page, 'format', 'all').isChecked());
      assert.ok(await radio(page, 'section', 'OBS').isChecked());
      assert.deepEqual(errors, []);
      await context.close();
    }
  });

  test(`${config.name}: два лишних термина (клавиатура), ровно две позиции`, async () => {
    const { page, context, errors } = await open(config);
    await pick(page, 'section', 'OBS');
    await pick(page, 'topic', 'OBS-ACT');
    await pick(page, 'format', 'exclude-two');
    await page.click('#start-btn');

    const { type, key } = await currentKey(page);
    assert.equal(type, 'exclude-two');
    assert.match(await page.textContent('#task-hint'), /Выбрано: 0 из 2/);

    const wrong = [1, 2, 3, 4, 5, 6].find((n) => !key.includes(n));
    await page.keyboard.press(String(key[0]));
    await page.keyboard.press(String(wrong));
    assert.match(await page.textContent('#task-hint'), /Выбрано: 2 из 2/);
    // Третью позицию отметить нельзя.
    await page.keyboard.press(String(key[1]));
    assert.match(await page.textContent('#task-hint'), /только две позиции/);
    assert.equal(await page.locator('#statements .statement.is-selected').count(), 2);
    // Снимаем ошибочную и отмечаем верную.
    await page.keyboard.press(String(wrong));
    await page.keyboard.press(String(key[1]));
    await assertNoHorizontalScroll(page, 'задание exclude-two');
    await shot(page, config, '3-exclude-draft');

    await page.keyboard.press('Enter');
    await page.waitForSelector('#feedback:not([hidden])');
    assert.equal(await page.textContent('.points__value'), '1 из 1 балла');
    assert.equal(await page.locator('#statements .statement.status-hit').count(), 2);
    await shot(page, config, '4-exclude-answered');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: соответствие — частичный ответ не засчитывается, верный — 2 балла`, async () => {
    const { page, context, errors } = await open(config);
    await pick(page, 'section', 'OBS');
    await pick(page, 'topic', 'all');
    await pick(page, 'format', 'matching');
    assert.equal(await page.textContent('#start-btn'), 'Начать: 3 задания');
    await page.click('#start-btn');

    const { type, key } = await currentKey(page);
    assert.equal(type, 'matching');
    for (let row = 0; row < key.length - 1; row++) {
      await page.click(`.match-choice[data-row="${row}"][data-n="${key[row]}"]`);
    }
    assert.ok(await page.locator('#submit-btn').isDisabled(), 'не все позиции заполнены');
    await page.click(`.match-choice[data-row="${key.length - 1}"][data-n="${key[key.length - 1]}"]`);
    assert.ok(!(await page.locator('#submit-btn').isDisabled()));
    await assertNoHorizontalScroll(page, 'задание matching');
    await shot(page, config, '5-matching-draft');

    await page.click('#submit-btn');
    await page.waitForSelector('#feedback:not([hidden])');
    assert.equal(await page.textContent('.points__value'), '2 из 2 баллов');
    assert.equal(await page.locator('.match-row.status-right').count(), key.length);
    await shot(page, config, '6-matching-answered');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: выбор нескольких ответов, итоги и повторное прохождение`, async () => {
    const { page, context, errors } = await open(config);
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-FAM');
    await pick(page, 'format', 'multiple');
    await page.click('#start-btn');

    const { type, key } = await currentKey(page);
    assert.equal(type, 'multiple');
    // Один пропущенный верный ответ — 1 балл.
    for (const n of key.slice(1)) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
    await page.click('#submit-btn');
    await page.waitForSelector('#feedback:not([hidden])');
    assert.equal(await page.textContent('.points__value'), '1 из 2 баллов');
    assert.equal(await page.locator('#statements .statement.status-missed').count(), 1);
    // У старых заданий нет source — блок пояснений скрыт.
    assert.ok(await page.locator('#task-notes').isHidden());

    await page.click('#next-btn');
    await page.waitForSelector('#screen-result:not([hidden])');
    assert.equal(await page.textContent('#result-score'), '1 из 2 баллов');
    await assertNoHorizontalScroll(page, 'итоги');
    await shot(page, config, '7-result');

    await page.click('#restart-btn');
    await page.waitForSelector('#screen-quiz:not([hidden])');
    assert.match(await page.textContent('#progress-label'), /^Задание 1 из 1 · выполнено 0$/);
    assert.ok(await page.locator('#feedback').isHidden());
    assert.equal(await page.locator('#statements .statement.is-selected').count(), 0);
    for (const n of key) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
    await page.click('#submit-btn');
    assert.equal(await page.textContent('.points__value'), '2 из 2 баллов');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: поля схемы 2 в разборе (тестовые задания)`, async () => {
    const { page, context, errors } = await open(config, { withFixture: true });
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-FAM');
    await pick(page, 'format', 'exclude-two');
    await page.click('#start-btn');
    for (const n of [2, 5]) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
    await page.click('#submit-btn');
    await page.waitForSelector('#task-notes:not([hidden])');
    assert.match(await page.textContent('#task-notes .task-notes__feature'), /Общий признак ряда.*Тестовый общий признак/s);
    assert.equal(await page.textContent('#task-notes .task-notes__source'),
      'Источник: Тестовое пособие, 2025, с. 1, № 1 (формулировка адаптирована)');
    assert.match(await page.textContent('#statements .statement[data-number="2"] .statement__mistake'), /Типичная ошибка: Тестовая типичная ошибка/);
    await assertNoHorizontalScroll(page, 'разбор exclude-two');
    await shot(page, config, '8-schema2-exclude');

    // Итоги: пояснения есть и в разборе.
    await page.click('#next-btn');
    await page.waitForSelector('#screen-result:not([hidden])');
    await page.click('#expand-all-btn');
    assert.match(await page.textContent('#review-list .task-notes__source'), /Тестовое пособие/);

    // Соответствие с повторами, 7 вариантами и длинной формулировкой.
    await page.click('#home-btn');
    await pick(page, 'format', 'matching');
    await page.click('#start-btn');
    const { key } = await currentKey(page);
    for (let row = 0; row < key.length; row++) {
      await page.click(`.match-choice[data-row="${row}"][data-n="${key[row]}"]`);
    }
    await assertNoHorizontalScroll(page, 'matching, 7 вариантов');
    await shot(page, config, '9-schema2-matching-draft');
    await page.click('#submit-btn');
    assert.equal(await page.textContent('#task-notes .task-notes__source'), 'Авторское задание');
    assert.match(await page.textContent('.match-row[data-row="0"] .statement__mistake'), /Тестовая ошибка соответствия/);
    assert.ok(await page.locator('#task-notes .task-notes__feature').count() === 0, 'общий признак только у exclude-two');
    await assertNoHorizontalScroll(page, 'разбор matching');
    await shot(page, config, '10-schema2-matching-answered');
    assert.deepEqual(errors, []);
    await context.close();
  });
}
