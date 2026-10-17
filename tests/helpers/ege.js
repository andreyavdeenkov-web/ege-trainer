'use strict';

/**
 * Загрузка банка ЕГЭ в Node так же, как в браузере: файлы в порядке <script>
 * из index.html. Общая для новых тестов схемы 2 (старые тесты используют свои копии).
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const dataScripts = scripts.filter((s) => s.startsWith('data/tasks/'));
/** Реестр практикумов (data/practicums.js) — после банка заданий. */
const practicumScripts = scripts.filter((s) => s === 'data/practicums.js');

/** Ядро, банк заданий и реестр практикумов, без интерфейса. */
function loadBank() {
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of ['js/registry.js', 'js/scoring.js', 'js/attempt.js', ...dataScripts, ...practicumScripts]) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

/** Ядро и js/task-view.js (для чистых функций отрисовки, без DOM). */
function loadWithView() {
  const context = vm.createContext({});
  context.globalThis = context;
  context.window = context;
  for (const src of ['js/registry.js', 'js/scoring.js', 'js/attempt.js', 'js/task-view.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

/** Содержимое задания так, как оно записано в банке (без полей, которые добавляет реестр). */
function authoredContent(task) {
  const copy = Object.assign({}, task);
  delete copy.topic;
  delete copy.section;
  return copy;
}

/** Отпечаток содержимого задания: формулировки, ключи, объяснения. */
function contentHash(task) {
  return crypto.createHash('sha256').update(JSON.stringify(authoredContent(task))).digest('hex');
}

module.exports = { root, scripts, dataScripts, practicumScripts, loadBank, loadWithView, authoredContent, contentHash };
