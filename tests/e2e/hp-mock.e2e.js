'use strict';

/**
 * Браузерные сценарии пробного тура «Высшая проба — диагностический вариант № 1»
 * (Playwright, Chromium). Запуск: npm run test:e2e. Не входит в npm test.
 *
 * Сценарии: вкладка «Пробный тур»; старт; ввод и изменение ответов всех типов;
 * сохранение после перезагрузки и продолжение таймера; ключи не загружены до
 * завершения; досрочное завершение с подтверждением; расчёт баллов (строгая и
 * диагностическая схемы, дисциплины); разбор; мини-эссе без баллов; завершение
 * по таймеру на экране и при закрытой странице; новая попытка; тематическая
 * тренировка не изменилась; телефон и планшет.
 *
 * SHOTS=<папка> — сохранить скриншоты экранов.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* ниже — понятная ошибка */ }
  throw new Error('Нужен пакет playwright (npm i -D playwright или NODE_PATH к глобальной установке).');
}

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = 'http://localhost:' + PORT + '/olympiad.html';
const START = BASE + '#/hp/mock/hp-diag-1';
const KEY = 'olymp-trainer:mock:v1';
const SHOTS = process.env.SHOTS || null;

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE); if (r.ok) return; } catch (e) { /* ещё не запущен */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Сервер не запустился');
}

const text = (page) => page.locator('main').innerText();
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}')['HP-DIAG-1'] || null, KEY);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };

async function openTask(page, n) {
  await page.locator('#mock-nav button').nth(n - 1).click();
  await page.waitForTimeout(60);
  assert.match(await page.locator('.mock-task__num').innerText(), new RegExp('^Задание ' + n + ' из 21$'));
}

async function pick(page, n, options) {
  await openTask(page, n);
  for (const o of options) await page.locator('.statement').nth(o - 1).locator('button').click();
}

async function type(page, n, value) {
  await openTask(page, n);
  await page.locator('#mock-input-' + n).fill(value);
}

async function match(page, n, letters) {
  await openTask(page, n);
  const L = 'АБВГДЕЖ';
  for (let i = 0; i < letters.length; i++) {
    await page.locator('#mock-' + n + '-row-' + (i + 1)).selectOption(String(L.indexOf(letters[i]) + 1));
  }
}

/** Ответы с заранее известным итогом: строгая схема 50 из 90, диагностическая 57. */
async function answerAll(page) {
  await pick(page, 1, [1, 3, 5]);                 // верно, 4
  await pick(page, 2, [1, 2, 3]);                 // пропущен 6: строго 0, диагн. 2
  await pick(page, 3, [1, 3, 4]);                 // лишний 4: строго 0, диагн. 2
  // 4 — без ответа
  await pick(page, 5, [1, 3, 4, 6]);              // верно, 4
  await type(page, 6, 'Языковые  игры');          // верно (регистр, пробелы, им. падеж), 4
  await type(page, 7, 'фаталистическим');          // неверно
  await type(page, 8, '«кохабитацией».');          // верно (кавычки, точка), 4
  await type(page, 9, 'crowding out');             // верно, 4
  await type(page, 10, 'бланкитным');              // опечатка — неверно
  await openTask(page, 11);                        // верно, 5
  await page.locator('input[name="mock-11-A"][value="рыцарь"]').check({ force: true });
  await page.locator('input[name="mock-11-B"][value="лжец"]').check({ force: true });
  await page.locator('input[name="mock-11-C"][value="лжец"]').check({ force: true });
  await type(page, 12, 'культурным капиталом');    // верно, 5
  await openTask(page, 13);                        // квота Хэра — неверно
  for (const [id, v] of [['A', '3'], ['B', '1'], ['C', '1'], ['D', '1']]) await page.locator('#mock-13-' + id).fill(v);
  await type(page, 14, '1 800');                   // верно, 5
  // 15 — без ответа
  await match(page, 16, ['Е', 'Г', 'В', 'Д', 'Б']); // верно, 5
  await match(page, 17, ['В', 'Е', 'Д', 'Г', 'А']); // 3 пары из 5: строго 0, диагн. 3
  await match(page, 18, ['Г', 'Ж', 'Б', 'Е', 'А']); // верно, 5
  // 19 — без ответа
  await match(page, 20, ['Г', 'В', 'Ж', 'Д', 'А']); // верно, 5
  await openTask(page, 21);
  await page.locator('#mock-essay-21').fill('По Гоббсу, без государства контракт ничего не стоит, поэтому люди обменивают часть свободы на безопасность. Однако рынок держится и на доверии: социальный капитал снижает транзакционные издержки, если институты права и собственности обладают легитимностью.');
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.js'), String(PORT)], { stdio: 'ignore' });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const results = [];
  const step = async (name, fn) => { await fn(); results.push('ok  ' + name); };
  try {
    await waitServer();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    let topicBaseline;
    await step('вкладка «Пробный тур» включена, тематическая тренировка без изменений', async () => {
      await page.goto(BASE + '#/hp');
      await page.waitForTimeout(200);
      topicBaseline = await page.locator('#discipline-list').innerText();
      assert.ok(!(await page.locator('#mode-mock').isDisabled()));
      assert.equal(await page.locator('#mode-mock-soon').isVisible(), false);
      await page.locator('#mode-mock-label').click();
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => location.hash), '#/hp/mock');
      assert.match(await page.locator('#mock-list').innerText(), /Диагностический вариант № 1/);
      assert.equal(await page.locator('#discipline-list').isVisible(), false);
      await page.locator('#mode-topic').check({ force: true });
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#discipline-list').innerText(), topicBaseline);
      // Задания пробника не входят в банк и в тематическую тренировку.
      assert.equal(await page.evaluate(() => OLY.tasks.filter((t) => /DIAG/.test(t.id)).length), 0);
    });

    await step('старт: параметры, инструкция, кнопка «Начать пробник»', async () => {
      await page.goto(START);
      await page.waitForTimeout(200);
      const t = await text(page);
      assert.ok(!t.includes('не официальный вариант'), 'на старте осталась прежняя формулировка');
      for (const s of ['Высшая проба — диагностический вариант № 1', 'Обществознание · Второй тур отборочного этапа',
        '21', '80 минут', '100 баллов', 'Инструкция для участника', 'Отметьте все верные варианты',
        'Авторский диагностический вариант']) assert.ok(t.includes(s), 'нет «' + s + '»');
      await shot(page, 'start');
      await page.getByRole('button', { name: 'Начать пробник' }).click();
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => location.hash), '#/hp/mock/hp-diag-1/run');
    });

    await step('ключи и разборы не загружены во время попытки', async () => {
      assert.equal(await page.evaluate(() => OLY.mock.hasKey('HP-DIAG-1')), false);
      assert.equal(await page.locator('script[src*="diag-1-key"]').count(), 0);
      const t = await text(page);
      assert.ok(!/Правильный ответ|Верный —|Почему это правильно/.test(t));
    });

    await step('таймер идёт от 80 минут', async () => {
      const a = await page.locator('#mock-clock').innerText();
      assert.match(a, /^1:(20:00|19:5\d)$/);
      await page.waitForTimeout(2100);
      const b = await page.locator('#mock-clock').innerText();
      assert.notEqual(a, b);
    });

    await step('ввод и изменение ответов: снятие выбора, исправление текста, буква в соотнесении освобождается', async () => {
      await pick(page, 1, [2]);
      await pick(page, 1, [2]); // снять выбор
      assert.equal(await page.locator('#mock-answered').innerText(), 'Отвечено: 0 из 21');
      await type(page, 6, 'речевыми актами');
      await type(page, 6, '');
      await match(page, 16, ['Б']);
      // Буква варианта отделена от имени автора: «Е — Г. В. Лейбниц».
      assert.equal(await page.locator('#mock-16-row-1 option[value="6"]').innerText(), 'Е — Г. В. Лейбниц');
      // Буква используется один раз: в других строках она недоступна и подписана.
      assert.equal(await page.locator('#mock-16-row-2 option[value="2"]').isDisabled(), true);
      assert.match(await page.locator('#mock-16-row-2 option[value="2"]').innerText(), /выбрано для 1/);
      await page.locator('#mock-16-row-1').selectOption('');
      assert.equal(await page.locator('#mock-16-row-2 option[value="2"]').isDisabled(), false);
      await page.locator('#mock-16-row-2').selectOption('2');
      await page.locator('#mock-16-row-2').selectOption('');
      assert.equal(await page.locator('#mock-answered').innerText(), 'Отвечено: 0 из 21');
    });

    await step('ответы на все типы заданий; навигация отмечает отвеченные', async () => {
      await answerAll(page);
      assert.equal(await page.locator('#mock-answered').innerText(), 'Отвечено: 18 из 21');
      assert.equal(await page.locator('#mock-nav .is-answered').count(), 18);
      assert.match(await page.locator('#mock-nav button').nth(3).getAttribute('aria-label'), /без ответа/);
      await shot(page, 'run-essay');
      await openTask(page, 16);
      await shot(page, 'run-matching');
      await openTask(page, 11);
      await shot(page, 'run-knights');
    });

    await step('при прокрутке панель таймера остаётся видимой под шапкой сайта', async () => {
      await openTask(page, 11);
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => {
        const bar = document.querySelector('.mock-bar').getBoundingClientRect();
        const header = document.querySelector('.topbar').getBoundingClientRect();
        const hit = document.elementFromPoint(bar.left + 20, bar.top + bar.height / 2);
        return { top: Math.round(bar.top), header: Math.round(header.bottom), visible: !!(hit && hit.closest('.mock-bar')) };
      });
      assert.equal(r.visible, true, 'панель таймера закрыта шапкой');
      assert.equal(r.top, r.header);
    });

    await step('после перезагрузки ответы восстановлены, таймер продолжается', async () => {
      const before = await stored(page);
      await page.reload();
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => location.hash), '#/hp/mock/hp-diag-1/run');
      assert.equal(await page.locator('#mock-answered').innerText(), 'Отвечено: 18 из 21');
      await openTask(page, 8);
      assert.equal(await page.locator('#mock-input-8').inputValue(), '«кохабитацией».');
      await openTask(page, 17);
      assert.equal(await page.locator('#mock-17-row-4').inputValue(), '4');
      await openTask(page, 21);
      assert.match(await page.locator('#mock-essay-21').inputValue(), /^По Гоббсу/);
      const after = await stored(page);
      assert.equal(after.deadline, before.deadline);
      const clock = await page.locator('#mock-clock').innerText();
      assert.ok(clock < '1:20:00', 'таймер начался заново: ' + clock);
    });

    await step('мини-эссе: счётчик слов и предупреждение без блокировки', async () => {
      await openTask(page, 21);
      const original = await page.locator('#mock-essay-21').inputValue();
      const long = Array.from({ length: 260 }, (_, i) => 'слово' + i).join(' ');
      await page.locator('#mock-essay-21').fill(long);
      assert.match(await page.locator('.mock-counter').innerText(), /Слов: 260 из 250 — превышен лимит/);
      assert.equal((await page.locator('#mock-essay-21').inputValue()).split(' ').length, 260);
      await page.locator('#mock-essay-21').fill(original);
      assert.match(await page.locator('.mock-counter').innerText(), /^Слов: \d+ из 250$/);
    });

    await step('результаты недоступны до завершения', async () => {
      await page.goto(START + '/result');
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => location.hash), '#/hp/mock/hp-diag-1/run');
      assert.equal(await page.evaluate(() => OLY.mock.hasKey('HP-DIAG-1')), false);
    });

    await step('досрочное завершение с подтверждением', async () => {
      await page.getByRole('button', { name: 'Завершить', exact: true }).first().click();
      await page.waitForTimeout(150);
      const confirm = await page.locator('#mock-confirm').innerText();
      assert.match(confirm, /Без ответа: 3 задания\. После завершения изменить ответы будет нельзя\. Завершить пробник\?/);
      await page.getByRole('button', { name: 'Вернуться к заданиям' }).click();
      assert.equal(await page.locator('#mock-confirm').innerText(), '');
      await page.getByRole('button', { name: 'Завершить', exact: true }).first().click();
      await page.locator('#mock-confirm').getByRole('button', { name: 'Завершить' }).click();
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => location.hash), '#/hp/mock/hp-diag-1/result');
      const s = await stored(page);
      assert.equal(s.finishReason, 'manual');
    });

    await step('расчёт баллов: 50 из 90 по строгой схеме, 57 по диагностической; эссе без баллов', async () => {
      const t = await text(page);
      assert.ok(t.includes('Результат автоматической проверки: 50 из 90.'));
      assert.ok(t.includes('Мини-эссе не оценивалось. Максимальный балл полного варианта — 100.'));
      assert.ok(!/\d+ из 100/.test(t), 'показан результат из 100');
      const stats = await page.locator('.mock-result .stats').innerText();
      assert.match(stats, /11 из 20/);
      assert.match(stats, /Полностью верно/);
      assert.match(stats, /С ошибками\s*6|6\s*С ошибками/);
      assert.match(stats, /не оценивалось/);
      assert.match(await page.locator('.mock-alt summary').innerText(), /Диагностическая схема \(альтернативная\): 57 из 90/);
      const disc = await page.locator('.mock-disc').innerText();
      for (const [d, v] of [['Философия', '18 из 18'], ['Социология', '5 из 18'], ['Политология', '9 из 18'], ['Экономика', '9 из 18'], ['Право', '9 из 18']]) {
        assert.ok(new RegExp(d + '[\\s\\S]*?' + v).test(disc), d + ': ' + v);
      }
      assert.ok(t.includes('авторская'));
      await shot(page, 'result');
    });

    await step('рекомендации по заданиям с ошибками и без ответа', async () => {
      const r = await page.locator('.mock-recs').innerText();
      for (const s of ['Повторить: теория аномии Р. Мертона', 'Повторить: налоговое бремя и эластичность спроса',
        'Повторить: структура правовой нормы', 'Повторить: методы распределения мандатов']) assert.ok(r.includes(s), s);
      assert.ok(!r.includes('виды суждений у И. Канта'), 'рекомендация по верно решённому заданию');
      assert.ok(r.includes('(задание 4, без ответа)'));
    });

    await step('разбор: твой ответ, правильный ответ, варианты, пары, шаги, ошибки', async () => {
      await page.getByRole('button', { name: 'Развернуть все' }).click();
      const item = (n) => page.locator('#mock-review-' + n);
      const t2 = await item(2).innerText();
      const t1 = await item(1).innerText();
      const at = (s) => t1.indexOf(s);
      assert.ok(at('субъект суждения') !== -1 && at('не познающий субъект') !== -1, '№ 1: нет объяснения субъекта суждения');
      assert.ok(at('субъект суждения') < at('аналитические и синтетические') && at('аналитические и синтетические') < at('a priori и a posteriori'), '№ 1: порядок объяснения');
      assert.ok(t1.includes('Разбор каждого варианта') && t1.includes('«Золото — жёлтый металл»'));
      for (const s of ['Твой ответ', '1, 2, 3', 'Правильный ответ', '1, 2, 3, 6', 'Верный — пропущен', 'Пропущены верные варианты: 6',
        'Почему это правильно', 'мятеж', 'В чём могла заключаться ошибка', 'Что нужно запомнить', 'Что повторить',
        'По диагностической (альтернативной) схеме: 2 из 4']) assert.ok(t2.includes(s), '№ 2: ' + s);
      const t10 = await item(10).innerText();
      assert.ok(t10.includes('бланкитным') && t10.includes('Все засчитываемые формы ответа'));
      const t13 = await item(13).innerText();
      assert.ok(t13.includes('Частные по методу Д\'Онта') && t13.includes('23 500 (3)') && t13.includes('Решение по шагам'));
      const t17 = await item(17).innerText();
      assert.ok(t17.includes('Твой выбор: Г — Групповая мобильность') && t17.includes('Правильно: А — Структурная мобильность'));
      assert.ok(t17.includes('Лишние элементы правого ряда'));
      const t6 = await item(6).innerText();
      assert.ok(t6.includes('Языковые игры') || t6.includes('Языковые  игры'));
      assert.ok(t6.includes('Верно · 4 из 4'));
      // Фильтр «Без ответа»
      await page.locator('input[name="mock-review-filter"][value="unanswered"]').check({ force: true });
      assert.equal(await page.locator('.mock-review .review-item').count(), 3);
      await page.locator('input[name="mock-review-filter"][value="all"]').check({ force: true });
      assert.equal(await page.locator('.mock-review .review-item').count(), 20);
    });

    await step('мини-эссе: текст ученика, «Не оценивалось», критерии и образцы как возможные варианты', async () => {
      const e = await page.locator('.mock-essay-result').innerText();
      for (const s of ['Не оценивалось', 'По Гоббсу, без государства', 'Критерии оценивания', 'К1. Понимание проблемы',
        'Образцы показывают возможные варианты рассуждения, а не единственно правильные ответы',
        'Образец хорошего ответа № 1', 'Вопросы для самопроверки', 'Ключевые понятия набора', 'Транзакционные издержки']) assert.ok(e.includes(s), 'эссе: ' + s);
      assert.ok(!/\d+ из 10\b/.test(e), 'эссе получило баллы');
    });

    await step('результаты сохраняются после перезагрузки; тематическая тренировка не изменилась', async () => {
      await page.reload();
      await page.waitForTimeout(600);
      assert.ok((await text(page)).includes('Результат автоматической проверки: 50 из 90.'));
      await page.goto(BASE + '#/hp');
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#discipline-list').innerText(), topicBaseline);
      assert.equal(await page.evaluate(() => OLY.tasks.filter((t) => /DIAG/.test(t.id)).length), 0);
      await page.goto(BASE + '#/hp/POL/POL-POW');
      await page.waitForTimeout(200);
      assert.ok((await text(page)).includes('Власть и легитимность'));
    });

    await step('новая попытка заменяет прошлую после подтверждения', async () => {
      await page.goto(START);
      await page.waitForTimeout(200);
      assert.ok((await text(page)).includes('Пробник завершён'));
      await page.getByRole('button', { name: 'Пройти заново' }).click();
      await page.getByRole('button', { name: 'Отмена' }).click();
      assert.equal((await stored(page)).finishReason, 'manual');
      await page.getByRole('button', { name: 'Пройти заново' }).click();
      await page.getByRole('button', { name: 'Начать заново' }).click();
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#mock-answered').innerText(), 'Отвечено: 0 из 21');
      assert.equal((await stored(page)).finishedAt, null);
    });

    await step('время истекает на экране: автоматическое завершение с сохранёнными ответами', async () => {
      await type(page, 9, 'вытеснения');
      await page.evaluate((k) => {
        const all = JSON.parse(localStorage.getItem(k));
        all['HP-DIAG-1'].deadline = new Date(Date.now() + 2500).toISOString();
        localStorage.setItem(k, JSON.stringify(all));
      }, KEY);
      await page.reload();
      await page.waitForTimeout(300);
      assert.match(await page.locator('#mock-clock').innerText(), /^00:0[0-3]$/);
      await page.waitForTimeout(3500);
      assert.equal(await page.evaluate(() => location.hash), '#/hp/mock/hp-diag-1/result');
      const t = await text(page);
      assert.ok(t.includes('Время вышло — пробник завершён автоматически.'));
      assert.ok(t.includes('Результат автоматической проверки: 4 из 90.'));
      const s = await stored(page);
      assert.equal(s.finishReason, 'timeout');
      assert.equal(s.finishedAt, s.deadline);
    });

    await step('время истекло при закрытой странице: попытка завершается по дедлайну', async () => {
      await page.evaluate((k) => {
        const all = JSON.parse(localStorage.getItem(k));
        const a = all['HP-DIAG-1'];
        a.startedAt = new Date(Date.now() - 90 * 60000).toISOString();
        a.deadline = new Date(Date.now() - 10 * 60000).toISOString();
        a.finishedAt = null;
        a.finishReason = null;
        a.responses = { 6: { value: 'языковые игры', updatedAt: a.startedAt } };
        localStorage.setItem(k, JSON.stringify(all));
      }, KEY);
      await page.goto(START);
      await page.reload();
      await page.waitForTimeout(300);
      const t = await text(page);
      assert.ok(t.includes('Завершён автоматически: время вышло. Затрачено: 1:20:00.'));
      const s = await stored(page);
      assert.equal(s.finishedAt, s.deadline);
      await page.getByRole('button', { name: 'Посмотреть результаты и разбор' }).click();
      await page.waitForTimeout(400);
      assert.ok((await text(page)).includes('Результат автоматической проверки: 4 из 90.'));
    });

    assert.deepEqual(errors, [], 'ошибки на странице: ' + errors.join('; '));

    await step('телефон (390 × 844) и планшет (820 × 1180): нет горизонтальной прокрутки', async () => {
      for (const [w, h, name] of [[390, 844, 'phone'], [820, 1180, 'tablet']]) {
        const m = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 })).newPage();
        await m.goto(START);
        await m.waitForTimeout(200);
        await m.getByRole('button', { name: 'Начать пробник' }).click();
        await m.waitForTimeout(200);
        for (const n of [1, 11, 13, 16, 21]) {
          await openTask(m, n);
          const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.ok(overflow <= 0, name + ', задание ' + n + ': горизонтальная прокрутка ' + overflow + 'px');
          await m.evaluate(() => window.scrollTo(0, 800));
          await m.waitForTimeout(150);
          const bar = await m.evaluate(() => {
            const b = document.querySelector('.mock-bar').getBoundingClientRect();
            const hit = document.elementFromPoint(b.left + 20, b.top + b.height / 2);
            return { visible: !!(hit && hit.closest('.mock-bar')), height: Math.round(b.height) };
          });
          assert.ok(bar.visible, name + ', задание ' + n + ': панель таймера не видна при прокрутке');
          if (w < 500) assert.ok(bar.height <= 64, name + ': панель таймера выше одной строки (' + bar.height + 'px)');
          if (n === 16 || n === 13) await shot(m, name + '-run-' + n);
        }
        await match(m, 16, ['Е', 'Г', 'В', 'Д', 'Б']);
        await m.getByRole('button', { name: 'Завершить', exact: true }).first().click();
        await m.locator('#mock-confirm').getByRole('button', { name: 'Завершить' }).click();
        await m.waitForTimeout(600);
        const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 0, name + ', результаты: горизонтальная прокрутка ' + overflow + 'px');
        await shot(m, name + '-result');
        await m.context().close();
      }
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(results.join('\n'));
  console.log('Пробный тур: все сценарии пройдены (' + results.length + ').');
}

main().catch((e) => { console.error(e); process.exit(1); });
