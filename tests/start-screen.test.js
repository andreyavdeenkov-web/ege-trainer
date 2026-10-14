'use strict';

/**
 * Главный экран: только «Раздел» и «Тема». Формат заданий ученик не выбирает —
 * в тренировку входят все задания выбора во всех форматах; сохранённый ранее
 * формат не ограничивает набор.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, loadBank } = require('./helpers/ege.js');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appCode = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

test('на главном экране нет выбора формата', () => {
  assert.doesNotMatch(html, /train-settings|format-options|format-summary|Настроить тренировку/);
  assert.doesNotMatch(html, /<legend class="field__label">Формат/);
  assert.match(html, /<legend class="field__label">Раздел<\/legend>/);
  assert.match(html, /<legend class="field__label">Тема<\/legend>/);
  assert.doesNotMatch(html.match(/<p class="hero__lead">[\s\S]*?<\/p>/)[0], /формат/i, 'подзаголовок без упоминания формата');
});

test('интерфейс не фильтрует по формату и не хранит формат', () => {
  assert.doesNotMatch(appCode, /settings\.format|filterByFormat|name="format"|'format'/);
  const load = appCode.slice(appCode.indexOf('function loadSettings'), appCode.indexOf('function saveSettings'));
  assert.doesNotMatch(load, /saved\.format/);
});

test('пул тренировки — все форматы выбранной темы', () => {
  const EGE = loadBank();
  const pool = EGE.getPool('SOC', 'SOC-FAM');
  const types = new Set(pool.map((t) => EGE.scoring.getTaskType(t)));
  assert.deepEqual([...types].sort(), ['exclude-two', 'matching', 'multiple']);
  assert.equal(pool.length, 31);
});
