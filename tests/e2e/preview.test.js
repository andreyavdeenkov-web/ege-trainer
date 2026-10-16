'use strict';

/**
 * Браузерные тесты страницы предпросмотра preview-cognition.html
 * (партия 1 «Познание» и «Научное познание», 20 заданий) — компьютер и смартфон,
 * светлая и тёмная темы. Проверяют отображение четырёх моделей, ключи и баллы,
 * объяснения после ответа, переходы между заданиями, поведение при обновлении
 * страницы и отсутствие влияния на основной тренажёр.
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
const port = 19000 + Math.floor(Math.random() * 1000);
const base = `http://localhost:${port}/`;
const previewUrl = base + 'preview-cognition.html';
const shotsDir = process.env.E2E_SCREENSHOTS || null;

const CONFIGS = [
  { name: 'desktop-light', viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
  { name: 'desktop-dark', viewport: { width: 1280, height: 900 }, colorScheme: 'dark' },
  { name: 'mobile-light', viewport: { width: 360, height: 740 }, colorScheme: 'light', isMobile: true, hasTouch: true },
  { name: 'mobile-dark', viewport: { width: 360, height: 740 }, colorScheme: 'dark', isMobile: true, hasTouch: true }
];

/** Задания с намеренной ошибкой (номер в наборе с 1) и ожидаемые баллы. */
const WRONG = {
  1: { points: 0 },   // OBS-COG-002, соответствие (позиция 3 КИМ, 1 балл): одна неверная позиция
  2: { points: 1 },   // OBS-COG-003, суждения: пропущен один верный
  3: { points: 1 },   // OBS-COG-006, ситуация: одно лишнее
  4: { points: 1, replace: true },   // OBS-COG-008, суждения: одна цифра заменена другой (ФИПИ — 1 балл)
  19: { points: 0 }   // OBS-SCI-029, два лишних: одна неверная позиция
};

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

async function open(config, url) {
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
  await page.goto(url);
  return { page, context, errors };
}

async function shot(page, config, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `preview-${config.name}-${name}.png`), fullPage: true });
}

async function assertNoHorizontalScroll(page, where) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth
  }));
  assert.ok(scroll <= client, `${where}: горизонтальная прокрутка (${scroll} > ${client})`);
}

/** Задание, показанное на экране, — по позиции в попытке (порядок фиксирован). */
async function shownTask(page, index) {
  return page.evaluate((i) => {
    const id = EGE.preview.taskIds[i];
    const task = EGE.getTask(id);
    const type = EGE.scoring.getTaskType(task);
    return {
      id,
      type,
      kimTask: task.kimTask,
      choiceOf: task.choiceOf || null,
      question: task.question,
      key: Array.from(EGE.scoring.getCorrect(task)),
      maxPoints: EGE.scoring.getMaxPoints(task),
      size: type === 'matching' ? task.items.length : task.statements.length,
      options: type === 'matching' ? task.options.length : 0,
      keyText: EGE.scoring.formatTaskAnswer(task, EGE.scoring.getCorrect(task)),
      hasFeature: !!task.commonFeature
    };
  }, index);
}

/** Ответ для задания: ключ или ключ с одной ошибкой. */
function answerFor(task, wrong) {
  const key = task.key.slice();
  if (!wrong) return key;
  if (task.type === 'matching') {
    key[0] = key[0] === 1 ? 2 : 1;
    return key;
  }
  if (task.type === 'exclude-two') {
    const other = [1, 2, 3, 4, 5, 6].find((n) => !key.includes(n));
    return [key[0], other];
  }
  if (wrong.replace) {
    const other = [1, 2, 3, 4, 5, 6].slice(0, task.size).find((n) => !key.includes(n));
    return key.slice(1).concat(other);
  }
  if (task.choiceOf === 'items') {
    const extra = [1, 2, 3, 4, 5, 6].find((n) => !key.includes(n));
    return key.concat(extra);
  }
  return key.slice(1);
}

async function answer(page, task, selected) {
  if (task.type === 'matching') {
    for (let row = 0; row < selected.length; row++) {
      await page.click(`.match-choice[data-row="${row}"][data-n="${selected[row]}"]`);
    }
  } else {
    for (const n of selected) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
  }
  assert.ok(await page.isEnabled('#submit-btn'), `${task.id}: кнопка «Ответить» активна`);
  await page.click('#submit-btn');
  await page.waitForSelector('#feedback:not([hidden])');
}

for (const config of CONFIGS) {
  test(`${config.name}: предпросмотр — все 20 заданий, четыре модели, баллы, объяснения, переходы`, async () => {
    const { page, context, errors } = await open(config, previewUrl);

    // Стартовый экран: без выбора раздела и темы, весь набор.
    assert.equal(await page.textContent('#start-title'), 'Познание и научное познание: 20 новых заданий');
    assert.equal(await page.isVisible('#section-options'), false);
    assert.equal(await page.isVisible('#topic-field'), false);
    assert.equal(await page.textContent('#start-btn'), 'Начать: 20 заданий');
    await assertNoHorizontalScroll(page, 'старт');
    await shot(page, config, '00-start');
    await page.click('#start-btn');

    const models = new Set();
    let total = 0;
    let max = 0;
    for (let i = 0; i < 20; i++) {
      const n = i + 1;
      const task = await shownTask(page, i);
      models.add(task.kimTask);
      assert.equal(await page.textContent('#task-question'), task.question, `${task.id}: порядок заданий`);
      assert.match(await page.textContent('#progress-label'), new RegExp(`^Задание ${n} из 20`));
      assert.equal(await page.isVisible('#feedback'), false, `${task.id}: разбор до ответа скрыт`);

      // Отображение модели.
      if (task.type === 'matching') {
        assert.ok(await page.isVisible('#matching'));
        assert.equal(await page.locator('#matching .match-row').count(), task.size);
        assert.equal(await page.locator('#matching .match-row').first().locator('.match-choice').count(), task.options);
      } else {
        assert.ok(await page.isVisible('#statements'));
        assert.equal(await page.locator('#statements .statement').count(), task.size);
      }
      const hint = await page.textContent('#task-hint');
      if (task.type === 'exclude-two') assert.match(hint, /ровно две позиции/);
      else if (task.type === 'matching') assert.match(hint, /номер из второго столбца/);
      else if (task.choiceOf === 'items') assert.match(hint, /подходящие варианты/);
      else assert.match(hint, /верные суждения/);
      await assertNoHorizontalScroll(page, `${task.id} до ответа`);

      await answer(page, task, answerFor(task, WRONG[n]));

      // Баллы и правильный ответ.
      const expected = WRONG[n] ? WRONG[n].points : task.maxPoints;
      total += expected;
      max += task.maxPoints;
      assert.match(await page.textContent('#feedback-points'), new RegExp(`^${expected} из ${task.maxPoints}`), `${task.id}: баллы`);
      assert.equal(await page.textContent('#feedback-correct'), task.keyText, `${task.id}: правильный ответ`);
      assert.match(await page.textContent('#score-pill'), new RegExp(`^Баллы: ${total} из ${max}$`));

      // Объяснение у каждого варианта.
      const explanations = await page.locator('#task-card .statement__explanation').count();
      assert.equal(explanations, task.size, `${task.id}: объяснения всех вариантов`);
      if (task.hasFeature) assert.ok(await page.isVisible('#task-notes .task-notes__feature'), `${task.id}: общий признак ряда`);
      await assertNoHorizontalScroll(page, `${task.id} после ответа`);
      if (n === 1 || n === 2 || n === 3 || n === 19) await shot(page, config, `${String(n).padStart(2, '0')}-${task.id}`);

      // Переход назад к выполненному заданию и обратно (на втором задании).
      if (n === 2) {
        await page.click('#prev-btn');
        assert.match(await page.textContent('#progress-label'), /^Задание 1 из 20/);
        assert.ok(await page.isVisible('#feedback'), 'у выполненного задания виден разбор');
        assert.equal(await page.isVisible('#submit-btn'), false, 'засчитанный ответ не меняется');
        await page.click('#next-btn');
        assert.match(await page.textContent('#progress-label'), /^Задание 2 из 20/);
      }
      // Вперёд к невыполненным перейти нельзя.
      if (n < 19) {
        assert.ok(await page.locator('#task-nav li').nth(n + 1).locator('button').isDisabled());
      }
      await page.click('#next-btn');
    }
    assert.deepEqual([...models].sort(), [1, 2, 3, 4]);

    // Итоги.
    await page.waitForSelector('#screen-result:not([hidden])');
    assert.equal(max, 34);
    assert.equal(total, 29);
    assert.match(await page.textContent('#result-score'), /^29 из 34/);
    assert.equal(await page.textContent('#filter-mistakes-label'), 'Только с ошибками (5)');
    assert.equal(await page.locator('#review-list .review-item').count(), 5);
    await assertNoHorizontalScroll(page, 'итоги');
    await shot(page, config, '99-result');

    // Настройки основного тренажёра не записаны.
    assert.equal(await page.evaluate(() => localStorage.getItem('ege-trainer:settings')), null);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('обновление страницы: прогресс попытки предпросмотра сейчас НЕ сохраняется', async () => {
  const { page, context, errors } = await open(CONFIGS[0], previewUrl);
  await page.click('#start-btn');
  for (let i = 0; i < 2; i++) {
    const task = await shownTask(page, i);
    await answer(page, task, task.key);
    await page.click('#next-btn');
  }
  assert.match(await page.textContent('#progress-label'), /выполнено 2$/);
  await page.reload();
  // Фиксирует текущее поведение движка ЕГЭ: после обновления — стартовый экран, ответы потеряны.
  assert.ok(await page.isVisible('#screen-start'));
  assert.equal(await page.isVisible('#screen-quiz'), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('основной тренажёр не изменился: нет тем «Познание» и «Научное познание», счётчики прежние', async () => {
  const { page, context, errors } = await open(CONFIGS[0], base);
  assert.equal(await page.textContent('#start-title'), 'Практикуй задания ЕГЭ по обществознанию и разбирай каждую ошибку');
  const state = await page.evaluate(() => ({
    preview: typeof EGE.preview,
    obs: EGE.getTasksBySection('OBS').length,
    topics: EGE.getAvailableTopics('OBS').map((t) => t.id),
    previewTasks: EGE.tasks.filter((t) => /^OBS-(COG|SCI)-/.test(t.id)).length
  }));
  assert.equal(state.preview, 'undefined');
  assert.deepEqual(state.topics, ['OBS-GEN', 'OBS-ACT']);
  assert.equal(state.previewTasks, 0);
  await page.locator('label.topic-option:has(input[name="section"][value="OBS"])').click();
  assert.deepEqual(await page.locator('#topic-options .topic-option__title').allTextContents(),
    ['Весь раздел', 'Общие вопросы', 'Деятельность']);
  assert.match(await page.textContent('#start-btn'), new RegExp(`^Начать: ${state.obs} `));
  assert.ok(!(await page.content()).includes('preview-cognition'));
  assert.deepEqual(errors, []);
  await context.close();
});
