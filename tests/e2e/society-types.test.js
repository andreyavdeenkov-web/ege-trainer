'use strict';

/**
 * Браузерные тесты практикума «Типы обществ» (OBS-TYP-P01): режимы «Обучение» и «Экзамен»
 * на компьютере и смартфоне, в светлой и тёмной темах. Проверяют карточку практикума,
 * проверку и повтор в обучении, свободную навигацию, изменение и пропуск ответов в экзамене,
 * отсутствие ключей и разбора в разметке до завершения, продолжение после перезагрузки,
 * итоги, учебную аналитику, клавиатуру, отсутствие горизонтальной прокрутки и ошибок консоли.
 *
 * Запуск: npm run test:e2e
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..');
const port = 19000 + Math.floor(Math.random() * 1000);
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

async function open(config) {
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
  await page.goto(base);
  return { page, context, errors };
}

async function shot(page, config, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `${config.name}-typ-${name}.png`), fullPage: true });
}

async function assertNoHorizontalScroll(page, where) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth
  }));
  assert.ok(scroll <= client, `${where}: горизонтальная прокрутка (${scroll} > ${client})`);
}

const pick = (page, name, value) => page.locator(`label.topic-option:has(input[name="${name}"][value="${value}"])`).click();

async function openTopic(page) {
  await pick(page, 'section', 'OBS');
  await pick(page, 'topic', 'OBS-TYP');
  await page.locator('[data-practicum="OBS-TYP-P01"]').waitFor();
}

const modeBlock = (page, mode) => page.locator(`[data-practicum="OBS-TYP-P01"] .mode-option[data-mode="${mode}"]`);

/** Ключ задания, показанного на экране режима (из банка — только для теста). */
function keyOf(page, index) {
  return page.evaluate((i) => {
    const t = window.EGE.getTask(window.EGE.getPracticum('OBS-TYP-P01').taskIds[i]);
    return { type: window.EGE.scoring.getTaskType(t), key: Array.from(window.EGE.scoring.getCorrect(t)) };
  }, index);
}

async function answer(page, { type, key }) {
  if (type === 'matching') {
    for (let row = 0; row < key.length; row++) await page.click(`#mode-matching .match-choice[data-row="${row}"][data-n="${key[row]}"]`);
  } else {
    for (const n of key) await page.click(`#mode-statements .statement[data-number="${n}"] .statement__btn`);
  }
}

/** В разметке экрана режима нет ключей, статусов и объяснений. */
async function assertNothingRevealed(page, where) {
  const html = await page.locator('#screen-mode').innerHTML();
  assert.doesNotMatch(html, /status-(hit|missed|wrong|skip|right)/, `${where}: статусы позиций`);
  assert.doesNotMatch(html, /statement__explanation|statement__trap|Правильн|Разбор вашего ответа|task-notes/, `${where}: разбор`);
  assert.doesNotMatch(html, /Средний класс \(собственники|Выпадает\.|Не подходит\./, `${where}: тексты объяснений`);
  assert.equal(await page.locator('#mode-feedback').count(), 0, `${where}: блок баллов`);
}

for (const config of CONFIGS) {
  test(`${config.name}: «Типы обществ» — карточка с двумя режимами`, async () => {
    const { page, context, errors } = await open(config);
    await openTopic(page);
    const card = page.locator('[data-practicum="OBS-TYP-P01"]');
    assert.match(await card.locator('.practicum-card__meta').textContent(), /25 заданий · максимум 35 баллов/);
    assert.equal(await modeBlock(page, 'learn').locator('.mode-option__title').textContent(), 'Обучение');
    assert.equal(await modeBlock(page, 'exam').locator('.mode-option__title').textContent(), 'Экзамен');
    assert.equal(await card.locator('.mode-option__start').count(), 2);
    await assertNoHorizontalScroll(page, 'карточка');
    await shot(page, config, 'card');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: обучение — проверка, разбор, повтор, переход, продолжение после перезагрузки`, async () => {
    const { page, context, errors } = await open(config);
    await openTopic(page);
    await modeBlock(page, 'learn').locator('.mode-option__start').click();
    assert.match(await page.textContent('#mode-progress-label'), /^Задание 1 из 25/);
    assert.ok(await page.isDisabled('#mode-primary'), 'без ответа проверить нельзя');
    // № 1 (ключ 2, 4): ответ 2, 3 — ошибка.
    await page.click('#mode-statements .statement[data-number="2"] .statement__btn');
    await page.click('#mode-statements .statement[data-number="3"] .statement__btn');
    await assertNothingRevealed(page, 'обучение до проверки');
    await page.click('#mode-primary');
    const fb = await page.textContent('#mode-feedback');
    assert.match(fb, /0 из 1 балла/);
    assert.match(fb, /Правильный ответ:\s*2, 4/);
    assert.match(await page.textContent('#mode-check'), /Разбор вашего ответа[\s\S]*Позиция 3[\s\S]*относится к ряду/);
    assert.match(await page.textContent('#mode-check'), /Ловушка: Подмена типа общества/);
    assert.match(await page.textContent('#mode-check'), /Проверяемое знание/);
    assert.equal(await page.locator('#mode-statements .statement__explanation').count(), 6, 'объяснение каждой позиции');
    assert.equal(await page.locator('#mode-statements .status-wrong').count(), 1);
    await assertNoHorizontalScroll(page, 'обучение, разбор');
    await shot(page, config, 'learn-check');

    // Повтор: верный ответ.
    await page.click('#mode-retry');
    assert.equal(await page.locator('#mode-feedback').count(), 0);
    await page.click('#mode-statements .statement[data-number="2"] .statement__btn');
    await page.click('#mode-statements .statement[data-number="4"] .statement__btn');
    await page.click('#mode-primary');
    assert.match(await page.textContent('#mode-feedback'), /1 из 1 балла/);
    assert.match(await page.textContent('#mode-check'), /Попытка 2\. В итог идёт первая проверка: 0 из 1 балла/);
    assert.match(await page.textContent('#mode-pill'), /Баллы: 0 из 1/);

    await page.click('#mode-primary'); // следующее задание
    assert.match(await page.textContent('#mode-progress-label'), /^Задание 2 из 25 · проверено 1/);
    assert.ok(await page.locator('#mode-nav li:nth-child(3) button').isDisabled(), 'вперёд к непроверенным нельзя');
    await page.click('#mode-statements .statement[data-number="4"] .statement__btn');

    // Перезагрузка: продолжение с того же места и с той же отметкой.
    await page.reload();
    await openTopic(page);
    assert.match(await modeBlock(page, 'learn').textContent(), /Не завершено: проверено 1 из 25/);
    assert.match(await page.locator('#topic-options label:has(input[value="OBS-TYP"])').textContent(), /есть незавершённый/);
    await modeBlock(page, 'learn').locator('.mode-option__continue').click();
    assert.match(await page.textContent('#mode-progress-label'), /^Задание 2 из 25/);
    assert.equal(await page.getAttribute('#mode-statements .statement[data-number="4"] .statement__btn', 'aria-checked'), 'true');
    assert.ok(await page.locator('#mode-nav li:nth-child(1) button.points--full').count(), 'задание 1 отмечено по последней проверке');

    // Клавиатура: цифры отмечают (4 уже отмечена до перезагрузки), Enter проверяет и переходит дальше.
    await page.keyboard.press('6');
    assert.equal(await page.getAttribute('#mode-statements .statement[data-number="6"] .statement__btn', 'aria-checked'), 'true');
    await page.keyboard.press('Enter');
    assert.match(await page.textContent('#mode-feedback'), /1 из 1 балла/);
    await page.keyboard.press('Enter');
    assert.match(await page.textContent('#mode-progress-label'), /^Задание 3 из 25/);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: обучение — все 25 заданий, итоги по первой проверке и аналитика`, async () => {
    const { page, context, errors } = await open(config);
    await openTopic(page);
    await modeBlock(page, 'learn').locator('.mode-option__start').click();
    for (let i = 0; i < 25; i++) {
      const k = await keyOf(page, i);
      // № 15 — с одной ошибкой (1 балл из 2), остальные — верно.
      if (i === 14) await answer(page, { type: k.type, key: k.key.slice(0, -1) });
      else await answer(page, k);
      await page.click('#mode-primary');
      await page.click('#mode-primary');
    }
    assert.match(await page.textContent('#mode-result-score'), /34 из 35 баллов/);
    const stats = await page.textContent('#mode-stats');
    assert.match(stats, /24\s*полностью верно/);
    assert.match(stats, /1\s*частично верно/);
    assert.match(await page.textContent('#screen-mode-result'), /Баллы — по первой проверке/);
    assert.equal(await page.locator('#mode-an-format .meter').count(), 4);
    assert.equal(await page.locator('#mode-an-criteria .meter').count(), 6);
    assert.equal(await page.locator('#mode-an-level .meter').count(), 3);
    assert.equal(await page.locator('#mode-an-action .meter').count(), 3);
    assert.match(await page.textContent('#mode-analytics'), /не диагностика/);
    assert.match(await page.textContent('#mode-an-format [data-group="MULTI"]'), /11 из 12 баллов/);
    assert.equal(await page.locator('#mode-review-list .review-item').count(), 1, 'по умолчанию — задания с ошибками');
    await assertNoHorizontalScroll(page, 'итоги обучения');
    await shot(page, config, 'learn-result');
    await page.click('.mode-result__home');
    assert.match(await modeBlock(page, 'learn').textContent(), /Последний результат: 34 из 35 баллов/);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: экзамен — навигация, изменение и пропуск ответов, без раскрытия ключей, итоги`, async () => {
    const { page, context, errors } = await open(config);
    await openTopic(page);
    await modeBlock(page, 'exam').locator('.mode-option__start').click();
    await assertNothingRevealed(page, 'экзамен, начало');
    // № 1: сначала неверно, потом исправлено.
    await page.click('#mode-statements .statement[data-number="2"] .statement__btn');
    await page.click('#mode-statements .statement[data-number="3"] .statement__btn');
    await page.click('#mode-statements .statement[data-number="3"] .statement__btn');
    await page.click('#mode-statements .statement[data-number="4"] .statement__btn');
    await assertNothingRevealed(page, 'экзамен, задание с ответом');
    // Пропуск к № 7 по полосе номеров, соответствие — неполное и затем полное.
    await page.click('#mode-nav li:nth-child(7) button');
    assert.match(await page.textContent('#mode-progress-label'), /^Задание 7 из 25 · отвечено 1/);
    await answer(page, await keyOf(page, 6));
    await assertNothingRevealed(page, 'экзамен, соответствие');
    // Клавиатура: стрелка вправо — № 8; Enter — следующее.
    await page.keyboard.press('ArrowRight');
    assert.match(await page.textContent('#mode-progress-label'), /^Задание 8 из 25/);
    await page.keyboard.press('Enter');
    assert.match(await page.textContent('#mode-progress-label'), /^Задание 9 из 25/);
    // № 25 (последнее): неполный ответ — оценивается как есть.
    await page.click('#mode-nav li:nth-child(25) button');
    await page.click('#mode-matching .match-choice[data-row="0"][data-n="1"]');
    assert.match(await page.textContent('#mode-pill'), /Без ответа: 22/);
    assert.ok(await page.locator('#mode-nav li:nth-child(1) button.is-answered').count());
    await assertNoHorizontalScroll(page, 'экзамен');
    await shot(page, config, 'exam');

    // Перезагрузка — ответы на месте.
    await page.reload();
    await openTopic(page);
    assert.match(await modeBlock(page, 'exam').textContent(), /Не завершено: отвечено 3 из 25/);
    await modeBlock(page, 'exam').locator('.mode-option__continue').click();
    assert.match(await page.textContent('#mode-progress-label'), /^Задание 25 из 25/);
    await page.click('#mode-nav li:nth-child(1) button');
    assert.equal(await page.getAttribute('#mode-statements .statement[data-number="4"] .statement__btn', 'aria-checked'), 'true');
    assert.equal(await page.getAttribute('#mode-statements .statement[data-number="3"] .statement__btn', 'aria-checked'), 'false');

    // Завершение: подтверждение с номерами пропущенных заданий.
    await page.click('.mode-finish__open');
    const confirmText = await page.textContent('#mode-finish-text');
    assert.match(confirmText, /Без ответа останутся задания: 2, 3, 4, 5, 6, 8,/);
    await page.click('.mode-finish__cancel');
    await assertNothingRevealed(page, 'экзамен после отмены завершения');
    await page.click('.mode-finish__open');
    await shot(page, config, 'exam-confirm');
    await page.click('.mode-finish__confirm');

    assert.match(await page.textContent('#mode-result-title'), /Экзамен завершён/);
    assert.match(await page.textContent('#mode-result-score'), /2 из 35 баллов/);
    const stats = await page.textContent('#mode-stats');
    assert.match(stats, /2\s*полностью верно/);
    assert.match(stats, /23\s*0 баллов, из них без ответа: 22/);
    assert.match(await page.textContent('#mode-review'), /Без ответа \(22\)/);
    await page.click('#mode-review label:has(input[value="skipped"])');
    assert.equal(await page.locator('#mode-review-list .review-item').count(), 22);
    // Разбор открыт после завершения.
    await page.click('#mode-review label:has(input[value="all"])');
    const first = page.locator('#mode-review-list details[data-task="OBS-TYP-001"]');
    await first.locator('summary').click();
    assert.match(await first.textContent(), /Средний класс \(собственники/);
    assert.match(await first.textContent(), /Ловушка/);
    await assertNoHorizontalScroll(page, 'итоги экзамена');
    await shot(page, config, 'exam-result');
    await page.click('.mode-result__home');
    assert.match(await modeBlock(page, 'exam').textContent(), /Последний результат: 2 из 35 баллов/);
    assert.ok(await modeBlock(page, 'exam').locator('.mode-option__start').count(), 'экзамен можно пройти снова');
    assert.deepEqual(errors, []);
    await context.close();
  });
}
