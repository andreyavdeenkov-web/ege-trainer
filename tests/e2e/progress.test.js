'use strict';

/**
 * Браузерные тесты сохранения и продолжения попытки (js/attempt-save.js)
 * в практикумах главной страницы и на странице предпросмотра: независимые записи
 * практикумов, перенос попыток, сохранённых до практикумов, компьютер и смартфон.
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

const card = (page, id) => page.locator(`.practicum-card[data-practicum="${id}"]`);
const progressOf = (page, id) => card(page, id).locator('.practicum-card__progress').textContent();
const SCOPES = {
  'OBS-ACT-P01': 'ege/OBS/OBS-ACT/OBS-ACT-P01',
  'OBS-COG-P01': 'ege/OBS/OBS-COG/OBS-COG-P01',
  'SOC-FAM-P01': 'ege/SOC/SOC-FAM/SOC-FAM-P01',
  'SOC-FAM-P02': 'ege/SOC/SOC-FAM/SOC-FAM-P02',
  'SOC-FAM-R01': 'ege/SOC/SOC-FAM/SOC-FAM-R01'
};

/** Раздел → тема → «Начать практикум». */
async function startPracticum(page, section, topic, id) {
  await pick(page, 'section', section);
  await pick(page, 'topic', topic);
  await card(page, id).locator('.practicum-card__start').click();
  await page.waitForSelector('#screen-quiz:not([hidden])');
}

for (const config of CONFIGS) {
  test(`${config.name}: практикум — продолжение после обновления страницы`, async () => {
    const context = await newContext(config);
    const { page, errors } = await newPage(context, base);
    const scope = SCOPES['SOC-FAM-P01'];
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-FAM');
    assert.equal(await card(page, 'SOC-FAM-P01').locator('.practicum-card__continue').count(), 0, 'до старта сохранения нет');
    await card(page, 'SOC-FAM-P01').locator('.practicum-card__start').click();

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
    assert.equal(before.attempt.settings.practicum, 'SOC-FAM-P01');
    assert.equal(before.viewIndex, 3);

    await page.reload();
    assert.ok(await page.locator('input[name="topic"][value="SOC-FAM"]').isChecked());
    assert.equal(await card(page, 'SOC-FAM-P01').locator('.practicum-card__status').textContent(), 'Не завершён');
    const scoreText = pillBefore.replace('Баллы: ', 'баллы ');
    assert.match(await progressOf(page, 'SOC-FAM-P01'), new RegExp(`^Выполнено 3 из 16 · ${scoreText} · сохранено `));
    assert.equal(await card(page, 'SOC-FAM-P01').locator('.practicum-card__continue').textContent(), 'Продолжить');
    assert.equal(await card(page, 'SOC-FAM-P01').locator('.practicum-card__restart').textContent(), 'Начать заново');
    assert.equal(await card(page, 'SOC-FAM-P01').locator('.practicum-card__start').count(), 0);
    assert.match(await page.locator('label.topic-option:has(input[value="SOC-FAM"]) .topic-option__count').textContent(), /есть незавершённый/);
    await assertNoHorizontalScroll(page, 'предложение продолжить');
    await shot(page, config, '1-resume');

    await card(page, 'SOC-FAM-P01').locator('.practicum-card__continue').click();
    assert.match(await page.textContent('#progress-label'), /^Задание 4 из 16 · выполнено 3$/);
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
    await card(page, 'SOC-FAM-P01').locator('.practicum-card__continue').click();
    assert.match(await page.textContent('#progress-label'), /^Задание 2 из 16/);
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

  test(`${config.name}: разные практикумы сохраняются независимо (познание → деятельность → познание)`, async () => {
    const context = await newContext(config);
    const { page, errors } = await newPage(context, base);
    const cog = SCOPES['OBS-COG-P01'];
    const act = SCOPES['OBS-ACT-P01'];

    // Познание: пять заданий, выход на главную через логотип.
    await startPracticum(page, 'OBS', 'OBS-COG', 'OBS-COG-P01');
    for (let i = 0; i < 5; i++) {
      await answer(page, await shownTask(page, cog), false);
      await page.click('#next-btn');
    }
    assert.match(await page.textContent('#progress-label'), /^Задание 6 из 19 · выполнено 5$/);
    await page.click('#brand-home');
    assert.equal(await page.textContent('#exit-bar-text'), 'Прервать практикум? Ответы сохранены — продолжить можно со стартового экрана.');
    await page.click('#exit-confirm');
    await page.waitForSelector('#screen-start:not([hidden])');
    assert.match(await progressOf(page, 'OBS-COG-P01'), /^Выполнено 5 из 19 · баллы 8 из 8 · сохранено /);

    // Деятельность: два ответа, затем закрытие вкладки.
    await pick(page, 'topic', 'OBS-ACT');
    await card(page, 'OBS-ACT-P01').locator('.practicum-card__start').click();
    for (let i = 0; i < 2; i++) {
      await answer(page, await shownTask(page, act), false);
      await page.click('#next-btn');
    }
    assert.deepEqual(await savedKeys(page), [PREFIX + act, PREFIX + cog]);
    await page.reload();

    // Возврат к познанию: продолжение с шестого задания.
    await pick(page, 'topic', 'OBS-COG');
    assert.match(await progressOf(page, 'OBS-COG-P01'), /^Выполнено 5 из 19 · баллы 8 из 8/);
    await shot(page, config, '3-two-practicums');
    await card(page, 'OBS-COG-P01').locator('.practicum-card__continue').click();
    assert.match(await page.textContent('#progress-label'), /^Задание 6 из 19 · выполнено 5$/);
    assert.equal(await page.textContent('#quiz-title'), 'Познание · Практикум № 1');
    await answer(page, await shownTask(page, cog), false);
    assert.equal((await savedRecord(page, cog)).attempt.answers.length, 6);
    // Деятельность не тронута.
    assert.equal((await savedRecord(page, act)).attempt.answers.length, 2);

    // На главной у обеих тем — отметка о незавершённом практикуме.
    await page.click('#brand-home');
    await page.click('#exit-confirm');
    for (const topic of ['OBS-ACT', 'OBS-COG']) {
      assert.match(await page.locator(`label.topic-option:has(input[value="${topic}"]) .topic-option__count`).textContent(), /есть незавершённый/, topic);
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('случайное закрытие вкладки: практикум можно продолжить в новой вкладке', async () => {
  const context = await newContext(CONFIGS[0]);
  const first = await newPage(context, base);
  await startPracticum(first.page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
  const task = await shownTask(first.page, SCOPES['OBS-ACT-P01']);
  await answer(first.page, task, false);
  await first.page.close({ runBeforeUnload: true });

  const second = await newPage(context, base);
  assert.match(await progressOf(second.page, 'OBS-ACT-P01'), /^Выполнено 1 из 16 · баллы \d из \d/);
  await card(second.page, 'OBS-ACT-P01').locator('.practicum-card__continue').click();
  // Ответ засчитан, на экране — выполненное задание с разбором (как перед закрытием).
  assert.match(await second.page.textContent('#progress-label'), /^Задание 1 из 16 · выполнено 1$/);
  assert.ok(await second.page.isVisible('#feedback'));
  assert.deepEqual(first.errors.concat(second.errors), []);
  await context.close();
});

test('две вкладки: закрытие старой вкладки не затирает прогресс из новой', async () => {
  const context = await newContext(CONFIGS[0]);
  const scope = SCOPES['OBS-ACT-P01'];
  const a = await newPage(context, base);
  await startPracticum(a.page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
  await answer(a.page, await shownTask(a.page, scope), false);

  const b = await newPage(context, base);
  await card(b.page, 'OBS-ACT-P01').locator('.practicum-card__continue').click();
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

test('«Начать заново» удаляет сохранение практикума и начинает новую попытку', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base);
  const scope = SCOPES['OBS-ACT-P01'];
  await startPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
  await answer(page, await shownTask(page, scope), false);
  const oldId = (await savedRecord(page, scope)).attempt.id;
  await page.reload();
  await card(page, 'OBS-ACT-P01').locator('.practicum-card__restart').click();
  assert.match(await page.textContent('#progress-label'), /^Задание 1 из 16 · выполнено 0$/);
  assert.equal(await page.textContent('#score-pill'), 'Баллы: 0 из 0');
  const record = await savedRecord(page, scope);
  assert.notEqual(record.attempt.id, oldId);
  assert.equal(record.attempt.answers.length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('сохранения практикумов и предпросмотра не смешиваются', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base);
  const act = SCOPES['OBS-ACT-P01'];
  await startPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
  await answer(page, await shownTask(page, act), false);
  await page.reload();
  assert.ok(await card(page, 'OBS-ACT-P01').locator('.practicum-card__continue').isVisible());

  // Другие практикумы — своего сохранения нет.
  await pick(page, 'topic', 'OBS-COG');
  assert.equal(await card(page, 'OBS-COG-P01').locator('.practicum-card__continue').count(), 0);
  await pick(page, 'section', 'SOC');
  await pick(page, 'topic', 'SOC-FAM');
  assert.equal(await card(page, 'SOC-FAM-P01').locator('.practicum-card__continue').count(), 0);

  // Предпросмотр «Познания» не видит сохранение практикума «Познание» и пишет своё.
  await page.goto(previewUrl);
  assert.equal(await page.isVisible('#resume-panel'), false);
  await page.click('#start-btn');
  await answer(page, await shownTask(page, 'preview/preview/cognition-batch1'), false);
  assert.deepEqual(await savedKeys(page), [PREFIX + act, PREFIX + 'preview/preview/cognition-batch1']);
  assert.equal((await savedRecord(page, act)).attempt.answers.length, 1, 'основное сохранение не тронуто');

  await page.goto(base);
  await pick(page, 'section', 'OBS');
  await pick(page, 'topic', 'OBS-ACT');
  assert.match(await progressOf(page, 'OBS-ACT-P01'), /^Выполнено 1 из 16/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('незавершённая попытка темы, сохранённая до практикумов, продолжается в практикуме', async () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/legacy-attempts.json'), 'utf8')).records;
  const context = await newContext(CONFIGS[1]);
  const { page, errors } = await newPage(context, base + 'olympiad.html');
  // Записи прежней версии: тема «Деятельность» целиком, «Весь раздел», прежние настройки старта.
  const savedAt = new Date(Date.now() - 3600 * 1000).toISOString();
  await page.evaluate(([records, at]) => {
    for (const scope of ['ege/OBS/OBS-ACT', 'ege/OBS/all']) {
      localStorage.setItem('ege-trainer:attempt:' + scope, JSON.stringify(Object.assign(records[scope], { savedAt: at })));
    }
    localStorage.setItem('ege-trainer:settings', JSON.stringify({ section: 'OBS', topic: 'OBS-ACT' }));
  }, [legacy, savedAt]);

  await page.goto(base);
  assert.ok(await page.locator('input[name="topic"][value="OBS-ACT"]').isChecked());
  assert.match(await progressOf(page, 'OBS-ACT-P01'), /^Выполнено 5 из 16 · баллы 8 из 9 · сохранено /);
  // Запись перенесена в практикум; запись «Весь раздел» не удалена.
  assert.deepEqual(await savedKeys(page), [PREFIX + 'ege/OBS/OBS-ACT/OBS-ACT-P01', PREFIX + 'ege/OBS/all']);
  await shot(page, CONFIGS[1], '4-legacy-migrated');
  await card(page, 'OBS-ACT-P01').locator('.practicum-card__continue').click();
  assert.match(await page.textContent('#progress-label'), /^Задание 6 из 16 · выполнено 5$/);
  assert.equal(await page.textContent('#score-pill'), 'Баллы: 8 из 9');
  const record = await savedRecord(page, SCOPES['OBS-ACT-P01']);
  assert.deepEqual(record.attempt.taskIds, legacy['ege/OBS/OBS-ACT'].attempt.taskIds, 'порядок заданий прежний');
  assert.equal(record.attempt.id, legacy['ege/OBS/OBS-ACT'].attempt.id);
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Семья и брак»: прежний набор (31 задание) — перенос старой попытки, продолжение до конца, независимость от новых практикумов', async () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/legacy-attempts.json'), 'utf8')).records;
  const config = CONFIGS[1];
  const context = await newContext(config);
  const { page, errors } = await newPage(context, base + 'olympiad.html');
  // Запись прежней версии (тема целиком, 3 ответа из 31) и прежние настройки старта.
  const savedAt = new Date(Date.now() - 3600 * 1000).toISOString();
  await page.evaluate(([record, at]) => {
    localStorage.setItem('ege-trainer:attempt:ege/SOC/SOC-FAM', JSON.stringify(Object.assign(record, { savedAt: at })));
    localStorage.setItem('ege-trainer:settings', JSON.stringify({ section: 'SOC', topic: 'SOC-FAM' }));
  }, [legacy['ege/SOC/SOC-FAM'], savedAt]);

  await page.goto(base);
  const old = card(page, 'SOC-FAM-R01');
  assert.deepEqual(await page.locator('.practicum-card').evaluateAll((list) => list.map((c) => c.dataset.practicum)),
    ['SOC-FAM-R01', 'SOC-FAM-P01', 'SOC-FAM-P02']);
  assert.equal(await old.locator('.practicum-card__title').textContent(), 'Прежний набор (31 задание)');
  assert.equal(await old.locator('.practicum-card__meta').textContent(), '31 задание · максимум 57 баллов');
  assert.match(await progressOf(page, 'SOC-FAM-R01'), /^Выполнено 3 из 31 · баллы 4 из 6 · сохранено /);
  assert.equal(await old.locator('.practicum-card__restart, .practicum-card__start').count(), 0, 'прежний набор заново не начинается');
  assert.match(await page.locator('label.topic-option:has(input[value="SOC-FAM"]) .topic-option__count').textContent(), /есть незавершённый/);
  assert.deepEqual(await savedKeys(page), [PREFIX + SCOPES['SOC-FAM-R01']], 'запись перенесена, ничего не потеряно');
  await assertNoHorizontalScroll(page, 'прежний набор');
  await shot(page, config, '6-family-retired');

  // Новые практикумы — своя запись у каждого, прежний набор не трогают.
  await card(page, 'SOC-FAM-P01').locator('.practicum-card__start').click();
  await answer(page, await shownTask(page, SCOPES['SOC-FAM-P01']), false);
  await page.click('#brand-home');
  await page.click('#exit-confirm');
  await card(page, 'SOC-FAM-P02').locator('.practicum-card__start').click();
  for (let i = 0; i < 2; i++) {
    await answer(page, await shownTask(page, SCOPES['SOC-FAM-P02']), false);
    await page.click('#next-btn');
  }
  await page.reload();
  assert.match(await progressOf(page, 'SOC-FAM-R01'), /^Выполнено 3 из 31 /);
  assert.match(await progressOf(page, 'SOC-FAM-P01'), /^Выполнено 1 из 16 /);
  assert.match(await progressOf(page, 'SOC-FAM-P02'), /^Выполнено 2 из 15 /);
  assert.deepEqual(await savedKeys(page), [SCOPES['SOC-FAM-P01'], SCOPES['SOC-FAM-P02'], SCOPES['SOC-FAM-R01']].map((s) => PREFIX + s));

  // Продолжение прежнего набора с того же места и до конца.
  await old.locator('.practicum-card__continue').click();
  assert.match(await page.textContent('#progress-label'), /^Задание 4 из 31 · выполнено 3$/);
  assert.equal(await page.textContent('#quiz-title'), 'Семья и брак · Прежний набор (31 задание)');
  const record = await savedRecord(page, SCOPES['SOC-FAM-R01']);
  assert.deepEqual(record.attempt.taskIds, legacy['ege/SOC/SOC-FAM'].attempt.taskIds, 'порядок заданий прежний');
  for (let i = 3; i < 31; i++) {
    await answer(page, await shownTask(page, SCOPES['SOC-FAM-R01']), false);
    await page.click('#next-btn');
  }
  await page.waitForSelector('#screen-result:not([hidden])');
  assert.equal(await page.textContent('#result-context'), 'Семья и брак · Прежний набор (31 задание)');
  assert.equal(await page.textContent('#result-score'), '55 из 57 баллов');
  assert.ok(await page.locator('#restart-btn').isHidden(), 'прежний набор не проходится заново');

  // После завершения карточка исчезает; новые практикумы на месте.
  await page.click('#home-btn');
  assert.equal(await old.count(), 0);
  assert.match(await progressOf(page, 'SOC-FAM-P01'), /^Выполнено 1 из 16 /);
  assert.match(await progressOf(page, 'SOC-FAM-P02'), /^Выполнено 2 из 15 /);
  assert.deepEqual(await savedKeys(page), [SCOPES['SOC-FAM-P01'], SCOPES['SOC-FAM-P02']].map((s) => PREFIX + s));
  await page.reload();
  assert.equal(await old.count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('несовместимое сохранение: объяснение вместо прежних баллов, запись удалена', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base);
  const scope = SCOPES['OBS-ACT-P01'];
  await startPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
  await answer(page, await shownTask(page, scope), true);
  // Имитация: в сохранении баллы, которых текущий движок за этот ответ не даёт.
  // Запись меняется, когда страница тренажёра закрыта (уходя, она сохраняет попытку сама).
  await page.goto(base + 'olympiad.html');
  await page.evaluate((k) => {
    const r = JSON.parse(localStorage.getItem(k));
    const a = r.attempt.answers[0];
    a.points = (a.points + 1) % (a.maxPoints + 1);
    localStorage.setItem(k, JSON.stringify(r));
  }, PREFIX + scope);
  await page.goto(base);
  assert.equal(await card(page, 'OBS-ACT-P01').locator('.practicum-card__continue').count(), 0);
  assert.equal(await card(page, 'OBS-ACT-P01').locator('.practicum-card__notice').textContent(),
    'Сохранённый практикум нельзя продолжить: правила оценивания или ключи заданий с тех пор изменились. Начните его заново.');
  assert.deepEqual(await savedKeys(page), []);
  await shot(page, CONFIGS[0], '5-invalid');
  await card(page, 'OBS-ACT-P01').locator('.practicum-card__start').click();
  assert.match(await page.textContent('#progress-label'), /выполнено 0$/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('выход через логотип: подтверждение, затем можно продолжить', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base);
  await startPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
  await answer(page, await shownTask(page, SCOPES['OBS-ACT-P01']), false);
  await page.click('#brand-home');
  assert.equal(await page.textContent('#exit-bar-text'), 'Прервать практикум? Ответы сохранены — продолжить можно со стартового экрана.');
  await page.click('#exit-confirm');
  await card(page, 'OBS-ACT-P01').locator('.practicum-card__continue').click();
  assert.match(await page.textContent('#progress-label'), /выполнено 1$/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('завершённый практикум не предлагается к продолжению', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base);
  const scope = SCOPES['OBS-ACT-P01'];
  await startPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
  for (let i = 0; i < 16; i++) {
    await answer(page, await shownTask(page, scope), false);
    await page.click('#next-btn');
  }
  await page.waitForSelector('#screen-result:not([hidden])');
  assert.deepEqual(await savedKeys(page), []);
  await page.click('#home-btn');
  assert.equal(await page.textContent('#home-btn'), 'К выбору практикума');
  assert.ok(await card(page, 'OBS-ACT-P01').locator('.practicum-card__start').isVisible());
  await page.reload();
  assert.equal(await card(page, 'OBS-ACT-P01').locator('.practicum-card__continue').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('хранилище недоступно: практикум работает, предложения продолжить нет', async () => {
  const context = await newContext(CONFIGS[0]);
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(base);
  await startPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
  assert.match(await page.textContent('#progress-label'), /^Задание 1 из 16 · выполнено 0$/);
  await page.click('#statements:not([hidden]) .statement[data-number="1"] .statement__btn, .match-choice[data-row="0"][data-n="1"]');
  await page.reload();
  await pick(page, 'section', 'OBS');
  await pick(page, 'topic', 'OBS-ACT');
  assert.equal(await card(page, 'OBS-ACT-P01').locator('.practicum-card__continue').count(), 0);
  assert.ok(await card(page, 'OBS-ACT-P01').locator('.practicum-card__start').isVisible());
  assert.deepEqual(errors, []);
  await context.close();
});

test('предпросмотр: попытка прежней редакции заданий не восстанавливается, новая — восстанавливается', async () => {
  const { toRevision1, EDITS } = require('../helpers/cognition-r2.js');
  const scope = 'preview/preview/cognition-batch1';
  const context = await newContext(CONFIGS[1]);
  // Сначала страница получает данные редакции 1 (как до публикации правки).
  // Задания редакции 1 — в файле заданий «Познания», который подключает страница предпросмотра.
  const dataUrl = base + 'data/tasks/society/cognition.js';
  const oldData = toRevision1(fs.readFileSync(path.join(root, 'data/tasks/society/cognition.js'), 'utf8'));
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
