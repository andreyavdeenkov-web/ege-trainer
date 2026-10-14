'use strict';

/**
 * Браузерный сценарий «Начать заново» для LAW-NKL (Playwright, Chromium).
 *
 * Запуск: npm run test:e2e  (нужен пакет playwright: локально, глобально или через NODE_PATH).
 * Не входит в npm test: требует браузера.
 *
 * Проверяет: кнопка появляется только после полного завершения LAW-NKL и не появляется
 * в LAW-CPT; подтверждение с текстом преподавателя; «Отмена» и Escape ничего не удаляют;
 * сброс удаляет только попытку LAW-NKL (попытка LAW-CPT сохраняется), открывает стартовый
 * экран темы; новая попытка начинается с нуля и сохраняется после перезагрузки.
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
const BASE = 'http://localhost:' + PORT + '/';
const NKL = BASE + 'olympiad.html#/pr/LAW/LAW-NKL';
const KEY = 'olymp-trainer:attempts:v1';
const CONFIRM_TEXT = 'Все ответы и баллы текущей попытки будут удалены. Начать заново?';

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + 'olympiad.html'); if (r.ok) return; } catch (e) { /* ещё не запущен */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Сервер не запустился');
}

const storedScopes = (page) => page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key) || '{}')).sort(), KEY);
const text = (page) => page.locator('main').innerText();
const visible = (page, sel) => page.locator(sel).isVisible();

async function finish(page) {
  await page.getByRole('button', { name: /^Завершить$/ }).first().click();
  await page.waitForTimeout(200);
  const confirm = await page.locator('#confirm-text').innerText();
  await page.locator('#confirm-ok').click();
  await page.waitForTimeout(300);
  return confirm;
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.js'), String(PORT)], { stdio: 'ignore' });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const results = [];
  const step = async (name, fn) => { await fn(); results.push('ok  ' + name); };
  try {
    await waitServer();
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await step('LAW-CPT: после завершения кнопки «Начать заново» нет', async () => {
      await page.goto(BASE + 'olympiad.html#/pr/LAW/LAW-CPT'); await page.waitForTimeout(300);
      await page.getByRole('button', { name: /Начать практикум/ }).click(); await page.waitForTimeout(200);
      const confirm = await finish(page);
      assert.match(confirm, /Пройти тему заново будет нельзя/);
      assert.equal(await visible(page, '#restart-btn'), false);
      assert.match(await text(page), /Повторное прохождение темы пока недоступно/);
    });

    await step('LAW-NKL: во время прохождения кнопки нет; после завершения — есть', async () => {
      await page.goto(NKL); await page.waitForTimeout(300);
      await page.getByRole('button', { name: /Начать практикум/ }).click(); await page.waitForTimeout(200);
      // Задание 1: первый вариант в каждой строке, проверка
      const rows = page.locator('.nrm-grid .nrm-row');
      for (let i = 0; i < await rows.count(); i++) await rows.nth(i).locator('button.nrm-chip').first().click();
      await page.getByRole('button', { name: /^Проверить$/ }).click(); await page.waitForTimeout(200);
      assert.equal(await visible(page, '#restart-btn'), false);
      const confirm = await finish(page);
      assert.match(confirm, /Начать тему заново можно будет на экране итогов/);
      assert.equal(await visible(page, '#restart-btn'), true);
      assert.equal(await visible(page, '#restart-bar'), false);
      assert.match(await text(page), /Чтобы пройти практикум ещё раз, нажмите «Начать заново»/);
      assert.deepEqual(await storedScopes(page), ['PR/LAW/LAW-CPT', 'PR/LAW/LAW-NKL']);
    });

    await step('подтверждение показывает текст преподавателя; «Отмена» ничего не удаляет', async () => {
      await page.locator('#restart-btn').click(); await page.waitForTimeout(150);
      assert.equal(await visible(page, '#restart-bar'), true);
      assert.equal((await page.locator('#restart-text').innerText()).trim(), CONFIRM_TEXT);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'restart-cancel');
      await page.locator('#restart-cancel').click(); await page.waitForTimeout(150);
      assert.equal(await visible(page, '#restart-bar'), false);
      assert.match(page.url(), /\/result$/);
      assert.deepEqual(await storedScopes(page), ['PR/LAW/LAW-CPT', 'PR/LAW/LAW-NKL']);
    });

    await step('Escape закрывает подтверждение без сброса', async () => {
      await page.locator('#restart-btn').click(); await page.waitForTimeout(150);
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
      assert.equal(await visible(page, '#restart-bar'), false);
      assert.deepEqual(await storedScopes(page), ['PR/LAW/LAW-CPT', 'PR/LAW/LAW-NKL']);
    });

    await step('сброс удаляет только попытку LAW-NKL и открывает стартовый экран темы', async () => {
      const cptBefore = await page.evaluate((key) => JSON.stringify(JSON.parse(localStorage.getItem(key))['PR/LAW/LAW-CPT']), KEY);
      await page.locator('#restart-btn').click(); await page.waitForTimeout(150);
      await page.locator('#restart-ok').click(); await page.waitForTimeout(300);
      assert.match(page.url(), /#\/pr\/LAW\/LAW-NKL$/);
      assert.equal(await page.getByRole('button', { name: /Начать практикум/ }).isVisible(), true);
      assert.deepEqual(await storedScopes(page), ['PR/LAW/LAW-CPT']);
      const cptAfter = await page.evaluate((key) => JSON.stringify(JSON.parse(localStorage.getItem(key))['PR/LAW/LAW-CPT']), KEY);
      assert.equal(cptAfter, cptBefore, 'попытка LAW-CPT не изменилась');
    });

    await step('новая попытка начинается с нуля и сохраняется после перезагрузки', async () => {
      await page.getByRole('button', { name: /Начать практикум/ }).click(); await page.waitForTimeout(200);
      assert.match(await text(page), /Проверено: 0 из 20/);
      assert.equal(await page.locator('.nrm-grid .nrm-chip[aria-pressed="true"]').count(), 0);
      await page.reload(); await page.waitForTimeout(300);
      assert.match(await text(page), /Проверено: 0 из 20/);
      assert.deepEqual(await storedScopes(page), ['PR/LAW/LAW-CPT', 'PR/LAW/LAW-NKL']);
    });

    await step('LAW-CPT после сброса LAW-NKL по-прежнему завершён', async () => {
      await page.goto(BASE + 'olympiad.html#/pr/LAW/LAW-CPT'); await page.waitForTimeout(300);
      assert.match(await text(page), /тема пройдена/i);
    });

    assert.deepEqual(errors, [], 'ошибки JavaScript');
    results.forEach((r) => console.log(r));
    console.log('# e2e pass ' + results.length);
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
