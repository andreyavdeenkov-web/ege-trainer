'use strict';

/**
 * Браузерные тесты предпросмотра «Познание» (preview-poznanie.html, 19 заданий):
 * компьютер и смартфон, светлая и тёмная темы. Прохождение всех заданий, баллы,
 * объяснения, продолжение после обновления, отбраковка попытки другого состава,
 * отдельные сохранения от предпросмотра из 20 заданий.
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
const port = 21000 + Math.floor(Math.random() * 1000);
const base = `http://localhost:${port}/`;
const pageUrl = base + 'preview-poznanie.html';
const dataUrl = base + 'data/preview/cognition-poznanie.js';
const shotsDir = process.env.E2E_SCREENSHOTS || null;
const PREFIX = 'ege-trainer:attempt:';
const SCOPE = 'preview/preview/poznanie-19';

const CONFIGS = [
  { name: 'desktop-light', viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
  { name: 'desktop-dark', viewport: { width: 1280, height: 900 }, colorScheme: 'dark' },
  { name: 'mobile-light', viewport: { width: 360, height: 740 }, colorScheme: 'light', isMobile: true, hasTouch: true },
  { name: 'mobile-dark', viewport: { width: 360, height: 740 }, colorScheme: 'dark', isMobile: true, hasTouch: true }
];

/** Ошибки по номеру в наборе: 033 (соответствие, 1 балл), 034 (замена цифры), 038 (пропуск). */
const WRONG = { 5: { points: 0 }, 7: { points: 1, replace: true }, 18: { points: 1 } };

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

async function open(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(url);
  return { page, errors };
}

const newContext = (config) => browser.newContext({
  viewport: config.viewport, colorScheme: config.colorScheme, isMobile: !!config.isMobile, hasTouch: !!config.hasTouch
});

async function shot(page, config, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `poznanie-${config.name}-${name}.png`), fullPage: true });
}

async function assertNoHorizontalScroll(page, where) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth
  }));
  assert.ok(scroll <= client, `${where}: горизонтальная прокрутка (${scroll} > ${client})`);
}

async function taskAt(page, index) {
  return page.evaluate((i) => {
    const task = EGE.getTask(EGE.preview.taskIds[i]);
    const type = EGE.scoring.getTaskType(task);
    return {
      id: task.id, type, question: task.question,
      key: Array.from(EGE.scoring.getCorrect(task)),
      keyText: EGE.scoring.formatTaskAnswer(task, EGE.scoring.getCorrect(task)),
      maxPoints: EGE.scoring.getMaxPoints(task),
      size: type === 'matching' ? task.items.length : task.statements.length
    };
  }, index);
}

function answerFor(task, wrong) {
  const key = task.key.slice();
  if (!wrong) return key;
  if (task.type === 'matching') {
    const j = key.findIndex((n) => n !== key[0]);
    [key[0], key[j]] = [key[j], key[0]];
    return key;
  }
  if (wrong.replace) return key.slice(1).concat([1, 2, 3, 4, 5].find((n) => !key.includes(n)));
  return key.slice(1);
}

async function answer(page, task, selected) {
  if (task.type === 'matching') {
    for (let row = 0; row < selected.length; row++) await page.click(`.match-choice[data-row="${row}"][data-n="${selected[row]}"]`);
  } else {
    for (const n of selected) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
  }
  await page.click('#submit-btn');
  await page.waitForSelector('#feedback:not([hidden])');
}

for (const config of CONFIGS) {
  test(`${config.name}: «Познание» — все 19 заданий, баллы, объяснения, итог`, async () => {
    const context = await newContext(config);
    const { page, errors } = await open(context, pageUrl);
    assert.equal(await page.textContent('#start-title'), 'Познание: предварительный банк из 19 заданий');
    assert.equal(await page.textContent('#start-btn'), 'Начать: 19 заданий');
    assert.equal(await page.isVisible('#section-options'), false);
    await assertNoHorizontalScroll(page, 'старт');
    await shot(page, config, '00-start');
    await page.click('#start-btn');

    let total = 0;
    let max = 0;
    for (let i = 0; i < 19; i++) {
      const n = i + 1;
      const task = await taskAt(page, i);
      assert.equal(await page.textContent('#task-question'), task.question, `${task.id}: порядок`);
      assert.match(await page.textContent('#progress-label'), new RegExp(`^Задание ${n} из 19`));
      if (task.type === 'matching') assert.equal(await page.locator('#matching .match-row').count(), task.size);
      else assert.equal(await page.locator('#statements .statement').count(), task.size);
      await assertNoHorizontalScroll(page, `${task.id} до ответа`);

      await answer(page, task, answerFor(task, WRONG[n]));
      const expected = WRONG[n] ? WRONG[n].points : task.maxPoints;
      total += expected;
      max += task.maxPoints;
      assert.match(await page.textContent('#feedback-points'), new RegExp(`^${expected} из ${task.maxPoints}`), `${task.id}: баллы`);
      assert.equal(await page.textContent('#feedback-correct'), task.keyText, `${task.id}: правильный ответ`);
      assert.equal(await page.locator('#task-card .statement__explanation').count(), task.size, `${task.id}: объяснения`);
      await assertNoHorizontalScroll(page, `${task.id} после ответа`);
      if ([1, 5, 13, 18].includes(n)) await shot(page, config, `${String(n).padStart(2, '0')}-${task.id}`);
      await page.click('#next-btn');
    }

    await page.waitForSelector('#screen-result:not([hidden])');
    assert.equal(max, 33);
    assert.equal(total, 30);
    assert.match(await page.textContent('#result-score'), /^30 из 33/);
    assert.equal(await page.textContent('#filter-mistakes-label'), 'Только с ошибками (3)');
    assert.equal(await page.evaluate((p) => Object.keys(localStorage).filter((k) => k.startsWith(p)).length, PREFIX), 0,
      'завершённая попытка не сохраняется');
    await shot(page, config, '99-result');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('продолжение после обновления; сохранение отдельно от предпросмотра из 20 заданий', async () => {
  const context = await newContext(CONFIGS[3]);
  const { page, errors } = await open(context, pageUrl);
  await page.click('#start-btn');
  for (let i = 0; i < 3; i++) {
    await answer(page, await taskAt(page, i), (await taskAt(page, i)).key);
    await page.click('#next-btn');
  }
  await page.reload();
  assert.match(await page.textContent('#resume-text'), /^Выполнено 3 из 19 · баллы 5 из 5 · сохранено /);
  await page.click('#resume-continue');
  assert.match(await page.textContent('#progress-label'), /^Задание 4 из 19 · выполнено 3$/);

  // Предпросмотр из 20 заданий этого сохранения не видит, а его собственное не смешивается с этим.
  await page.goto(base + 'preview-cognition.html');
  assert.equal(await page.isVisible('#resume-panel'), false);
  await page.click('#start-btn');
  assert.match(await page.textContent('#progress-label'), /^Задание 1 из 20/);
  await page.goto(pageUrl);
  assert.ok(await page.isVisible('#resume-panel'));
  const keys = await page.evaluate((p) => Object.keys(localStorage).filter((k) => k.startsWith(p)).sort(), PREFIX);
  assert.deepEqual(keys, [PREFIX + 'preview/preview/cognition-batch1', PREFIX + SCOPE]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('состав набора изменился: старая попытка не восстанавливается, ученик видит причину', async () => {
  const context = await newContext(CONFIGS[2]);
  // Сначала страница получает набор из 18 заданий (без OBS-COG-038).
  const source = fs.readFileSync(path.join(root, 'data/preview/cognition-poznanie.js'), 'utf8');
  const smaller = source.replace("'OBS-COG-006', 'OBS-COG-038', 'OBS-COG-028'", "'OBS-COG-006', 'OBS-COG-028'");
  assert.notEqual(smaller, source);
  await context.route(dataUrl, (route) => route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: smaller }));
  const first = await open(context, pageUrl);
  assert.equal(await first.page.textContent('#start-btn'), 'Начать: 18 заданий');
  await first.page.click('#start-btn');
  await answer(first.page, await taskAt(first.page, 0), (await taskAt(first.page, 0)).key);
  await context.unroute(dataUrl);
  await first.page.close({ runBeforeUnload: true });

  const { page, errors } = await open(context, pageUrl);
  assert.equal(await page.isVisible('#resume-panel'), false);
  assert.equal(await page.textContent('#resume-notice'),
    'Сохранённую тренировку нельзя продолжить: состав заданий этой тренировки с тех пор изменился. Начните её заново.');
  await assertNoHorizontalScroll(page, 'уведомление');
  await shot(page, CONFIGS[2], 'composition');
  await page.click('#start-btn');
  assert.match(await page.textContent('#progress-label'), /^Задание 1 из 19 · выполнено 0$/);
  assert.deepEqual(first.errors.concat(errors), []);
  await context.close();
});
