'use strict';

/**
 * Браузерные тесты тренажёра ЕГЭ (Playwright + Chromium):
 * компьютер и смартфон, светлая и тёмная темы. Проверяют выбор раздела, темы
 * и практикума, три формата, повторное прохождение, клавиатуру, отсутствие
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

/**
 * Ключ текущего задания: ищем задание банка по тексту вопроса и первой позиции
 * (у разных заданий вопрос может совпадать, например «Выберите верные суждения о функциях семьи.»).
 */
async function currentKey(page) {
  return page.evaluate(() => {
    const q = document.getElementById('task-question').textContent;
    const first = document.querySelector('#statements:not([hidden]) .statement__text, #matching:not([hidden]) .match-row__text');
    const firstText = first ? first.textContent : null;
    const task = window.EGE.tasks.find((t) => t.question === q &&
      (t.statements ? t.statements[0].text : t.items[0].text) === firstText);
    return {
      id: task.id,
      type: window.EGE.scoring.getTaskType(task),
      key: Array.from(window.EGE.scoring.getCorrect(task)),
      maxPoints: window.EGE.scoring.getMaxPoints(task),
      choiceOfItems: task.choiceOf === 'items',
      hasSource: !!task.source,
      hasFeature: !!task.commonFeature
    };
  });
}

/** Отвечает на текущее задание ключом (кликами, как ученик). */
async function answerWithKey(page, { type, key }) {
  if (type === 'matching') {
    for (let row = 0; row < key.length; row++) {
      await page.click(`.match-choice[data-row="${row}"][data-n="${key[row]}"]`);
    }
  } else {
    for (const n of key) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
  }
  await page.click('#submit-btn');
  await page.waitForSelector('#feedback:not([hidden])');
}

/**
 * Проходит задания практикума верными ответами, пока текущим не станет задание
 * нужного типа (формат на главном экране не выбирается — порядок заданий случайный).
 */
async function advanceTo(page, type) {
  for (;;) {
    const task = await currentKey(page);
    if (task.type === type) return task;
    await answerWithKey(page, task);
    await page.click('#next-btn');
  }
}

const card = (page, id) => page.locator(`.practicum-card[data-practicum="${id}"]`);
const noteOf = (page, name, value) =>
  page.locator(`label.topic-option:has(input[name="${name}"][value="${value}"]) .topic-option__count`).textContent();
const values = (page, name) => page.locator(`input[name="${name}"]`).evaluateAll((list) => list.map((i) => i.value));

/** Раздел → тема → «Начать практикум». */
async function openPracticum(page, section, topic, id) {
  await pick(page, 'section', section);
  await pick(page, 'topic', topic);
  await card(page, id).locator('.practicum-card__start').click();
  await page.waitForSelector('#screen-quiz:not([hidden])');
}

for (const config of CONFIGS) {
  test(`${config.name}: главный экран — раздел, тема, практикум`, async () => {
    const { page, context, errors } = await open(config);
    await assert.doesNotReject(page.waitForSelector('#start-title'));
    assert.equal(await page.textContent('#start-title'),
      'Практикуй задания ЕГЭ по обществознанию и разбирай каждую ошибку');
    assert.doesNotMatch(await page.textContent('.hero__lead'), /формат/i);

    // Тема оформления применилась: фон страницы тёмный только в тёмной теме.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    const dark = (r + g + b) / 3 < 100;
    assert.equal(dark, config.colorScheme === 'dark', `фон ${bg}`);

    // Выбора формата нет ни в каком виде; обобщённых пунктов тоже нет.
    assert.equal(await page.locator('input[name="format"], #train-settings, #format-options, #start-btn').count(), 0);
    assert.deepEqual(await page.locator('#start-form legend').allTextContents(), ['Раздел', 'Тема']);
    assert.deepEqual(await values(page, 'section'), ['OBS', 'ECO', 'SOC', 'POL', 'LAW']);
    const startText = await page.textContent('#screen-start');
    for (const text of ['Все разделы', 'Весь раздел', 'Общие вопросы']) assert.ok(!startText.includes(text), text);

    // Сначала виден только выбор раздела.
    assert.ok(await page.locator('#topic-field').isHidden());
    assert.ok(await page.locator('#practicum-field').isHidden());
    assert.equal(await noteOf(page, 'section', 'OBS'), '4 темы');
    assert.equal(await noteOf(page, 'section', 'ECO'), 'Практикумы готовятся');
    await assertNoHorizontalScroll(page, 'старт');
    await shot(page, config, '1-start');

    // Раздел → темы (только с практикумами, без «Общих вопросов»).
    await pick(page, 'section', 'OBS');
    assert.deepEqual(await values(page, 'topic'), ['OBS-ACT', 'OBS-COG', 'OBS-SCK', 'OBS-SYS']);
    assert.equal(await noteOf(page, 'topic', 'OBS-COG'), '1 практикум');
    assert.equal(await noteOf(page, 'topic', 'OBS-SCK'), '2 практикума');
    assert.equal(await noteOf(page, 'topic', 'OBS-SYS'), '2 практикума');
    assert.ok(await page.locator('#practicum-field').isHidden(), 'практикумы — после выбора темы');

    // Тема → практикумы.
    await pick(page, 'topic', 'OBS-COG');
    assert.equal(await page.textContent('#practicum-title'), 'Практикумы по теме «Познание»');
    assert.equal(await page.locator('.practicum-card').count(), 1);
    assert.equal(await card(page, 'OBS-COG-P01').locator('.practicum-card__title').textContent(), 'Практикум № 1');
    assert.equal(await card(page, 'OBS-COG-P01').locator('.practicum-card__meta').textContent(), '19 заданий · максимум 33 балла');
    assert.equal(await card(page, 'OBS-COG-P01').locator('.practicum-card__start').textContent(), 'Начать практикум');
    await assertNoHorizontalScroll(page, 'практикумы');
    await shot(page, config, '2-practicums');

    // «Научное познание» — отдельная тема с двумя практикумами.
    await pick(page, 'topic', 'OBS-SCK');
    assert.equal(await page.textContent('#practicum-title'), 'Практикумы по теме «Научное познание»');
    assert.deepEqual(await page.locator('.practicum-card').evaluateAll((list) => list.map((c) => c.dataset.practicum)),
      ['OBS-SCK-P01', 'OBS-SCK-P02']);
    for (const id of ['OBS-SCK-P01', 'OBS-SCK-P02']) {
      assert.equal(await card(page, id).locator('.practicum-card__meta').textContent(), '25 заданий · максимум 39 баллов', id);
    }
    await assertNoHorizontalScroll(page, 'практикумы «Научного познания»');

    // «Общество как система. Социальные институты» — два практикума, без номеров кодификатора.
    await pick(page, 'topic', 'OBS-SYS');
    assert.equal(await page.textContent('#practicum-title'),
      'Практикумы по теме «Общество как система. Социальные институты»');
    assert.deepEqual(await page.locator('.practicum-card').evaluateAll((list) => list.map((c) => c.dataset.practicum)),
      ['OBS-SYS-P01', 'OBS-SYS-P02']);
    assert.equal(await card(page, 'OBS-SYS-P01').locator('.practicum-card__meta').textContent(), '18 заданий · максимум 32 балла');
    assert.equal(await card(page, 'OBS-SYS-P02').locator('.practicum-card__meta').textContent(), '18 заданий · максимум 31 балл');
    await assertNoHorizontalScroll(page, 'практикумы «Общества как системы»');
    await shot(page, config, '2c-society-system');

    // Другая тема — карточки обновляются.
    await pick(page, 'topic', 'OBS-ACT');
    assert.equal(await page.textContent('#practicum-title'), 'Практикумы по теме «Деятельность»');
    assert.equal(await page.locator('.practicum-card').count(), 1);
    assert.equal(await card(page, 'OBS-ACT-P01').locator('.practicum-card__meta').textContent(), '16 заданий · максимум 31 балл');

    // Другой раздел — выбор темы сбрасывается, практикумы скрываются.
    await pick(page, 'section', 'SOC');
    assert.deepEqual(await values(page, 'topic'), ['SOC-FAM']);
    assert.equal(await page.locator('input[name="topic"]:checked').count(), 0, 'смена раздела сбрасывает тему');
    assert.ok(await page.locator('#practicum-field').isHidden());
    await pick(page, 'topic', 'SOC-FAM');
    assert.equal(await noteOf(page, 'topic', 'SOC-FAM'), '2 практикума');
    assert.deepEqual(await page.locator('.practicum-card').evaluateAll((list) => list.map((c) => c.dataset.practicum)),
      ['SOC-FAM-P01', 'SOC-FAM-P02'], 'прежний набор новому ученику не предлагается');
    assert.deepEqual(await page.locator('.practicum-card__title').allTextContents(), ['Практикум № 1', 'Практикум № 2']);
    assert.equal(await card(page, 'SOC-FAM-P01').locator('.practicum-card__meta').textContent(), '16 заданий · максимум 29 баллов');
    assert.equal(await card(page, 'SOC-FAM-P02').locator('.practicum-card__meta').textContent(), '15 заданий · максимум 28 баллов');
    await assertNoHorizontalScroll(page, 'два практикума');
    await shot(page, config, '2b-family');

    // Раздел и тема запоминаются.
    await page.reload();
    assert.ok(await radio(page, 'section', 'SOC').isChecked());
    assert.ok(await radio(page, 'topic', 'SOC-FAM').isChecked());
    assert.ok(await card(page, 'SOC-FAM-P01').isVisible());

    // Разделы без готовых практикумов — понятное сообщение, ни тем, ни практикумов.
    for (const [id, title] of [['ECO', 'Экономика'], ['POL', 'Политика'], ['LAW', 'Право']]) {
      assert.equal(await noteOf(page, 'section', id), 'Практикумы готовятся', id);
      await pick(page, 'section', id);
      assert.ok(await page.locator('#topic-field').isHidden(), id);
      assert.equal(await page.locator('input[name="topic"]').count(), 0, id);
      assert.ok(await page.locator('#practicum-field').isHidden(), id);
      assert.equal(await page.textContent('#section-empty'),
        `Практикумы по разделу «${title}» готовятся. Когда они будут готовы, они появятся здесь.`);
    }
    // Сообщение читается в обеих темах оформления: текст отличается от фона.
    const [color, background] = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('section-empty'));
      return [cs.color, cs.backgroundColor];
    });
    assert.notEqual(color, background);
    await assertNoHorizontalScroll(page, 'раздел без практикумов');
    await shot(page, config, '3-section-empty');

    // Задания «Общих вопросов» остаются в банке, хотя ученику не показываются.
    assert.deepEqual(await page.evaluate(() => ['OBS-GEN', 'ECO-GEN', 'POL-GEN', 'LAW-GEN']
      .map((id) => EGE.getTasksByTopic(id).length)), [3, 3, 3, 3]);

    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: сохранённые ранее формат и «все разделы» не мешают выбору`, async () => {
    for (const format of ['matching', 'exclude-two', 'multiple', 'essay']) {
      const storage = JSON.stringify({ section: 'OBS', topic: 'OBS-ACT', format });
      const { page, context, errors } = await open(config, { storage });
      assert.ok(await radio(page, 'topic', 'OBS-ACT').isChecked());
      assert.equal(await card(page, 'OBS-ACT-P01').locator('.practicum-card__meta').textContent(), '16 заданий · максимум 31 балл', format);
      await card(page, 'OBS-ACT-P01').locator('.practicum-card__start').click();
      assert.match(await page.textContent('#progress-label'), /^Задание 1 из 16 /);
      assert.equal(await page.locator('#task-nav .task-nav__item').count(), 16);
      assert.deepEqual(errors, []);
      await context.close();
    }
    // Прежние «Все разделы», «Весь раздел», «Общие вопросы»: тема сбрасывается, верный раздел остаётся.
    for (const [saved, section] of [
      [{ section: 'all', topic: 'all' }, null],
      [{ section: 'OBS', topic: 'all' }, 'OBS'],
      [{ section: 'OBS', topic: 'OBS-GEN' }, 'OBS'],
      [{ section: 'ECO', topic: 'ECO-GEN' }, 'ECO']
    ]) {
      const where = JSON.stringify(saved);
      const { page, context, errors } = await open(config, { storage: JSON.stringify(saved) });
      assert.equal(await page.locator('input[name="section"]:checked').count(), section ? 1 : 0, where);
      if (section) assert.ok(await radio(page, 'section', section).isChecked(), where);
      assert.equal(await page.locator('input[name="topic"]:checked').count(), 0, where);
      assert.ok(await page.locator('#practicum-field').isHidden(), where);
      assert.equal(await page.locator('#section-empty').isVisible(), section === 'ECO', where);
      assert.deepEqual(errors, []);
      await context.close();
    }
  });

  test(`${config.name}: два лишних термина (клавиатура), ровно две позиции`, async () => {
    const { page, context, errors } = await open(config);
    await openPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
    assert.equal(await page.textContent('#quiz-title'), 'Деятельность · Практикум № 1');

    const { key } = await advanceTo(page, 'exclude-two');
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
    await shot(page, config, '4-exclude-draft');

    await page.keyboard.press('Enter');
    await page.waitForSelector('#feedback:not([hidden])');
    assert.equal(await page.textContent('.points__value'), '1 из 1 балла');
    assert.equal(await page.locator('#statements .statement.status-hit').count(), 2);
    await shot(page, config, '5-exclude-answered');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: соответствие — частичный ответ не засчитывается, верный — 2 балла`, async () => {
    const { page, context, errors } = await open(config);
    await openPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');

    const { key } = await advanceTo(page, 'matching');
    for (let row = 0; row < key.length - 1; row++) {
      await page.click(`.match-choice[data-row="${row}"][data-n="${key[row]}"]`);
    }
    assert.ok(await page.locator('#submit-btn').isDisabled(), 'не все позиции заполнены');
    await page.click(`.match-choice[data-row="${key.length - 1}"][data-n="${key[key.length - 1]}"]`);
    assert.ok(!(await page.locator('#submit-btn').isDisabled()));
    await assertNoHorizontalScroll(page, 'задание matching');
    await shot(page, config, '6-matching-draft');

    await page.click('#submit-btn');
    await page.waitForSelector('#feedback:not([hidden])');
    assert.equal(await page.textContent('.points__value'), '2 из 2 баллов');
    assert.equal(await page.locator('.match-row.status-right').count(), key.length);
    await shot(page, config, '7-matching-answered');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: выбор нескольких ответов, итоги практикума, повторное прохождение и возврат к выбору`, async () => {
    const { page, context, errors } = await open(config);
    await openPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');

    const first = await advanceTo(page, 'multiple');
    const before = await page.textContent('#progress-label');
    const firstIndex = Number(/^Задание (\d+)/.exec(before)[1]);
    // Один пропущенный верный ответ — 1 балл.
    for (const n of first.key.slice(1)) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
    await page.click('#submit-btn');
    await page.waitForSelector('#feedback:not([hidden])');
    assert.equal(await page.textContent('.points__value'), '1 из 2 баллов');
    assert.equal(await page.locator('#statements .statement.status-missed').count(), 1);
    // Статус в разборе выражен не только цветом: подпись и значок.
    // Задания перемешаны: первым может оказаться выбор вариантов (choiceOf: 'items') — у него своя подпись.
    assert.match(await page.textContent('#statements .statement.status-missed .statement__tag'),
      first.choiceOfItems ? /Пропущено — этот вариант подходит/ : /Пропущено — это суждение верное/);
    assert.equal(await page.locator('#statements .statement.status-missed .statement__icon[aria-hidden="true"]').count(), 1);
    // У старых заданий нет source — блок пояснений скрыт.
    assert.ok(await page.locator('#task-notes').isHidden());

    for (let i = firstIndex; i < 16; i++) {
      await page.click('#next-btn');
      await answerWithKey(page, await currentKey(page));
    }
    await page.click('#next-btn');
    await page.waitForSelector('#screen-result:not([hidden])');
    assert.equal(await page.textContent('#result-title'), 'Практикум завершён');
    assert.equal(await page.textContent('#result-context'), 'Деятельность · Практикум № 1');
    assert.equal(await page.textContent('#result-score'), '30 из 31 балла');
    await assertNoHorizontalScroll(page, 'итоги');
    await shot(page, config, '8-result');

    // «Пройти ещё раз» — тот же практикум заново.
    await page.click('#restart-btn');
    await page.waitForSelector('#screen-quiz:not([hidden])');
    assert.match(await page.textContent('#progress-label'), /^Задание 1 из 16 · выполнено 0$/);
    assert.equal(await page.textContent('#quiz-title'), 'Деятельность · Практикум № 1');
    assert.ok(await page.locator('#feedback').isHidden());
    assert.equal(await page.locator('#statements .statement.is-selected, .match-choice.is-selected').count(), 0);
    await answerWithKey(page, await currentKey(page));

    // Возврат к выбору: через логотип (с подтверждением) — та же тема, карточка предлагает продолжить.
    await page.click('#brand-home');
    await page.click('#exit-confirm');
    await page.waitForSelector('#screen-start:not([hidden])');
    assert.ok(await radio(page, 'topic', 'OBS-ACT').isChecked());
    assert.ok(await card(page, 'OBS-ACT-P01').locator('.practicum-card__continue').isVisible());
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: поля схемы 2 в разборе (тестовые задания)`, async () => {
    const { page, context, errors } = await open(config, { withFixture: true });
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-GRP');
    assert.equal(await card(page, 'SOC-GRP-P01').locator('.practicum-card__meta').textContent(), '2 задания · максимум 3 балла');
    await card(page, 'SOC-GRP-P01').locator('.practicum-card__start').click();

    // В тестовой теме два задания — exclude-two и matching — в случайном порядке.
    for (let i = 0; i < 2; i++) {
      const task = await currentKey(page);
      if (task.type === 'exclude-two') {
        for (const n of [2, 5]) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
        await page.click('#submit-btn');
        await page.waitForSelector('#task-notes:not([hidden])');
        assert.match(await page.textContent('#task-notes .task-notes__feature'), /Общий признак ряда.*Тестовый общий признак/s);
        assert.equal(await page.textContent('#task-notes .task-notes__source'),
          'Источник: Тестовое пособие, 2025, с. 1, № 1 (формулировка адаптирована)');
        assert.match(await page.textContent('#statements .statement[data-number="2"] .statement__mistake'), /Типичная ошибка: Тестовая типичная ошибка/);
        await assertNoHorizontalScroll(page, 'разбор exclude-two');
        await shot(page, config, '9-schema2-exclude');
      } else {
        // Соответствие с повторами, 7 вариантами и длинной формулировкой.
        for (let row = 0; row < task.key.length; row++) {
          await page.click(`.match-choice[data-row="${row}"][data-n="${task.key[row]}"]`);
        }
        await assertNoHorizontalScroll(page, 'matching, 7 вариантов');
        await shot(page, config, '10-schema2-matching-draft');
        await page.click('#submit-btn');
        assert.equal(await page.textContent('#task-notes .task-notes__source'), 'Авторское задание');
        assert.match(await page.textContent('.match-row[data-row="0"] .statement__mistake'), /Тестовая ошибка соответствия/);
        assert.equal(await page.locator('#task-notes .task-notes__feature').count(), 0, 'общий признак только у exclude-two');
        await assertNoHorizontalScroll(page, 'разбор matching');
        await shot(page, config, '11-schema2-matching-answered');
      }
      await page.click('#next-btn');
    }

    // Итоги: пояснения есть и в разборе.
    await page.waitForSelector('#screen-result:not([hidden])');
    await page.click('#expand-all-btn');
    assert.match(await page.locator('#review-list').textContent(), /Тестовое пособие/);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: «Семья и брак», Практикумы № 1 и № 2 — все 31 задание проходят и отображаются`, async () => {
    const { page, context, errors } = await open(config);
    const seen = new Set();
    for (const [id, n, total] of [['SOC-FAM-P01', 16, 29], ['SOC-FAM-P02', 15, 28]]) {
      await openPracticum(page, 'SOC', 'SOC-FAM', id);
      const types = new Set();
      let max = 0;
      for (let i = 0; i < n; i++) {
        const task = await currentKey(page);
        assert.ok(!seen.has(task.id), `задание ${task.id} повторилось`);
        seen.add(task.id);
        types.add(task.type);
        await assertNoHorizontalScroll(page, `${task.id}, до ответа`);
        await answerWithKey(page, task);
        max += task.maxPoints;
        assert.equal(await page.textContent('.points__value'),
          task.maxPoints === 1 ? '1 из 1 балла' : '2 из 2 баллов', task.id);
        if (task.hasSource) {
          assert.equal(await page.textContent('#task-notes .task-notes__source'), 'Авторское задание', task.id);
        }
        assert.equal(await page.locator('#task-notes .task-notes__feature').count(), task.hasFeature ? 1 : 0, task.id);
        // Объяснение есть у каждого суждения или позиции.
        const parts = task.type === 'matching' ? '.match-row' : '#statements .statement';
        assert.equal(await page.locator(`${parts} .statement__explanation`).count(), await page.locator(parts).count(), task.id);
        await assertNoHorizontalScroll(page, `${task.id}, разбор`);
        if (['SOC-FAM-033', 'SOC-FAM-038', 'SOC-FAM-040'].includes(task.id)) await shot(page, config, `fam-${task.id}`);
        await page.click('#next-btn');
      }
      await page.waitForSelector('#screen-result:not([hidden])');
      assert.deepEqual([...types].sort(), ['exclude-two', 'matching', 'multiple'], `${id}: все три формата`);
      assert.equal(max, total, id);
      assert.equal(await page.textContent('#result-percent'), '100%');
      assert.equal(await page.textContent('#result-context'), `Семья и брак · Практикум № ${id.endsWith('1') ? 1 : 2}`);
      await page.click('#home-btn');
    }
    assert.equal(seen.size, 31, 'вместе — все 31 задание темы, без повторов');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: «Научное познание» — оба практикума: порядок, объяснения, баллы, итоги, повтор`, async () => {
    const { page, context, errors } = await open(config);
    for (const [id, number] of [['OBS-SCK-P01', 1], ['OBS-SCK-P02', 2]]) {
      await openPracticum(page, 'OBS', 'OBS-SCK', id);
      assert.equal(await page.textContent('#quiz-title'), `Научное познание · Практикум № ${number}`);
      const order = await page.evaluate((pid) => Array.from(EGE.getPracticum(pid).taskIds), id);
      assert.equal(order.length, 25);
      let lost = 0;
      const wrongAt = new Set([0, 1, 2]);
      for (let i = 0; i < 25; i++) {
        assert.match(await page.textContent('#progress-label'), new RegExp(`^Задание ${i + 1} из 25 `));
        const task = await currentKey(page);
        assert.equal(task.id, order[i], `${id}: позиция ${i + 1}`);
        assert.ok(task.hasSource, task.id);
        let expected = task.maxPoints;
        if (wrongAt.has(i)) {
          // Ошибка в одну позицию: соответствие (модель задания 3) и «два лишних» — 0 баллов, выбор — 1 балл.
          const key = task.key.slice();
          if (task.type === 'matching') key[0] = key[0] === 1 ? 2 : 1;
          else if (task.type === 'exclude-two') key[1] = [1, 2, 3, 4, 5, 6].find((n) => !task.key.includes(n));
          else key.pop();
          await answerWithKey(page, { type: task.type, key });
          expected = task.type === 'multiple' ? 1 : 0;
          lost += task.maxPoints - expected;
        } else {
          await answerWithKey(page, task);
        }
        assert.equal(await page.textContent('.points__value'),
          await page.evaluate(([p, m]) => EGE.scoring.formatPointsOutOf(p, m), [expected, task.maxPoints]), task.id);
        // После ответа у каждого варианта и каждой позиции — объяснение.
        const parts = task.type === 'matching' ? 5 : await page.locator('#statements .statement').count();
        assert.equal(await page.locator('#screen-quiz .statement__explanation').count(), parts, `${task.id}: объяснения`);
        if (task.hasFeature) assert.ok(await page.locator('#task-notes').isVisible(), `${task.id}: общий признак ряда`);
        if (i === 0 || task.type === 'matching') await assertNoHorizontalScroll(page, `${task.id}, разбор`);
        if (i < 4) await shot(page, config, `sck-${number}-${task.id}`);
        await page.click('#next-btn');
      }
      await page.waitForSelector('#screen-result:not([hidden])');
      const score = 39 - lost;
      assert.equal(await page.textContent('#result-score'),
        await page.evaluate((s) => EGE.scoring.formatPointsOutOf(s, 39), score));
      assert.equal(await page.textContent('#result-percent'), `${Math.round(score / 39 * 100)}%`);
      assert.equal(await page.textContent('#result-context'), `Научное познание · Практикум № ${number}`);
      // Разбор: по умолчанию — задания с ошибками, можно показать все и раскрыть объяснения.
      assert.equal(await page.textContent('#filter-mistakes-label'), 'Только с ошибками (3)');
      assert.equal(await page.locator('#review-list .review-item').count(), 3);
      await page.locator('#review-filter label:has(input[value="all"])').click();
      assert.equal(await page.locator('#review-list .review-item').count(), 25);
      await page.click('#expand-all-btn');
      assert.ok(await page.locator('#review-list .statement__explanation').count() >= 125, 'объяснения всех вариантов в разборе');
      await assertNoHorizontalScroll(page, `${id}: итоги`);
      await shot(page, config, `sck-${number}-result`);
      // Пройти ещё раз — тот же практикум с начала.
      await page.click('#restart-btn');
      await page.waitForSelector('#screen-quiz:not([hidden])');
      assert.match(await page.textContent('#progress-label'), /^Задание 1 из 25 · выполнено 0$/);
      assert.equal((await currentKey(page)).id, order[0]);
      // Ответов в новой попытке ещё нет — выход без подтверждения.
      await page.click('#brand-home');
      if (await page.locator('#exit-confirm').isVisible()) await page.click('#exit-confirm');
      await page.waitForSelector('#screen-start:not([hidden])');
    }
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: «Общество как система. Социальные институты» — оба практикума: порядок, «Как решать», баллы 0/1/2, итоги`, async () => {
    const { page, context, errors } = await open(config);
    const title = 'Общество как система. Социальные институты';
    // Номер задания в практикуме → вид ошибки: one — одна ошибка, two — две ошибки.
    const plans = [
      // П1-14 (2 верных), П1-16 (4 верных), П2-3 (2 верных), П2-7 (4 верных) — проверка оценивания при 2 и 4 верных.
      ['OBS-SYS-P01', 1, 32, { 0: 'one', 1: 'one', 2: 'two', 8: 'one', 13: 'one', 15: 'one' }],
      ['OBS-SYS-P02', 2, 31, { 0: 'one', 1: 'one', 2: 'one', 3: 'two', 6: 'two', 9: 'one' }]
    ];
    for (const [id, number, max, wrongAt] of plans) {
      await openPracticum(page, 'OBS', 'OBS-SYS', id);
      assert.equal(await page.textContent('#quiz-title'), `${title} · Практикум № ${number}`);
      const order = await page.evaluate((pid) => Array.from(EGE.getPracticum(pid).taskIds), id);
      assert.equal(order.length, 18);
      let lost = 0;
      for (let i = 0; i < 18; i++) {
        assert.match(await page.textContent('#progress-label'), new RegExp(`^Задание ${i + 1} из 18 `));
        const task = await currentKey(page);
        assert.equal(task.id, order[i], `${id}: позиция ${i + 1}`);
        let expected = task.maxPoints;
        const kind = wrongAt[i];
        if (kind) {
          const key = task.key.slice();
          const wrong = (n) => [1, 2, 3, 4, 5, 6].filter((x) => !task.key.includes(x))[n];
          if (task.type === 'matching') key[0] = key[0] === 1 ? 2 : 1;
          else if (task.type === 'exclude-two') key[1] = wrong(0);
          else if (kind === 'one') key.pop();
          else { key.splice(0, 2, wrong(0)); } // замена и пропуск — две ошибки (работает и при одном неверном варианте)
          await answerWithKey(page, { type: task.type, key });
          // Задания 1 и 3 — 1 балл только за полностью верный ответ; 2 и 4 — 1 балл за одну ошибку, 0 — за две.
          expected = task.type === 'multiple' && kind === 'one' ? 1 : 0;
          lost += task.maxPoints - expected;
        } else {
          await answerWithKey(page, task);
        }
        assert.equal(await page.textContent('.points__value'),
          await page.evaluate(([p, m]) => EGE.scoring.formatPointsOutOf(p, m), [expected, task.maxPoints]), task.id);
        const parts = task.type === 'matching' ? 5 : await page.locator('#statements .statement').count();
        assert.equal(await page.locator('#screen-quiz .statement__explanation').count(), parts, `${task.id}: объяснения`);
        // «Как решать» — в блоке пояснений после ответа; у задания 1 — и общий признак ряда.
        assert.ok(await page.locator('#task-notes').isVisible(), `${task.id}: пояснения`);
        const notes = await page.locator('#task-notes .statement__tag').allTextContents();
        assert.equal(notes[0], 'Как решать', task.id);
        assert.equal(notes.includes('Общий признак ряда'), task.hasFeature, task.id);
        await assertNoHorizontalScroll(page, `${task.id}, разбор`);
        if (kind || task.type === 'matching') await shot(page, config, `sys-${number}-${String(i + 1).padStart(2, '0')}-${task.id}`);
        await page.click('#next-btn');
      }
      await page.waitForSelector('#screen-result:not([hidden])');
      const score = max - lost;
      assert.equal(await page.textContent('#result-score'),
        await page.evaluate(([s, m]) => EGE.scoring.formatPointsOutOf(s, m), [score, max]));
      assert.equal(await page.textContent('#result-percent'), `${Math.round(score / max * 100)}%`);
      assert.equal(await page.textContent('#result-context'), `${title} · Практикум № ${number}`);
      assert.equal(await page.textContent('#filter-mistakes-label'), 'Только с ошибками (6)');
      assert.equal(await page.locator('#review-list .review-item').count(), 6);
      await page.locator('#review-filter label:has(input[value="all"])').click();
      assert.equal(await page.locator('#review-list .review-item').count(), 18);
      await page.click('#expand-all-btn');
      assert.ok(await page.locator('#review-list .statement__explanation').count() >= 90, 'объяснения всех вариантов в разборе');
      assert.equal(await page.locator('#review-list .statement__tag', { hasText: 'Как решать' }).count(), 18, '«Как решать» в разборе');
      await assertNoHorizontalScroll(page, `${id}: итоги`);
      await shot(page, config, `sys-${number}-result`);
      await page.click('#brand-home');
      if (await page.locator('#exit-confirm').isVisible()) await page.click('#exit-confirm');
      await page.waitForSelector('#screen-start:not([hidden])');
    }
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: «Познание», Практикум № 1 — 19 заданий в утверждённом порядке, 33 балла`, async () => {
    const { page, context, errors } = await open(config);
    await openPracticum(page, 'OBS', 'OBS-COG', 'OBS-COG-P01');
    const order = await page.evaluate(() => Array.from(EGE.getPracticum('OBS-COG-P01').taskIds));
    for (let i = 0; i < 19; i++) {
      const task = await currentKey(page);
      assert.equal(task.id, order[i], `позиция ${i + 1}`);
      await answerWithKey(page, task);
      await page.click('#next-btn');
    }
    await page.waitForSelector('#screen-result:not([hidden])');
    assert.equal(await page.textContent('#result-score'), '33 из 33 баллов');
    assert.equal(await page.textContent('#result-context'), 'Познание · Практикум № 1');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('клавиатура: раздел, тема и практикум выбираются без мыши', async () => {
  const { page, context, errors } = await open(CONFIGS[0]);
  // Первый раздел — Tab с логотипа и ссылок шапки.
  await page.locator('input[name="section"][value="OBS"]').focus();
  await page.keyboard.press('Space');
  assert.ok(await radio(page, 'section', 'OBS').isChecked());
  // Стрелки внутри группы меняют раздел, темы обновляются.
  await page.keyboard.press('ArrowRight');
  assert.ok(await radio(page, 'section', 'ECO').isChecked());
  assert.ok(await page.locator('#section-empty').isVisible());
  await page.keyboard.press('ArrowLeft');
  assert.ok(await radio(page, 'section', 'OBS').isChecked());
  // Tab — к темам, Space — выбрать тему.
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.name), 'topic');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  assert.ok(await radio(page, 'topic', 'OBS-COG').isChecked());
  // Tab — к кнопке практикума; фокус виден.
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Начать практикум');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(outline, 'none', 'видимый фокус');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#screen-quiz:not([hidden])');
  assert.equal(await page.textContent('#quiz-title'), 'Познание · Практикум № 1');
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---------- Навигация ЕГЭ | Олимпиады в шапке ---------- */

const navLink = (page, label) => page.locator('.site-nav__link', { hasText: label });

/** Состояние попытки, которое не должно меняться после отмены выхода. */
const attemptState = (page) => page.evaluate(() => ({
  progress: document.getElementById('progress-label').textContent,
  score: document.getElementById('score-pill').textContent,
  question: document.getElementById('task-question').textContent,
  feedbackShown: !document.getElementById('feedback').hidden
}));

/**
 * Копия сайта во вложенной папке, как на тестовой ссылке Githack
 * (https://raw.githack.com/владелец/репозиторий/коммит/index.html): адрес папки
 * там отдаёт 404, поэтому ссылки шапки должны вести на файлы, а не на «./».
 */
test('шапка работает и на копии сайта во вложенной папке (как на Githack)', async () => {
  const mirror = 'https://githack.test/owner/ege-trainer/0123abcd/';
  const context = await browser.newContext({ viewport: CONFIGS[2].viewport, isMobile: true, hasTouch: true });
  await context.route('https://githack.test/**', async (route) => {
    const url = new URL(route.request().url());
    const rest = url.pathname.slice(new URL(mirror).pathname.length);
    if (!rest || rest.endsWith('/')) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    const response = await route.fetch({ url: base + rest });
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto(mirror + 'index.html');
  await page.waitForSelector('#screen-start:not([hidden])');
  // «Олимпиады» и обратно «ЕГЭ» — внутри той же копии.
  await navLink(page, 'Олимпиады').click();
  await page.waitForURL(mirror + 'olympiad.html');
  await navLink(page, 'ЕГЭ').click();
  await page.waitForURL(mirror + 'index.html');
  await page.waitForSelector('#screen-start:not([hidden])');
  // Логотип из практикума возвращает к выбору на этой же странице.
  await openPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
  await answerWithKey(page, await currentKey(page));
  await page.click('#brand-home');
  await page.click('#exit-confirm');
  await page.waitForSelector('#screen-start:not([hidden])');
  assert.equal(page.url(), mirror + 'index.html');
  assert.ok(await card(page, 'OBS-ACT-P01').locator('.practicum-card__continue').isVisible());
  // «ЕГЭ» со страниц предпросмотра — тоже на главную копии.
  await page.goto(mirror + 'preview-poznanie.html');
  await navLink(page, 'ЕГЭ').click();
  await page.waitForURL(mirror + 'index.html');
  assert.deepEqual(errors, []);
  await context.close();
});

for (const config of [CONFIGS[0], CONFIGS[2]]) {
  test(`${config.name}: шапка — на стартовом экране переход без подтверждения`, async () => {
    const { page, context, errors } = await open(config);
    await navLink(page, 'Олимпиады').click();
    await page.waitForURL(`${base}olympiad.html`);
    assert.equal(await page.getAttribute('.site-nav__link[aria-current="page"]', 'href'), 'olympiad.html');
    await navLink(page, 'ЕГЭ').click();
    await page.waitForURL(`${base}index.html`);
    assert.ok(await page.locator('#screen-start').isVisible());
    // Практикум начат, но ответов ещё нет — терять нечего, подтверждение не нужно.
    await openPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
    await navLink(page, 'Олимпиады').click();
    await page.waitForURL(`${base}olympiad.html`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: шапка — при начатом практикуме переход только после подтверждения`, async () => {
    const { page, context, errors } = await open(config);
    await openPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
    await answerWithKey(page, await currentKey(page));
    const before = await attemptState(page);
    assert.match(before.progress, /выполнено 1$/);

    // «Олимпиады» → предупреждение; «Продолжить» оставляет попытку как была.
    await navLink(page, 'Олимпиады').click();
    await page.waitForSelector('#exit-bar:not([hidden])');
    assert.equal(page.url(), base);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'exit-cancel');
    await page.click('#exit-cancel');
    assert.ok(await page.locator('#exit-bar').isHidden());
    assert.equal(page.url(), base);
    assert.deepEqual(await attemptState(page), before);
    // Попытка продолжается: следующее задание отвечается и засчитывается.
    await page.click('#next-btn');
    await answerWithKey(page, await currentKey(page));
    assert.match(await page.textContent('#progress-label'), /выполнено 2$/);

    // «ЕГЭ» (текущая страница) с клавиатуры → предупреждение; подтверждение перезагружает страницу.
    await navLink(page, 'ЕГЭ').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#exit-bar:not([hidden])');
    assert.ok(await page.locator('#screen-quiz').isVisible());
    await Promise.all([page.waitForEvent('load'), page.click('#exit-confirm')]);
    assert.equal(page.url(), `${base}index.html`);
    assert.ok(await page.locator('#screen-start').isVisible());

    // Подтверждение после «Олимпиады» ведёт на олимпиадную страницу.
    await card(page, 'OBS-ACT-P01').locator('.practicum-card__restart').click();
    await answerWithKey(page, await currentKey(page));
    await navLink(page, 'Олимпиады').click();
    await page.waitForSelector('#exit-bar:not([hidden])');
    await page.click('#exit-confirm');
    await page.waitForURL(`${base}olympiad.html`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: логотип — прежнее подтверждение выхода на стартовый экран`, async () => {
    const { page, context, errors } = await open(config);
    await openPracticum(page, 'OBS', 'OBS-ACT', 'OBS-ACT-P01');
    await answerWithKey(page, await currentKey(page));
    const before = await attemptState(page);
    await page.click('#brand-home');
    await page.waitForSelector('#exit-bar:not([hidden])');
    await page.click('#exit-cancel');
    assert.deepEqual(await attemptState(page), before);
    // Отмена выхода по ссылке не подменяет действие логотипа: снова логотип → стартовый экран.
    await navLink(page, 'Олимпиады').click();
    await page.click('#exit-cancel');
    await page.click('#brand-home');
    await page.click('#exit-confirm');
    await page.waitForSelector('#screen-start:not([hidden])');
    assert.equal(page.url(), base);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
