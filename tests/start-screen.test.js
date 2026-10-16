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

test('на главном экране нет «Все разделы», «Весь раздел» и «Общие вопросы»', () => {
  assert.doesNotMatch(appCode, /Все разделы'|'Весь раздел'/);
  assert.doesNotMatch(appCode, /optionCard\('(section|topic)', 'all'/);
  assert.match(html, /<p class="topic-empty" id="topic-empty" role="status" hidden><\/p>/);
});

test('темы для выбора — только конкретные темы с заданиями', () => {
  const EGE = loadBank();
  const ids = (list) => Array.from(list, (t) => t.id);
  assert.deepEqual(ids(EGE.getTrainingTopics('OBS')), ['OBS-ACT']);
  assert.deepEqual(ids(EGE.getTrainingTopics('SOC')), ['SOC-STR', 'SOC-MOB', 'SOC-FAM']);
  for (const section of ['ECO', 'POL', 'LAW']) {
    assert.deepEqual(ids(EGE.getTrainingTopics(section)), [], section);
  }
  assert.equal(EGE.getTrainingTopics('XXX').length, 0);
  for (const section of EGE.sections) {
    for (const topic of EGE.getTrainingTopics(section.id)) {
      assert.ok(!topic.general && !/-GEN$/.test(topic.id), topic.id);
      assert.ok(EGE.getTasksByTopic(topic.id).length > 0, topic.id);
    }
  }
});

test('«Общие вопросы» помечены general, их задания остаются в банке', () => {
  const EGE = loadBank();
  const general = Array.from(EGE.sections.flatMap((s) => s.topics).filter((t) => t.general), (t) => t.id);
  assert.deepEqual(general, ['OBS-GEN', 'ECO-GEN', 'POL-GEN', 'LAW-GEN']);
  for (const id of general) {
    assert.equal(EGE.getTopic(id).title, 'Общие вопросы');
    assert.equal(EGE.getTasksByTopic(id).length, 3, id);
  }
  // Разделы остаются: в каждом есть задания, даже если конкретных тем пока нет.
  assert.deepEqual(Array.from(EGE.getAvailableSections(), (s) => s.id), ['OBS', 'ECO', 'SOC', 'POL', 'LAW']);
});

test('настройки по умолчанию: раздел и тема не выбраны, без темы набор пуст', () => {
  const load = appCode.slice(appCode.indexOf('function loadSettings'), appCode.indexOf('function saveSettings'));
  assert.match(load, /var result = \{ section: null, topic: null \};/);
  assert.match(appCode, /if \(!settings\.topic\) return \[\];/);
  assert.match(appCode, /return EGE\.getTrainingTopics\(sectionId\)\.some/);
});
