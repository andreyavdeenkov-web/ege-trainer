'use strict';

/**
 * Главный экран: на виду «Раздел» и «Тема», формат — в свёрнутом блоке
 * «Настроить тренировку»; по умолчанию — все форматы, формат не запоминается.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, loadBank } = require('./helpers/ege.js');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appCode = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

test('формат — в свёрнутом блоке «Настроить тренировку» после темы', () => {
  const details = html.match(/<details class="train-settings" id="train-settings"(\s+open)?>([\s\S]*?)<\/details>/);
  assert.ok(details, 'нет блока «Настроить тренировку»');
  assert.equal(details[1], undefined, 'блок должен быть свёрнут по умолчанию');
  assert.match(details[2], /Настроить тренировку/);
  assert.match(details[2], /id="format-summary">Все форматы заданий</);
  assert.match(details[2], /id="format-options"/);
  assert.ok(html.indexOf('id="topic-field"') < html.indexOf('id="train-settings"'), 'блок идёт после выбора темы');
  assert.doesNotMatch(html, /<legend class="field__label">Формат<\/legend>/, 'отдельного блока «Формат» на главном экране нет');
});

test('по умолчанию — все форматы; формат не восстанавливается из сохранённых настроек', () => {
  const EGE = loadBank();
  assert.equal(EGE.getFormat('all').title, 'Все форматы заданий');
  const load = appCode.slice(appCode.indexOf('function loadSettings'), appCode.indexOf('function saveSettings'));
  assert.match(load, /format: 'all'/);
  assert.doesNotMatch(load, /saved\.format/);
  const save = appCode.slice(appCode.indexOf('function saveSettings'), appCode.indexOf('function notifyStore'));
  assert.doesNotMatch(save, /format/);
});
