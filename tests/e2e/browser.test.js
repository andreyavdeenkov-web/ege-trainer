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
 * Проходит задания тренировки верными ответами, пока текущим не станет задание
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

/** Счётчики, которые должны быть на карточках: все задания во всех форматах. */
const bankCounts = (page) => page.evaluate(() => ({
  'OBS-ACT': EGE.getTasksByTopic('OBS-ACT').length,
  SOC: EGE.getTrainingTopics('SOC').reduce((n, t) => n + EGE.getTasksByTopic(t.id).length, 0),
  'SOC-FAM': EGE.getTasksByTopic('SOC-FAM').length
}));
const countOf = (page, name, value) =>
  page.locator(`label.topic-option:has(input[name="${name}"][value="${value}"]) .topic-option__count`).textContent();

for (const config of CONFIGS) {
  test(`${config.name}: главный экран — только раздел и тема, все форматы`, async () => {
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

    // Выбора формата нет ни в каком виде.
    assert.equal(await page.locator('input[name="format"], #train-settings, #format-options').count(), 0);
    assert.deepEqual(await page.locator('#start-form legend').allTextContents(), ['Раздел', 'Тема']);

    // Счётчики — все задания конкретных тем во всех форматах.
    const counts = await bankCounts(page);
    assert.match(await countOf(page, 'section', 'SOC'), new RegExp(`^${counts.SOC} `));
    await assertNoHorizontalScroll(page, 'старт');
    await shot(page, config, '1-start');

    await pick(page, 'section', 'OBS');
    assert.match(await countOf(page, 'topic', 'OBS-ACT'), /^16 заданий$/);
    await pick(page, 'topic', 'OBS-ACT');
    assert.equal(await page.textContent('#start-btn'), 'Начать: 16 заданий');
    await pick(page, 'section', 'SOC');
    assert.equal(await page.locator('input[name="topic"]:checked').count(), 0, 'смена раздела сбрасывает тему');
    assert.equal(await page.textContent('#start-btn'), 'Выберите тему');
    assert.ok(await page.locator('#start-btn').isDisabled());
    await pick(page, 'topic', 'SOC-FAM');
    assert.equal(await page.textContent('#start-btn'), `Начать: ${counts['SOC-FAM']} задание`);
    await shot(page, config, '2-topic');

    // Раздел и тема запоминаются.
    await page.reload();
    assert.ok(await radio(page, 'section', 'SOC').isChecked());
    assert.ok(await radio(page, 'topic', 'SOC-FAM').isChecked());

    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: тренировка только по конкретной теме — без «Все разделы», «Весь раздел», «Общие вопросы»`, async () => {
    const { page, context, errors } = await open(config);
    const titles = (field) => page.locator(`#${field} .topic-option__title`).allTextContents();

    // До выбора: темы скрыты, старт недоступен.
    assert.deepEqual(await titles('section-options'),
      ['Человек и общество', 'Экономика', 'Социальные отношения', 'Политика', 'Право']);
    assert.equal(await page.locator('input[value="all"][name="section"], input[name="topic"]').count(), 0);
    assert.ok(await page.locator('#topic-field').isHidden());
    assert.equal(await page.textContent('#start-btn'), 'Выберите раздел');
    assert.ok(await page.locator('#start-btn').isDisabled());

    // Раздел с темами: только конкретные темы, «Общие вопросы» нет.
    await pick(page, 'section', 'OBS');
    assert.deepEqual(await titles('topic-options'), ['Деятельность']);
    assert.ok(await page.locator('#topic-empty').isHidden());
    assert.equal(await page.textContent('#start-btn'), 'Выберите тему');
    assert.ok(await page.locator('#start-btn').isDisabled());
    await pick(page, 'section', 'SOC');
    assert.deepEqual(await titles('topic-options'),
      ['Социальная стратификация', 'Социальная мобильность', 'Семья и брак']);
    await assertNoHorizontalScroll(page, 'темы раздела');

    // Раздел без конкретных тем: понятное сообщение и недоступная кнопка.
    for (const [id, title] of [['ECO', 'Экономика'], ['POL', 'Политика'], ['LAW', 'Право']]) {
      assert.equal(await countOf(page, 'section', id), 'Темы готовятся');
      await pick(page, 'section', id);
      assert.ok(await page.locator('#topic-options').isHidden(), id);
      assert.equal(await page.locator('input[name="topic"]').count(), 0, id);
      assert.ok(await page.locator('#topic-empty').isVisible(), id);
      assert.match(await page.textContent('#topic-empty'), new RegExp(`^В разделе «${title}» пока нет отдельных тем`));
      assert.equal(await page.textContent('#start-btn'), 'В разделе пока нет тем');
      assert.ok(await page.locator('#start-btn').isDisabled());
    }
    // Сообщение читается в обеих темах оформления: текст отличается от фона.
    const colors = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('topic-empty'));
      return [cs.color, cs.backgroundColor];
    });
    assert.notEqual(colors[0], colors[1]);
    await assertNoHorizontalScroll(page, 'раздел без тем');
    await shot(page, config, '1b-no-topics');

    // Задания «Общих вопросов» остаются в банке.
    const general = await page.evaluate(() => ['OBS-GEN', 'ECO-GEN', 'POL-GEN', 'LAW-GEN']
      .map((id) => EGE.getTasksByTopic(id).length));
    assert.deepEqual(general, [3, 3, 3, 3]);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: прежний выбор «Все разделы», «Весь раздел», «Общие вопросы» сбрасывается`, async () => {
    for (const [saved, section, button] of [
      [{ section: 'all', topic: 'all' }, null, 'Выберите раздел'],
      [{ section: 'OBS', topic: 'all' }, 'OBS', 'Выберите тему'],
      [{ section: 'OBS', topic: 'OBS-GEN' }, 'OBS', 'Выберите тему'],
      [{ section: 'ECO', topic: 'ECO-GEN' }, 'ECO', 'В разделе пока нет тем']
    ]) {
      const { page, context, errors } = await open(config, { storage: JSON.stringify(saved) });
      const where = JSON.stringify(saved);
      assert.equal(await page.locator('input[name="section"]:checked').count(), section ? 1 : 0, where);
      if (section) assert.ok(await radio(page, 'section', section).isChecked(), where);
      assert.equal(await page.locator('input[name="topic"]:checked').count(), 0, where);
      assert.equal(await page.textContent('#start-btn'), button, where);
      assert.ok(await page.locator('#start-btn').isDisabled(), where);
      assert.deepEqual(errors, []);
      await context.close();
    }
  });

  test(`${config.name}: сохранённый ранее формат не ограничивает набор заданий`, async () => {
    for (const format of ['matching', 'exclude-two', 'multiple', 'essay']) {
      const storage = JSON.stringify({ section: 'OBS', topic: 'OBS-ACT', format });
      const { page, context, errors } = await open(config, { storage });
      assert.ok(await radio(page, 'topic', 'OBS-ACT').isChecked());
      assert.equal(await page.textContent('#start-btn'), 'Начать: 16 заданий', format);
      await page.click('#start-btn');
      assert.match(await page.textContent('#progress-label'), /^Задание 1 из 16 /);
      assert.equal(await page.locator('#task-nav .task-nav__item').count(), 16);
      assert.deepEqual(errors, []);
      await context.close();
    }
  });

  test(`${config.name}: два лишних термина (клавиатура), ровно две позиции`, async () => {
    const { page, context, errors } = await open(config);
    await pick(page, 'section', 'OBS');
    await pick(page, 'topic', 'OBS-ACT');
    await page.click('#start-btn');

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
    await pick(page, 'topic', 'OBS-ACT');
    await page.click('#start-btn');

    const { key } = await advanceTo(page, 'matching');
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
    await pick(page, 'topic', 'SOC-STR');
    assert.equal(await page.textContent('#start-btn'), 'Начать: 6 заданий');
    await page.click('#start-btn');

    const first = await currentKey(page);
    assert.equal(first.type, 'multiple');
    // Один пропущенный верный ответ — 1 балл.
    for (const n of first.key.slice(1)) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
    await page.click('#submit-btn');
    await page.waitForSelector('#feedback:not([hidden])');
    assert.equal(await page.textContent('.points__value'), '1 из 2 баллов');
    assert.equal(await page.locator('#statements .statement.status-missed').count(), 1);
    // Статус в разборе выражен не только цветом: подпись и значок.
    assert.match(await page.textContent('#statements .statement.status-missed .statement__tag'), /Пропущено — это суждение верное/);
    assert.equal(await page.locator('#statements .statement.status-missed .statement__icon[aria-hidden="true"]').count(), 1);
    // У старых заданий нет source — блок пояснений скрыт.
    assert.ok(await page.locator('#task-notes').isHidden());

    for (let i = 1; i < 6; i++) {
      await page.click('#next-btn');
      await answerWithKey(page, await currentKey(page));
    }
    await page.click('#next-btn');
    await page.waitForSelector('#screen-result:not([hidden])');
    assert.equal(await page.textContent('#result-score'), '11 из 12 баллов');
    await assertNoHorizontalScroll(page, 'итоги');
    await shot(page, config, '7-result');

    await page.click('#restart-btn');
    await page.waitForSelector('#screen-quiz:not([hidden])');
    assert.match(await page.textContent('#progress-label'), /^Задание 1 из 6 · выполнено 0$/);
    assert.ok(await page.locator('#feedback').isHidden());
    assert.equal(await page.locator('#statements .statement.is-selected').count(), 0);
    await answerWithKey(page, await currentKey(page));
    assert.equal(await page.textContent('.points__value'), '2 из 2 баллов');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: поля схемы 2 в разборе (тестовые задания)`, async () => {
    const { page, context, errors } = await open(config, { withFixture: true });
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-GRP');
    assert.equal(await page.textContent('#start-btn'), 'Начать: 2 задания');
    await page.click('#start-btn');

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
        await shot(page, config, '8-schema2-exclude');
      } else {
        // Соответствие с повторами, 7 вариантами и длинной формулировкой.
        for (let row = 0; row < task.key.length; row++) {
          await page.click(`.match-choice[data-row="${row}"][data-n="${task.key[row]}"]`);
        }
        await assertNoHorizontalScroll(page, 'matching, 7 вариантов');
        await shot(page, config, '9-schema2-matching-draft');
        await page.click('#submit-btn');
        assert.equal(await page.textContent('#task-notes .task-notes__source'), 'Авторское задание');
        assert.match(await page.textContent('.match-row[data-row="0"] .statement__mistake'), /Тестовая ошибка соответствия/);
        assert.equal(await page.locator('#task-notes .task-notes__feature').count(), 0, 'общий признак только у exclude-two');
        await assertNoHorizontalScroll(page, 'разбор matching');
        await shot(page, config, '10-schema2-matching-answered');
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

  test(`${config.name}: тема «Семья и брак» — все 31 задание проходят и отображаются`, async () => {
    const { page, context, errors } = await open(config);
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-FAM');
    assert.equal(await page.textContent('#start-btn'), 'Начать: 31 задание');
    await page.click('#start-btn');

    const seen = new Set();
    const types = new Set();
    let max = 0;
    for (let i = 0; i < 31; i++) {
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
    assert.deepEqual([...types].sort(), ['exclude-two', 'matching', 'multiple'], 'в тренировке все три формата');
    assert.equal(max, 16 * 2 + 5 + 10 * 2);
    assert.equal(await page.textContent('#result-percent'), '100%');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

/* ---------- Навигация ЕГЭ | Олимпиады в шапке ---------- */

const navLink = (page, label) => page.locator('.site-nav__link', { hasText: label });

/** Состояние попытки, которое не должно меняться после отмены выхода. */
const attemptState = (page) => page.evaluate(() => ({
  progress: document.getElementById('progress-label').textContent,
  score: document.getElementById('score-pill').textContent,
  question: document.getElementById('task-question').textContent,
  feedbackShown: !document.getElementById('feedback').hidden
}));

for (const config of [CONFIGS[0], CONFIGS[2]]) {
  test(`${config.name}: шапка — на стартовом экране переход без подтверждения`, async () => {
    const { page, context, errors } = await open(config);
    await navLink(page, 'Олимпиады').click();
    await page.waitForURL(`${base}olympiad.html`);
    assert.equal(await page.getAttribute('.site-nav__link[aria-current="page"]', 'href'), 'olympiad.html');
    await navLink(page, 'ЕГЭ').click();
    await page.waitForURL(base);
    assert.ok(await page.locator('#screen-start').isVisible());
    // Тренировка начата, но ответов ещё нет — терять нечего, подтверждение не нужно.
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-STR');
    await page.click('#start-btn');
    await page.waitForSelector('#screen-quiz:not([hidden])');
    await navLink(page, 'Олимпиады').click();
    await page.waitForURL(`${base}olympiad.html`);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test(`${config.name}: шапка — при начатой тренировке переход только после подтверждения`, async () => {
    const { page, context, errors } = await open(config);
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-STR');
    await page.click('#start-btn');
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
    assert.equal(page.url(), base);
    assert.ok(await page.locator('#screen-start').isVisible());

    // Подтверждение после «Олимпиады» ведёт на олимпиадную страницу.
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-STR');
    await page.click('#start-btn');
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
    await pick(page, 'section', 'SOC');
    await pick(page, 'topic', 'SOC-STR');
    await page.click('#start-btn');
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
