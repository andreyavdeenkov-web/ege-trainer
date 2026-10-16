'use strict';

/**
 * Браузерные тесты сохранения и продолжения попытки (js/attempt-save.js)
 * в основном тренажёре ЕГЭ и на странице предпросмотра: компьютер и смартфон.
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
const port = 20000 + Math.floor(Math.random() * 1000);
const base = `http://localhost:${port}/`;
const previewUrl = base + 'preview-cognition.html';
const shotsDir = process.env.E2E_SCREENSHOTS || null;
const PREFIX = 'ege-trainer:attempt:';

const CONFIGS = [
  { name: 'desktop-light', viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
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

async function newContext(config) {
  return browser.newContext({
    viewport: config.viewport,
    colorScheme: config.colorScheme,
    isMobile: !!config.isMobile,
    hasTouch: !!config.hasTouch
  });
}

async function newPage(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(url);
  return { page, errors };
}

async function shot(page, config, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `progress-${config.name}-${name}.png`), fullPage: true });
}

async function assertNoHorizontalScroll(page, where) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth
  }));
  assert.ok(scroll <= client, `${where}: горизонтальная прокрутка (${scroll} > ${client})`);
}

const pick = (page, name, value) => page.locator(`label.topic-option:has(input[name="${name}"][value="${value}"])`).click();
const savedKeys = (page) => page.evaluate((p) => Object.keys(localStorage).filter((k) => k.startsWith(p)).sort(), PREFIX);
const savedRecord = (page, scope) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), PREFIX + scope);

/** Задание на экране — по позиции в попытке (из сохранения, которое пишет приложение). */
async function shownTask(page, scope) {
  return page.evaluate(([k, label]) => {
    const record = JSON.parse(localStorage.getItem(k));
    const n = Number(/^Задание (\d+)/.exec(label)[1]);
    const task = EGE.getTask(record.attempt.taskIds[n - 1]);
    return {
      id: task.id,
      type: EGE.scoring.getTaskType(task),
      key: Array.from(EGE.scoring.getCorrect(task)),
      size: task.statements ? task.statements.length : task.items.length
    };
  }, [PREFIX + scope, await page.textContent('#progress-label')]);
}

/** Ответ кликами; wrong — одна ошибка. */
async function answer(page, task, wrong) {
  const sel = task.key.slice();
  if (wrong) {
    if (task.type === 'matching') {
      // Перестановка двух разных номеров — допустима и во взаимно-однозначных соответствиях.
      const j = sel.findIndex((n) => n !== sel[0]);
      [sel[0], sel[j]] = [sel[j], sel[0]];
    } else sel[sel.length - 1] = [1, 2, 3, 4, 5, 6].slice(0, task.size).find((n) => !task.key.includes(n));
  }
  if (task.type === 'matching') {
    for (let row = 0; row < sel.length; row++) await page.click(`.match-choice[data-row="${row}"][data-n="${sel[row]}"]`);
  } else {
    for (const n of sel) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
  }
  await page.click('#submit-btn');
  await page.waitForSelector('#feedback:not([hidden])');
}

/** Ответ с клавиатуры: цифры и Enter, затем Enter — дальше. */
async function answerByKeyboard(page, task) {
  if (task.type === 'matching') {
    for (const n of task.key) await page.keyboard.press(String(n));
  } else {
    for (const n of task.key) await page.keyboard.press(String(n));
  }
  await page.keyboard.press('Enter');
  await page.waitForSelector('#feedback:not([hidden])');
  await page.keyboard.press('Enter');
}

for (const config of CONFIGS) {
  test(`${config.name}: основной тренажёр — продолжение после обновления страницы`, async () => {
    const context = await newContext(config);
    const { page, errors } = await newPage(context, base);
    const scope = 'ege/SOC/SOC-FAM';
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-FAM');
    assert.equal(await page.isVisible('#resume-panel'), false, 'до старта сохранения нет');
    await page.click('#start-btn');

    // Три ответа (второй — с ошибкой), третий — с клавиатуры.
    for (let i = 0; i < 3; i++) {
      const task = await shownTask(page, scope);
      if (i === 2) {
        await answerByKeyboard(page, task);
      } else {
        await answer(page, task, i === 1);
        await page.click('#next-btn');
      }
    }
    // Отметка в четвёртом задании (ещё не засчитана).
    const fourth = await shownTask(page, scope);
    if (fourth.type === 'matching') await page.click('.match-choice[data-row="0"][data-n="1"]');
    else await page.click('#statements .statement[data-number="1"] .statement__btn');

    const before = await savedRecord(page, scope);
    const pillBefore = await page.textContent('#score-pill');
    assert.equal(before.attempt.answers.length, 3);
    assert.equal(before.viewIndex, 3);

    await page.reload();
    assert.ok(await page.isVisible('#resume-panel'), 'после обновления — предложение продолжить');
    assert.ok(await page.locator('input[name="topic"][value="SOC-FAM"]').isChecked());
    const scoreText = pillBefore.replace('Баллы: ', 'баллы ');
    assert.match(await page.textContent('#resume-text'), new RegExp(`^Выполнено 3 из 31 · ${scoreText} · сохранено `));
    assert.equal(await page.textContent('#resume-continue'), 'Продолжить');
    assert.equal(await page.textContent('#resume-restart'), 'Начать заново');
    await assertNoHorizontalScroll(page, 'предложение продолжить');
    await shot(page, config, '1-resume');

    await page.click('#resume-continue');
    assert.match(await page.textContent('#progress-label'), /^Задание 4 из 31 · выполнено 3$/);
    assert.equal(await page.textContent('#score-pill'), pillBefore);
    const after = await savedRecord(page, scope);
    assert.deepEqual(after.attempt.taskIds, before.attempt.taskIds, 'порядок заданий тот же');
    assert.deepEqual(after.attempt.answers, before.attempt.answers, 'ответы и баллы те же');
    assert.equal(await page.locator('#task-nav .is-done').count(), 3);
    // Отметка в текущем задании восстановлена.
    if (fourth.type === 'matching') assert.ok(await page.locator('.match-choice[data-row="0"][data-n="1"]').evaluate((b) => b.classList.contains('is-selected')));
    else assert.ok(await page.locator('#statements .statement[data-number="1"]').evaluate((li) => li.classList.contains('is-selected')));
    await shot(page, config, '2-continued');

    // Позиция: просмотр выполненного задания тоже сохраняется.
    await page.click('#task-nav li:nth-child(2) button');
    await page.reload();
    await page.click('#resume-continue');
    assert.match(await page.textContent('#progress-label'), /^Задание 2 из 31/);
    assert.ok(await page.isVisible('#feedback'), 'выполненное задание — с разбором');
    assert.equal(await page.isVisible('#submit-btn'), false, 'засчитанный ответ не меняется');

    // Продолжение работает дальше, в том числе с клавиатуры (сначала снимаем восстановленную отметку).
    await page.click('#current-btn');
    if (fourth.type === 'matching') await page.click('.match-choice[data-row="0"][data-n="1"]');
    else await page.click('#statements .statement[data-number="1"] .statement__btn');
    await answerByKeyboard(page, await shownTask(page, scope));
    assert.match(await page.textContent('#progress-label'), /выполнено 4$/);

    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('случайное закрытие вкладки: попытку можно продолжить в новой вкладке', async () => {
  const context = await newContext(CONFIGS[0]);
  const first = await newPage(context, base);
  await pick(first.page, 'section', 'OBS');
  await pick(first.page, 'topic', 'OBS-ACT');
  await first.page.click('#start-btn');
  const task = await shownTask(first.page, 'ege/OBS/OBS-ACT');
  await answer(first.page, task, false);
  await first.page.close({ runBeforeUnload: true });

  const second = await newPage(context, base);
  assert.ok(await second.page.isVisible('#resume-panel'));
  assert.match(await second.page.textContent('#resume-text'), /^Выполнено 1 из 16 · баллы \d из \d/);
  await second.page.click('#resume-continue');
  // Ответ засчитан, на экране — выполненное задание с разбором (как перед закрытием).
  assert.match(await second.page.textContent('#progress-label'), /^Задание 1 из 16 · выполнено 1$/);
  assert.ok(await second.page.isVisible('#feedback'));
  assert.deepEqual(first.errors.concat(second.errors), []);
  await context.close();
});

test('две вкладки: закрытие старой вкладки не затирает прогресс из новой', async () => {
  const context = await newContext(CONFIGS[0]);
  const scope = 'ege/OBS/OBS-ACT';
  const a = await newPage(context, base);
  await pick(a.page, 'section', 'OBS');
  await pick(a.page, 'topic', 'OBS-ACT');
  await a.page.click('#start-btn');
  await answer(a.page, await shownTask(a.page, scope), false);

  const b = await newPage(context, base);
  await b.page.click('#resume-continue');
  await b.page.click('#next-btn');
  await answer(b.page, await shownTask(b.page, scope), false);
  await b.page.click('#next-btn');
  await answer(b.page, await shownTask(b.page, scope), false);
  assert.equal((await savedRecord(b.page, scope)).attempt.answers.length, 3);

  await a.page.close({ runBeforeUnload: true });   // старая вкладка: 1 ответ
  assert.equal((await savedRecord(b.page, scope)).attempt.answers.length, 3, 'прогресс новой вкладки сохранён');
  assert.deepEqual(a.errors.concat(b.errors), []);
  await context.close();
});

test('«Начать заново» удаляет сохранение и начинает новую попытку', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base);
  await pick(page, 'section', 'OBS');
  await pick(page, 'topic', 'OBS-ACT');
  await page.click('#start-btn');
  await answer(page, await shownTask(page, 'ege/OBS/OBS-ACT'), false);
  const oldId = (await savedRecord(page, 'ege/OBS/OBS-ACT')).attempt.id;
  await page.reload();
  await page.click('#resume-restart');
  assert.match(await page.textContent('#progress-label'), /^Задание 1 из 16 · выполнено 0$/);
  assert.equal(await page.textContent('#score-pill'), 'Баллы: 0 из 0');
  const record = await savedRecord(page, 'ege/OBS/OBS-ACT');
  assert.notEqual(record.attempt.id, oldId);
  assert.equal(record.attempt.answers.length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('сохранения разных тем и предпросмотра не смешиваются', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base);
  await pick(page, 'section', 'OBS');
  await pick(page, 'topic', 'OBS-ACT');
  await page.click('#start-btn');
  await answer(page, await shownTask(page, 'ege/OBS/OBS-ACT'), false);
  await page.reload();
  assert.ok(await page.isVisible('#resume-panel'));

  // Другая тема, другой раздел, тема ещё не выбрана — своего сохранения нет.
  for (const [section, topic] of [['SOC', 'SOC-STR'], ['SOC', 'SOC-FAM'], ['OBS', null]]) {
    await pick(page, 'section', section);
    if (topic) await pick(page, 'topic', topic);
    assert.equal(await page.isVisible('#resume-panel'), false, `${section}/${topic}`);
  }
  await pick(page, 'section', 'OBS');
  await pick(page, 'topic', 'OBS-ACT');
  assert.ok(await page.isVisible('#resume-panel'), 'своя тема — сохранение на месте');

  // Предпросмотр не видит сохранение основного тренажёра и пишет своё.
  await page.goto(previewUrl);
  assert.equal(await page.isVisible('#resume-panel'), false);
  await page.click('#start-btn');
  await answer(page, await shownTask(page, 'preview/preview/cognition-batch1'), false);
  assert.deepEqual(await savedKeys(page), [PREFIX + 'ege/OBS/OBS-ACT', PREFIX + 'preview/preview/cognition-batch1']);
  assert.equal((await savedRecord(page, 'ege/OBS/OBS-ACT')).attempt.answers.length, 1, 'основное сохранение не тронуто');

  await page.goto(base);
  assert.ok(await page.isVisible('#resume-panel'));
  assert.match(await page.textContent('#resume-text'), /^Выполнено 1 из 16/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('несовместимое сохранение: объяснение вместо прежних баллов, запись удалена', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base);
  await pick(page, 'section', 'OBS');
  await pick(page, 'topic', 'OBS-ACT');
  await page.click('#start-btn');
  await answer(page, await shownTask(page, 'ege/OBS/OBS-ACT'), true);
  // Имитация: в сохранении баллы, которых текущий движок за этот ответ не даёт.
  // Запись меняется, когда страница тренажёра закрыта (уходя, она сохраняет попытку сама).
  await page.goto(base + 'olympiad.html');
  await page.evaluate((k) => {
    const r = JSON.parse(localStorage.getItem(k));
    const a = r.attempt.answers[0];
    a.points = (a.points + 1) % (a.maxPoints + 1);
    localStorage.setItem(k, JSON.stringify(r));
  }, PREFIX + 'ege/OBS/OBS-ACT');
  await page.goto(base);
  assert.equal(await page.isVisible('#resume-panel'), false);
  assert.ok(await page.isVisible('#resume-notice'));
  assert.equal(await page.textContent('#resume-notice'),
    'Сохранённую тренировку нельзя продолжить: правила оценивания или ключи заданий с тех пор изменились. Начните её заново.');
  assert.deepEqual(await savedKeys(page), []);
  await shot(page, CONFIGS[0], '3-invalid');
  await page.click('#start-btn');
  assert.match(await page.textContent('#progress-label'), /выполнено 0$/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('выход через логотип: подтверждение, затем можно продолжить', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base);
  await pick(page, 'section', 'OBS');
  await pick(page, 'topic', 'OBS-ACT');
  await page.click('#start-btn');
  await answer(page, await shownTask(page, 'ege/OBS/OBS-ACT'), false);
  await page.click('#brand-home');
  assert.equal(await page.textContent('#exit-bar-text'), 'Прервать тренировку? Ответы сохранены — продолжить можно со стартового экрана.');
  await page.click('#exit-confirm');
  assert.ok(await page.isVisible('#resume-panel'));
  await page.click('#resume-continue');
  assert.match(await page.textContent('#progress-label'), /выполнено 1$/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('завершённая попытка не предлагается к продолжению', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base);
  await pick(page, 'section', 'SOC');
  await pick(page, 'topic', 'SOC-STR');
  await page.click('#start-btn');
  for (let i = 0; i < 6; i++) {
    await answer(page, await shownTask(page, 'ege/SOC/SOC-STR'), false);
    await page.click('#next-btn');
  }
  await page.waitForSelector('#screen-result:not([hidden])');
  assert.deepEqual(await savedKeys(page), []);
  await page.reload();
  assert.equal(await page.isVisible('#resume-panel'), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('хранилище недоступно: тренировка работает, предложения продолжить нет', async () => {
  const context = await newContext(CONFIGS[0]);
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(base);
  await pick(page, 'section', 'SOC');
  await pick(page, 'topic', 'SOC-STR');
  await page.click('#start-btn');
  await page.click('#statements .statement[data-number="1"] .statement__btn');
  await page.click('#submit-btn');
  await page.waitForSelector('#feedback:not([hidden])');
  await page.reload();
  assert.equal(await page.isVisible('#resume-panel'), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('предпросмотр: попытка прежней редакции заданий не восстанавливается, новая — восстанавливается', async () => {
  const { toRevision1, EDITS } = require('../helpers/cognition-r2.js');
  const scope = 'preview/preview/cognition-batch1';
  const context = await newContext(CONFIGS[1]);
  // Сначала страница получает данные редакции 1 (как до публикации правки).
  const dataUrl = previewUrl.replace('preview-cognition.html', 'data/preview/cognition-batch1.js');
  const oldData = toRevision1(fs.readFileSync(path.join(root, 'data/preview/cognition-batch1.js'), 'utf8'));
  await context.route(dataUrl, (route) => route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: oldData }));
  const first = await newPage(context, previewUrl);
  await first.page.click('#start-btn');
  for (let i = 0; i < 4; i++) {
    await answer(first.page, await shownTask(first.page, scope), false);
    await first.page.click('#next-btn');
  }
  assert.equal(await first.page.evaluate(() => EGE.getTask('OBS-COG-008').statements[0].text), EDITS[0].before);
  await context.unroute(dataUrl);
  await first.page.close({ runBeforeUnload: true });

  // После публикации редакции 2: объяснение вместо прежних баллов.
  const { page, errors } = await newPage(context, previewUrl);
  assert.equal(await page.isVisible('#resume-panel'), false);
  assert.equal(await page.textContent('#resume-notice'),
    'Сохранённую тренировку нельзя продолжить: задания этой тренировки с тех пор обновились. Начните её заново.');
  await assertNoHorizontalScroll(page, 'уведомление');
  await shot(page, CONFIGS[1], '4-revision');
  assert.deepEqual(await savedKeys(page), []);

  // Новая попытка: согласованные формулировки на экране, сохранение и продолжение работают.
  await page.click('#start-btn');
  for (let i = 0; i < 4; i++) {
    await answer(page, await shownTask(page, scope), false);
    await page.click('#next-btn');
  }
  assert.match(await page.textContent('#progress-label'), /^Задание 5 из 20 · выполнено 4$/);
  await page.click('#task-nav li:nth-child(4) button');
  const texts = await page.locator('#statements .statement__text').allTextContents();
  assert.equal(texts[0], EDITS[0].after);
  assert.equal(texts[2], EDITS[1].after);
  await page.reload();
  assert.match(await page.textContent('#resume-text'), /^Выполнено 4 из 20 · баллы 7 из 7 · сохранено /);
  await page.click('#resume-continue');
  assert.match(await page.textContent('#progress-label'), /^Задание 4 из 20 · выполнено 4$/);
  assert.equal(await page.textContent('#score-pill'), 'Баллы: 7 из 7');
  assert.deepEqual(errors, []);
  await context.close();
});
