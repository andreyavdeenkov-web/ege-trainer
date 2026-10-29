'use strict';

/**
 * Браузерные тесты правила «один практикум — одна попытка» (js/app.js, js/attempt-save.js):
 * подтверждение старта, выход и продолжение, фиксация результата после последнего ответа,
 * карточка «Завершён» и «Посмотреть результаты», просмотр итогов и полного разбора без
 * возможности изменить ответы, закрытая до итогов вкладка, несколько вкладок, недоступное
 * и переполненное хранилище, повреждённый результат, копии заданий в разборе.
 * Страницы предпросмотра по-прежнему проходятся повторно.
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
const shotsDir = process.env.E2E_SCREENSHOTS || null;

const CONFIGS = [
  { name: 'desktop-light', viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
  { name: 'mobile-dark', viewport: { width: 360, height: 740 }, colorScheme: 'dark', isMobile: true, hasTouch: true }
];
const PID = 'OBS-COG-P01';
const SCOPE = 'ege/OBS/OBS-COG/OBS-COG-P01';
const ATTEMPT_KEY = 'ege-trainer:attempt:' + SCOPE;
const RESULT_KEY = 'ege-trainer:result:' + SCOPE;

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

function newContext(config) {
  return browser.newContext({
    viewport: config.viewport, colorScheme: config.colorScheme,
    isMobile: !!config.isMobile, hasTouch: !!config.hasTouch
  });
}

async function newPage(context, url = base) {
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
  await page.screenshot({ path: path.join(shotsDir, `one-attempt-${config.name}-${name}.png`), fullPage: true });
}

async function assertNoHorizontalScroll(page, where) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth
  }));
  assert.ok(scroll <= client, `${where}: горизонтальная прокрутка (${scroll} > ${client})`);
}

const pick = (page, name, value) => page.locator(`label.topic-option:has(input[name="${name}"][value="${value}"])`).click();
const card = (page, id = PID) => page.locator(`.practicum-card[data-practicum="${id}"]`);
const visibleButtons = (page, id = PID) => card(page, id).locator('button:visible').allTextContents();
const keys = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.indexOf('ege-trainer:') === 0 && k !== 'ege-trainer:settings').sort());

/** Итог из записи результата в хранилище — как его должен показать экран итогов. */
const storedScore = (page) => page.evaluate((k) => {
  const r = JSON.parse(localStorage.getItem(k));
  return EGE.scoring.formatPointsOutOf(EGE.attempt.totalScore(r.attempt), EGE.attempt.maxScore(r.attempt));
}, RESULT_KEY);

async function openTopic(page) {
  await pick(page, 'section', 'OBS');
  await pick(page, 'topic', 'OBS-COG');
}

/** Текущее задание на экране: id, тип и ключ. */
async function currentTask(page) {
  return page.evaluate(() => {
    const q = document.getElementById('task-question').textContent;
    const f = document.querySelector('#statements:not([hidden]) .statement__text, #matching:not([hidden]) .match-row__text');
    const t = EGE.tasks.find((x) => x.question === q && (x.statements ? x.statements[0].text : x.items[0].text) === (f && f.textContent));
    return { id: t.id, type: EGE.scoring.getTaskType(t), key: Array.from(EGE.scoring.getCorrect(t)), size: t.statements ? t.statements.length : 0 };
  });
}

/** Ответ кликами; wrong — одна ошибка (балл меньше максимума). */
async function answer(page, task, wrong) {
  const sel = task.key.slice();
  if (wrong) {
    if (task.type === 'matching') sel[0] = sel[0] === 1 ? 2 : 1;
    else sel[sel.length - 1] = [1, 2, 3, 4, 5, 6].slice(0, task.size).find((n) => !task.key.includes(n));
  }
  if (task.type === 'matching') {
    for (let r = 0; r < sel.length; r++) await page.click(`.match-choice[data-row="${r}"][data-n="${sel[r]}"]`);
  } else {
    for (const n of sel) await page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
  }
  await page.click('#submit-btn');
  await page.waitForSelector('#feedback:not([hidden])');
}

/**
 * Готовое состояние практикума в хранилище (как его записал бы тренажёр):
 * kind 'complete' — незавершённая запись, где даны все ответы (вкладку закрыли до итогов);
 * kind 'result' — зафиксированный результат. Первое задание — с ошибкой.
 */
async function seed(page, kind, pid = PID) {
  await page.evaluate(([k, id]) => {
    const p = EGE.getPracticum(id);
    const A = EGE.attempt;
    const S = EGE.attemptSave;
    const settings = { section: p.section, topic: p.topic, practicum: p.id };
    const a = A.createAttempt({ settings, taskIds: p.taskIds.slice() });
    a.taskIds.forEach((tid, i) => {
      const t = EGE.getTask(tid);
      let sel = Array.from(EGE.scoring.getCorrect(t));
      if (i === 0) {
        if (EGE.scoring.getTaskType(t) === 'matching') sel[0] = sel[0] === 1 ? 2 : 1;
        else sel = [sel[0], [1, 2, 3, 4, 5, 6].find((n) => !sel.includes(n))];
      }
      A.recordAnswer(a, t, sel);
    });
    const scope = S.scopeId('ege', settings);
    if (k === 'result') {
      A.finishAttempt(a);
      localStorage.setItem(S.resultKey(scope), JSON.stringify(S.buildResult({ scope, attempt: a, getTask: EGE.getTask })));
    } else {
      localStorage.setItem(S.storageKey(scope), JSON.stringify(S.buildRecord({ scope, attempt: a, viewIndex: a.taskIds.length - 1, draft: null, getTask: EGE.getTask })));
    }
  }, [kind, pid]);
}

/* ---------- Полный сценарий: компьютер и смартфон ---------- */

for (const config of CONFIGS) {
  test(`${config.name}: подтверждение, выход и продолжение, фиксация результата, просмотр без повторной попытки`, async () => {
    const context = await newContext(config);
    const { page, errors } = await newPage(context);
    await openTopic(page);

    // До начала: кратко на карточке и одно подтверждение по кнопке.
    assert.equal(await card(page).locator('.practicum-card__note').textContent(), 'Одна попытка. Прерваться и продолжить можно в любой момент.');
    assert.deepEqual(await visibleButtons(page), ['Начать практикум']);
    await card(page).locator('.practicum-card__start').click();
    assert.ok(await card(page).locator('.practicum-card__confirm').isVisible());
    assert.match(await card(page).locator('.practicum-card__confirm-text').textContent(), /проходится один раз/);
    assert.deepEqual(await visibleButtons(page), ['Начать', 'Отмена']);
    assert.ok(await page.locator('#screen-start').isVisible(), 'без подтверждения практикум не начинается');
    await assertNoHorizontalScroll(page, 'подтверждение');
    await shot(page, config, '1-confirm');
    await card(page).locator('.practicum-card__confirm-no').click();
    assert.deepEqual(await visibleButtons(page), ['Начать практикум']);
    assert.deepEqual(await keys(page), [], '«Отмена» ничего не начинает');

    await card(page).locator('.practicum-card__start').click();
    await card(page).locator('.practicum-card__confirm-yes').click();
    await page.waitForSelector('#screen-quiz:not([hidden])');
    const order = await page.evaluate((id) => Array.from(EGE.getPracticum(id).taskIds), PID);

    // Выход и продолжение — как раньше; начать заново нельзя.
    for (let i = 0; i < 3; i++) {
      await answer(page, await currentTask(page), i === 0);
      await page.click('#next-btn');
    }
    await page.click('#brand-home');
    await page.click('#exit-confirm');
    await page.waitForSelector('#screen-start:not([hidden])');
    assert.equal(await card(page).locator('.practicum-card__status').textContent(), 'Не завершён');
    assert.deepEqual(await visibleButtons(page), ['Продолжить']);
    await page.reload();
    assert.deepEqual(await visibleButtons(page), ['Продолжить']);
    await card(page).locator('.practicum-card__continue').click();
    assert.match(await page.textContent('#progress-label'), /^Задание 4 из 19 · выполнено 3$/);

    for (let i = 3; i < 19; i++) {
      const task = await currentTask(page);
      assert.equal(task.id, order[i]);
      await answer(page, task, false);
      if (i < 18) await page.click('#next-btn');
    }
    // Последний ответ засчитан — результат уже зафиксирован, хотя итоги ещё не открыты.
    assert.deepEqual(await keys(page), [RESULT_KEY]);
    await page.click('#next-btn');
    await page.waitForSelector('#screen-result:not([hidden])');
    const score = await page.textContent('#result-score');
    assert.match(score, /^3[0-2] из 33 баллов?$/);
    assert.ok(await page.locator('#restart-btn').isHidden(), '«Пройти ещё раз» нет');
    assert.match(await page.textContent('#result-fixed'), /^Результат зафиксирован \d\d\.\d\d в \d\d:\d\d$/);
    assert.ok(await page.locator('#result-note').isHidden());
    await assertNoHorizontalScroll(page, 'итоги');
    await shot(page, config, '2-result');

    // Карточка: «Завершён», итог и только «Посмотреть результаты» — и после обновления страницы.
    await page.click('#home-btn');
    for (let i = 0; i < 2; i++) {
      assert.equal(await card(page).locator('.practicum-card__status').textContent(), 'Завершён');
      assert.match(await card(page).locator('.practicum-card__result').textContent(),
        new RegExp('^Результат: ' + score + ' \\(\\d+%\\) · завершён \\d\\d\\.\\d\\d в \\d\\d:\\d\\d$'));
      assert.deepEqual(await visibleButtons(page), ['Посмотреть результаты']);
      assert.equal(await card(page).locator('.practicum-card__start, .practicum-card__continue, .practicum-card__restart').count(), 0);
      await page.reload();
    }
    await assertNoHorizontalScroll(page, 'карточка завершённого практикума');
    await shot(page, config, '3-completed-card');

    // «Посмотреть результаты»: итоги и полный разбор всех заданий только для просмотра.
    await card(page).locator('.practicum-card__results').click();
    await page.waitForSelector('#screen-result:not([hidden])');
    assert.equal(await page.textContent('#result-score'), score);
    assert.equal(await page.textContent('#result-context'), 'Познание · Практикум № 1');
    assert.ok(await page.locator('#restart-btn').isHidden());
    assert.equal(await page.textContent('#filter-mistakes-label'), 'Только с ошибками (1)');
    await page.locator('#review-filter label:has(input[value="all"])').click();
    assert.equal(await page.locator('#review-list .review-item').count(), 19);
    await page.click('#expand-all-btn');
    assert.equal(await page.locator('#review-list .mistake__answers').count(), 19, 'свой и правильный ответ у каждого задания');
    assert.ok(await page.locator('#review-list .statement__explanation').count() >= 90, 'объяснения всех вариантов');
    assert.equal(await page.locator('#review-list button:not([disabled])').count(), 0, 'в разборе ничего нельзя изменить');
    await assertNoHorizontalScroll(page, 'разбор');
    await shot(page, config, '4-review');
    // Никакого пути к новой попытке: ни на экране итогов, ни после возврата.
    await page.click('#home-btn');
    assert.deepEqual(await visibleButtons(page), ['Посмотреть результаты']);
    assert.deepEqual(await keys(page), [RESULT_KEY]);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

/* ---------- Надёжность ---------- */

test('вкладку закрыли после последнего ответа, до итогов: при следующем открытии практикум завершён', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context);
  await seed(page, 'complete');
  assert.deepEqual(await keys(page), [ATTEMPT_KEY]);
  await page.reload();
  await openTopic(page);
  assert.equal(await card(page).locator('.practicum-card__status').textContent(), 'Завершён');
  assert.deepEqual(await visibleButtons(page), ['Посмотреть результаты']);
  assert.deepEqual(await keys(page), [RESULT_KEY], 'сначала записан результат, затем удалена незавершённая запись');
  await card(page).locator('.practicum-card__results').click();
  assert.equal(await page.textContent('#result-score'), await storedScore(page));
  assert.deepEqual(errors, []);
  await context.close();
});

test('две вкладки: вторая видит начатую попытку, не может начать новую и не засчитывает ответы после завершения', async () => {
  const context = await newContext(CONFIGS[0]);
  const a = await newPage(context);
  const b = await newPage(context);
  await openTopic(a.page);
  await openTopic(b.page);

  // A начинает — карточка во вкладке B обновляется (событие storage): только «Продолжить».
  await card(a.page).locator('.practicum-card__start').click();
  await card(a.page).locator('.practicum-card__confirm-yes').click();
  await answer(a.page, await currentTask(a.page), false);
  await b.page.waitForFunction(() => document.querySelector('.practicum-card__continue') !== null);
  assert.deepEqual(await visibleButtons(b.page), ['Продолжить']);
  const id = await a.page.evaluate((k) => JSON.parse(localStorage.getItem(k)).attempt.id, ATTEMPT_KEY);

  // Устаревшая карточка (событие storage не пришло): «Начать» не начинает вторую попытку.
  // Во вкладке C карточка показана, пока попытки ещё не было; запись появляется без события.
  const saved = await a.page.evaluate((k) => localStorage.getItem(k), ATTEMPT_KEY);
  await a.page.evaluate((k) => localStorage.removeItem(k), ATTEMPT_KEY);
  const c = await newPage(context);
  await openTopic(c.page);
  assert.deepEqual(await visibleButtons(c.page), ['Начать практикум']);
  await c.page.evaluate(([k, v]) => localStorage.setItem(k, v), [ATTEMPT_KEY, saved]); // в той же вкладке события нет
  await card(c.page).locator('.practicum-card__start').click();
  await card(c.page).locator('.practicum-card__confirm-yes').click();
  assert.ok(await c.page.locator('#screen-start').isVisible(), 'вторая попытка не начата');
  assert.deepEqual(await visibleButtons(c.page), ['Продолжить'], 'карточка обновлена');
  assert.equal(await a.page.evaluate((k) => JSON.parse(localStorage.getItem(k)).attempt.id, ATTEMPT_KEY), id, 'попытка та же');

  // B завершает практикум; A пытается ответить — показывается сохранённый результат, ответ не засчитан.
  await b.page.evaluate((k) => localStorage.removeItem(k), ATTEMPT_KEY);
  await seed(b.page, 'result');
  await a.page.click('#next-btn');
  const t = await currentTask(a.page);
  if (t.type === 'matching') {
    for (let r = 0; r < t.key.length; r++) await a.page.click(`.match-choice[data-row="${r}"][data-n="${t.key[r]}"]`);
  } else {
    for (const n of t.key) await a.page.click(`#statements .statement[data-number="${n}"] .statement__btn`);
  }
  await a.page.click('#submit-btn');
  await a.page.waitForSelector('#screen-result:not([hidden])');
  assert.equal(await a.page.textContent('#result-note'), 'Практикум уже завершён в другой вкладке — показан сохранённый результат.');
  assert.equal(await a.page.textContent('#result-score'), await storedScore(a.page));
  assert.deepEqual(await keys(a.page), [RESULT_KEY], 'незавершённая запись A не появилась снова');
  // Уход со страницы во вкладке A не возвращает незавершённую запись.
  await a.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.deepEqual(await keys(a.page), [RESULT_KEY]);
  assert.deepEqual(a.errors.concat(b.errors, c.errors), []);
  await context.close();
});

test('хранилище недоступно: практикум проходится, результат виден до закрытия страницы, новой попытки нет', async () => {
  const context = await newContext(CONFIGS[0]);
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } });
  });
  const { page, errors } = await newPage(context);
  await openTopic(page);
  await card(page).locator('.practicum-card__start').click();
  await card(page).locator('.practicum-card__confirm-yes').click();
  for (let i = 0; i < 19; i++) {
    await answer(page, await currentTask(page), false);
    await page.click('#next-btn');
  }
  await page.waitForSelector('#screen-result:not([hidden])');
  assert.equal(await page.textContent('#result-score'), '33 из 33 баллов');
  assert.match(await page.textContent('#result-note'), /Результат не удалось сохранить в этом браузере/);
  await page.click('#home-btn');
  assert.equal(await card(page).locator('.practicum-card__status').textContent(), 'Завершён');
  assert.match(await card(page).locator('.practicum-card__notice').textContent(), /доступен, пока открыта эта страница/);
  assert.deepEqual(await visibleButtons(page), ['Посмотреть результаты']);
  await card(page).locator('.practicum-card__results').click();
  assert.equal(await page.textContent('#result-score'), '33 из 33 баллов');
  assert.deepEqual(errors, []);
  await context.close();
});

test('хранилище переполнено: незавершённая запись не удаляется, результат фиксируется, когда место появится', async () => {
  const context = await newContext(CONFIGS[0]);
  await context.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).indexOf('ege-trainer:result:') === 0 && this.getItem('test:quota-full') === '1') {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return original.call(this, k, v);
    };
  });
  const { page, errors } = await newPage(context);
  await page.evaluate(() => localStorage.setItem('test:quota-full', '1'));
  await seed(page, 'complete');
  await page.reload();
  await openTopic(page);
  assert.equal(await card(page).locator('.practicum-card__status').textContent(), 'Завершён');
  assert.match(await card(page).locator('.practicum-card__notice').textContent(), /не удалось сохранить/);
  assert.deepEqual(await visibleButtons(page), ['Посмотреть результаты']);
  assert.deepEqual(await keys(page), [ATTEMPT_KEY], 'ответы не потеряны');

  // Место освободилось — при следующем открытии результат записывается.
  await page.evaluate(() => localStorage.removeItem('test:quota-full'));
  await page.reload();
  await openTopic(page);
  assert.equal(await card(page).locator('.practicum-card__notice').count(), 0);
  assert.deepEqual(await keys(page), [RESULT_KEY]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('повреждённая запись результата: практикум остаётся пройденным, новой попытки нет', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context);
  await page.evaluate((k) => localStorage.setItem(k, '{не JSON'), RESULT_KEY);
  await page.reload();
  await openTopic(page);
  assert.equal(await card(page).locator('.practicum-card__status').textContent(), 'Завершён');
  assert.match(await card(page).locator('.practicum-card__notice').textContent(), /сохранённый результат не удаётся прочитать/);
  assert.deepEqual(await visibleButtons(page), []);
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), RESULT_KEY), '{не JSON', 'запись не удалена');
  assert.deepEqual(errors, []);
  await context.close();
});

test('разбор: изменённое задание — по копии, которую видел ученик; исправленное объяснение — текущее', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context);
  await seed(page, 'result');
  const [first, second] = await page.evaluate(([k]) => {
    const r = JSON.parse(localStorage.getItem(k));
    const [a, b] = r.attempt.taskIds;
    // Задание 1 с тех пор переформулировано (другой отпечаток): ученик видел старый текст.
    r.tasks[a].task.question = 'Старая формулировка, которую видел ученик';
    r.tasks[a].fingerprint = '00000000';
    // У задания 2 исправлено объяснение: отпечаток тот же — показывается исправленный текст.
    const s0 = r.tasks[b].task.statements ? r.tasks[b].task.statements[0] : r.tasks[b].task.items[0];
    s0.explanation = 'УСТАРЕВШЕЕ ОБЪЯСНЕНИЕ';
    localStorage.setItem(k, JSON.stringify(r));
    return [a, b];
  }, [RESULT_KEY]);
  await page.reload();
  await openTopic(page);
  await card(page).locator('.practicum-card__results').click();
  await page.locator('#review-filter label:has(input[value="all"])').click();
  await page.click('#expand-all-btn');
  const items = page.locator('#review-list .review-item');
  assert.equal(await items.nth(0).locator('.mistake__question').textContent(), 'Старая формулировка, которую видел ученик');
  const current = await page.evaluate((id) => EGE.getTask(id).question, second);
  assert.equal(await items.nth(1).locator('.mistake__question').textContent(), current);
  assert.equal(await page.locator('#review-list').getByText('УСТАРЕВШЕЕ ОБЪЯСНЕНИЕ').count(), 0);
  assert.ok(first && second);
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---------- Предпросмотр: без изменений ---------- */

test('страница предпросмотра: «Пройти ещё раз» по-прежнему начинает набор заново', async () => {
  const context = await newContext(CONFIGS[0]);
  const { page, errors } = await newPage(context, base + 'preview-cognition.html');
  // Набор, в котором осталось одно задание.
  await page.evaluate(() => {
    const A = EGE.attempt;
    const S = EGE.attemptSave;
    const settings = { section: 'preview', topic: EGE.preview.id };
    const a = A.createAttempt({ settings, taskIds: EGE.preview.taskIds.slice() });
    a.taskIds.slice(0, -1).forEach((id) => A.recordAnswer(a, EGE.getTask(id), Array.from(EGE.scoring.getCorrect(EGE.getTask(id)))));
    const scope = S.scopeId('preview', settings);
    localStorage.setItem(S.storageKey(scope), JSON.stringify(S.buildRecord({ scope, attempt: a, viewIndex: a.answers.length, draft: null, getTask: EGE.getTask })));
  });
  await page.reload();
  await page.click('#resume-continue');
  await answer(page, await currentTask(page), false);
  await page.click('#next-btn');
  await page.waitForSelector('#screen-result:not([hidden])');
  assert.ok(await page.locator('#restart-btn').isVisible());
  await page.click('#restart-btn');
  await page.waitForSelector('#screen-quiz:not([hidden])');
  assert.match(await page.textContent('#progress-label'), /· выполнено 0$/);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.indexOf('ege-trainer:result:') === 0).length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});
