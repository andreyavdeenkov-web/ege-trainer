'use strict';

/**
 * Главный экран: раздел → тема → практикум. Формат заданий ученик не выбирает —
 * в практикум входят задания всех форматов его состава; сохранённый ранее формат
 * не ограничивает набор. Обобщённых пунктов («Все разделы», «Весь раздел»,
 * «Общие вопросы») в интерфейсе нет.
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
  assert.match(html, /<h2 class="field__label" id="practicum-title">Практикумы<\/h2>/);
  assert.doesNotMatch(html.match(/<p class="hero__lead">[\s\S]*?<\/p>/)[0], /формат/i, 'подзаголовок без упоминания формата');
});

test('интерфейс не фильтрует по формату и не хранит формат', () => {
  assert.doesNotMatch(appCode, /settings\.format|filterByFormat|name="format"|'format'/);
  const load = appCode.slice(appCode.indexOf('function loadSettings'), appCode.indexOf('function saveSettings'));
  assert.doesNotMatch(load, /saved\.format/);
});

test('нет обобщённых пунктов «Все разделы», «Весь раздел», «Общие вопросы»', () => {
  for (const text of ['Все разделы', 'Весь раздел']) {
    assert.ok(!html.includes(text), `index.html: ${text}`);
    assert.ok(!appCode.includes(text), `js/app.js: ${text}`);
  }
  // Разделы и темы — без значения 'all'.
  const start = appCode.slice(appCode.indexOf('/* ---------- Стартовый экран'), appCode.indexOf('/* ---------- Практикум ----------'));
  assert.doesNotMatch(start, /optionCard\([^)]*'all'/);
  const EGE = loadBank();
  for (const section of EGE.sections) {
    for (const topic of EGE.getAvailableTopics(section.id)) {
      assert.notEqual(topic.title, 'Общие вопросы', topic.id);
      assert.ok(!topic.id.endsWith('-GEN'), topic.id);
    }
  }
});

test('стартовый экран не начинает попытку без практикума: кнопки «Начать» на главной нет', () => {
  assert.ok(!html.includes('id="start-btn"'));
  assert.ok(!html.includes('id="resume-panel"'));
  assert.match(appCode, /'Начать практикум'/);
});

test('практикумы «Семья и брак» — в каждом все форматы темы', () => {
  const EGE = loadBank();
  for (const [id, n] of [['SOC-FAM-P01', 16], ['SOC-FAM-P02', 15]]) {
    const tasks = EGE.getPracticumTasks(EGE.getPracticum(id));
    const types = new Set(tasks.map((t) => EGE.scoring.getTaskType(t)));
    assert.deepEqual([...types].sort(), ['exclude-two', 'matching', 'multiple'], id);
    assert.equal(tasks.length, n, id);
  }
});
