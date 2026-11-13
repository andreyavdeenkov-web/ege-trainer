'use strict';

/**
 * Браузерные тесты итогового практикума «Типы обществ» (OBS-TYP-F01, kind: 'final')
 * на компьютере и смартфоне, в светлой и тёмной темах: карточка в каталоге темы без выбора
 * режимов, свободная навигация, изменение и пропуск ответов, отсутствие ключей и разбора
 * в разметке до завершения, продолжение после перезагрузки, итоги, разбор, учебная аналитика,
 * клавиатура, отсутствие горизонтальной прокрутки и ошибок консоли; тренировочный практикум
 * другой темы работает по-прежнему (проверка после каждого задания).
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
  await card(page).waitFor();
}

const card = (page) => page.locator('[data-practicum="OBS-TYP-F01"]');

/** Ключ задания, показанного на экране режима (из банка — только для теста). */
function keyOf(page, index) {
  return page.evaluate((i) => {
    const t = window.EGE.getTask(window.EGE.getPracticum('OBS-TYP-F01').taskIds[i]);
    return { type: window.EGE.scoring.getTaskType(t), key: Array.from(window.EGE.scoring.getCorrect(t)) };
  }, index);
}

async function answer(page, { type, key }) {
  if (type === 'matching') {
    for (let row = 0; row < key.length; row++) await page.click(`#final-matching .match-choice[data-row="${row}"][data-n="${key[row]}"]`);
  } else {
    for (const n of key) await page.click(`#final-statements .statement[data-number="${n}"] .statement__btn`);
  }
}

/** В разметке экрана итоговой работы нет ключей, статусов и объяснений. */
async function assertNothingRevealed(page, where) {
  const html = await page.locator('#screen-final').innerHTML();
  assert.doesNotMatch(html, /status-(hit|missed|wrong|skip|right)/, `${where}: статусы позиций`);
  assert.doesNotMatch(html, /statement__explanation|statement__trap|Правильн|Разбор вашего ответа|task-notes/, `${where}: разбор`);
  assert.doesNotMatch(html, /Средний класс \(собственники|Выпадает\.|Не подходит\./, `${where}: тексты объяснений`);
  assert.equal(await page.locator('#screen-final .feedback, #screen-final .points').count(), 0, `${where}: блок баллов`);
}

for (const config of CONFIGS) {
  test(`${config.name}: каталог темы — карточка итогового практикума без выбора режимов`, async () => {
    const { page, context, errors } = await open(config);
    await openTopic(page);
    const c = card(page);
    assert.match(await c.locator('.practicum-card__title').textContent(), /^Итоговый практикум — Типы обществ$/);
    assert.equal(await c.locator('.practicum-card__kind').textContent(), 'Итоговый');
    assert.ok(await c.evaluate((n) => n.classList.contains('practicum-card--final')));
    assert.match(await c.locator('.practicum-card__meta').textContent(), /25 заданий · максимум 35 баллов/);
    assert.equal(await page.locator('.mode-option, [data-mode]').count(), 0, 'выбора «Обучение / Экзамен» нет');
    assert.doesNotMatch(await page.textContent('#practicum-options'), /Обучение|Экзамен/);
    assert.deepEqual(await c.locator('.practicum-card__actions button:visible').allTextContents(), ['Начать итоговую работу']);
    await assertNoHorizontalScroll(page, 'карточка');
    await shot(page, config, 'card');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: итоговая работа — навигация, изменение и пропуск ответов, без раскрытия ключей, продолжение, итоги`, async () => {
    const { page, context, errors } = await open(config);
    await openTopic(page);
    await card(page).locator('.final-card__start').click();
    assert.equal(await page.textContent('#final-run-title'), 'Итоговый практикум — Типы обществ');
    assert.match(await page.textContent('#final-progress-label'), /^Задание 1 из 25 · отвечено 0/);
    await assertNothingRevealed(page, 'начало');
    // № 1: сначала неверно, потом исправлено.
    await page.click('#final-statements .statement[data-number="2"] .statement__btn');
    await page.click('#final-statements .statement[data-number="3"] .statement__btn');
    await page.click('#final-statements .statement[data-number="3"] .statement__btn');
    await page.click('#final-statements .statement[data-number="4"] .statement__btn');
    await assertNothingRevealed(page, 'задание с ответом');
    // Пропуск к № 7 по полосе номеров, соответствие.
    await page.click('#final-nav li:nth-child(7) button');
    assert.match(await page.textContent('#final-progress-label'), /^Задание 7 из 25 · отвечено 1/);
    await answer(page, await keyOf(page, 6));
    await assertNothingRevealed(page, 'соответствие');
    // Возврат назад и очистка ответа.
    await page.click('#final-prev');
    await page.click('#final-statements .statement[data-number="1"] .statement__btn');
    await page.click('#final-clear');
    assert.equal(await page.getAttribute('#final-statements .statement[data-number="1"] .statement__btn', 'aria-checked'), 'false');
    // Клавиатура: стрелка вправо — № 7; Enter — № 8; цифра отмечает.
    await page.keyboard.press('ArrowRight');
    assert.match(await page.textContent('#final-progress-label'), /^Задание 7 из 25/);
    await page.keyboard.press('Enter');
    assert.match(await page.textContent('#final-progress-label'), /^Задание 8 из 25/);
    // № 25 (последнее): неполный ответ — оценивается как есть.
    await page.click('#final-nav li:nth-child(25) button');
    await page.keyboard.press('1');
    assert.match(await page.textContent('#final-pill'), /Без ответа: 22/);
    assert.ok(await page.locator('#final-nav li:nth-child(1) button.is-answered').count());
    assert.equal(await page.textContent('#final-primary'), 'К завершению');
    await assertNoHorizontalScroll(page, 'итоговая работа');
    await shot(page, config, 'run');

    // Перезагрузка — ответы на месте, кнопка «Продолжить».
    await page.reload();
    await openTopic(page);
    assert.match(await card(page).textContent(), /Не завершён[\s\S]*Отвечено 3 из 25/);
    assert.match(await page.locator('#topic-options label:has(input[value="OBS-TYP"])').textContent(), /есть незавершённый/);
    assert.equal(await card(page).locator('.final-card__start').count(), 0);
    await card(page).locator('.final-card__continue').click();
    assert.match(await page.textContent('#final-progress-label'), /^Задание 25 из 25/);
    await page.click('#final-nav li:nth-child(1) button');
    assert.equal(await page.getAttribute('#final-statements .statement[data-number="4"] .statement__btn', 'aria-checked'), 'true');
    assert.equal(await page.getAttribute('#final-statements .statement[data-number="3"] .statement__btn', 'aria-checked'), 'false');

    // Завершение: подтверждение с номерами пропущенных заданий; отмена ничего не раскрывает.
    await page.click('.final-finish__open');
    assert.match(await page.textContent('#final-finish-text'), /Без ответа останутся задания: 2, 3, 4, 5, 6, 8,/);
    await page.click('.final-finish__cancel');
    await assertNothingRevealed(page, 'после отмены завершения');
    await page.click('.final-finish__open');
    await shot(page, config, 'confirm');
    await page.click('.final-finish__confirm');

    assert.match(await page.textContent('#final-result-title'), /Итоговая работа завершена/);
    assert.match(await page.textContent('#final-result-score'), /2 из 35 баллов/);
    const stats = await page.textContent('#final-stats');
    assert.match(stats, /2\s*полностью верно/);
    assert.match(stats, /23\s*0 баллов, из них без ответа: 22/);
    assert.equal(await page.locator('#final-an-format .meter').count(), 4);
    assert.equal(await page.locator('#final-an-criteria .meter').count(), 6);
    assert.equal(await page.locator('#final-an-level .meter').count(), 3);
    assert.equal(await page.locator('#final-an-action .meter').count(), 3);
    assert.match(await page.textContent('#final-analytics'), /не диагностика/);
    assert.match(await page.textContent('#final-an-format [data-group="EXCL"]'), /1 из 6 баллов/);
    assert.match(await page.textContent('#final-review'), /Без ответа \(22\)/);
    await page.click('#final-review label:has(input[value="skipped"])');
    assert.equal(await page.locator('#final-review-list .review-item').count(), 22);
    // Разбор после завершения: объяснения, ловушки, разбор ответа.
    await page.click('#final-review label:has(input[value="all"])');
    const first = page.locator('#final-review-list details[data-task="OBS-TYP-001"]');
    await first.locator('summary').click();
    assert.match(await first.textContent(), /Средний класс \(собственники/);
    assert.match(await first.textContent(), /Ловушка/);
    assert.match(await first.textContent(), /Разбор вашего ответа[\s\S]*Ошибок нет/);
    const t25 = page.locator('#final-review-list details[data-task="OBS-TYP-025"]');
    await t25.locator('summary').click();
    assert.match(await t25.textContent(), /Б\) «превращение промышленности в ведущую сферу экономики»: номер не выбран, правильно — 2/);
    await assertNoHorizontalScroll(page, 'итоги');
    await shot(page, config, 'result');

    // Каталог: результат сохранён, работу можно открыть для просмотра и пройти снова.
    await page.click('.final-result__home');
    assert.match(await card(page).textContent(), /Последний результат: 2 из 35 баллов/);
    await card(page).locator('.final-card__results').click();
    assert.match(await page.textContent('#final-result-score'), /2 из 35 баллов/);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('тренировочный практикум другой темы не изменился: проверка и разбор сразу после ответа', async () => {
  const { page, context, errors } = await open(CONFIGS[0]);
  await pick(page, 'section', 'OBS');
  await pick(page, 'topic', 'OBS-ACT');
  const c = page.locator('[data-practicum="OBS-ACT-P01"]');
  assert.equal(await c.locator('.practicum-card__kind').count(), 0);
  assert.equal(await c.locator('.practicum-card__title').textContent(), 'Практикум № 1');
  await c.locator('.practicum-card__start').click();
  await c.locator('.practicum-card__confirm-yes').click();
  // Порядок заданий случайный: любой формат — первые два варианта или первый номер в каждой позиции.
  if (await page.isVisible('#matching')) {
    const rows = await page.locator('#matching .match-row').count();
    const options = await page.locator('#matching .match-choice[data-row="0"]').count();
    // Номера по кругу: во взаимно-однозначном соответствии номеров не меньше, чем позиций.
    for (let r = 0; r < rows; r++) await page.click(`#matching .match-choice[data-row="${r}"][data-n="${r % options + 1}"]`);
  } else {
    await page.click('#statements .statement:nth-child(1) .statement__btn');
    await page.click('#statements .statement:nth-child(2) .statement__btn');
  }
  await page.click('#submit-btn');
  assert.ok(await page.isVisible('#feedback'), 'разбор показан сразу после ответа');
  assert.ok(await page.isHidden('#screen-final'));
  assert.deepEqual(errors, []);
  await context.close();
});
