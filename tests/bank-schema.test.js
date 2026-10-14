'use strict';

/**
 * Схема 2 банка: метаданные (source, difficulty, commonFeature, mistake)
 * и строгие правила для новых заданий. Старые 36 заданий проверяются
 * только на необязательные поля — их содержимое не меняется.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBank } = require('./helpers/ege.js');
const { metadataErrors, newTaskErrors } = require('./helpers/bank-rules.js');
const legacy = require('./fixtures/legacy-tasks.json');

const EGE = loadBank();
const isLegacy = (task) => Object.prototype.hasOwnProperty.call(legacy.tasks, task.id);

test('версия схемы банка и справочники', () => {
  assert.equal(EGE.BANK_SCHEMA_VERSION, 2);
  assert.deepEqual(Array.from(EGE.FORMATS, (f) => f.id), ['all', 'multiple', 'exclude-two', 'matching']);
  // Форматы фильтра совпадают с типами заданий оценивания.
  assert.deepEqual(Array.from(EGE.FORMATS.slice(1), (f) => f.id), Array.from(EGE.scoring.TYPES));
  assert.deepEqual(Array.from(EGE.DIFFICULTY_LEVELS), [1, 2, 3]);
  assert.deepEqual(Array.from(EGE.SOURCE_KINDS), ['original', 'author']);
});

test('метаданные всех заданий банка корректны', () => {
  for (const task of EGE.tasks) {
    assert.deepEqual(metadataErrors(EGE, task), [], `Задание ${task.id}`);
  }
});

test('новые задания: формат ЕГЭ, источник и объяснения всех вариантов', () => {
  for (const task of EGE.tasks.filter((t) => !isLegacy(t))) {
    assert.deepEqual(newTaskErrors(EGE, task), [], `Задание ${task.id}`);
  }
});

/* ---------- Правила на примерах ---------- */

const explain = (prefix) => prefix + ' Подробное объяснение с теоретической причиной для ученика.';

function goodMultiple() {
  return {
    id: 'SOC-FAM-901',
    question: 'Выберите верные суждения о семье.',
    source: { kind: 'author' },
    difficulty: 2,
    statements: [true, false, true, false, true].map((correct) => ({
      text: 'Суждение', correct, explanation: explain(correct ? 'Верно.' : 'Неверно.'),
      mistake: correct ? undefined : 'Путают нуклеарную и расширенную семью.'
    }))
  };
}

function goodExclude() {
  return {
    id: 'SOC-FAM-902',
    type: 'exclude-two',
    question: 'Ниже приведён перечень терминов.',
    source: { kind: 'original', title: 'Пособие', authors: 'Иванов И. И.', year: 2025, ref: 'с. 10, № 1', adapted: true },
    commonFeature: 'Все оставшиеся термины — функции семьи.',
    statements: [false, true, false, false, true, false].map((correct) => ({
      text: 'термин', correct, explanation: explain(correct ? 'Выпадает.' : 'Не выпадает.')
    }))
  };
}

function goodMatching() {
  return {
    id: 'SOC-FAM-903',
    type: 'matching',
    question: 'Установите соответствие.',
    source: { kind: 'author' },
    columns: ['Примеры', 'Понятия'],
    items: [1, 2, 1, 2, 1].map((match, i) => ({ text: 'пример ' + (i + 1), match, explanation: 'Объяснение соответствия с причиной и терминами.' })),
    options: ['первое', 'второе']
  };
}

test('правила схемы 2: корректные примеры трёх типов проходят', () => {
  for (const task of [goodMultiple(), goodExclude(), goodMatching()]) {
    assert.deepEqual(metadataErrors(EGE, task), [], task.id);
    assert.deepEqual(newTaskErrors(EGE, task), [], task.id);
  }
});

test('правила схемы 2: ошибки в метаданных находятся', () => {
  const cases = [
    [Object.assign(goodMultiple(), { source: { kind: 'book' } }), /source\.kind/],
    [Object.assign(goodMultiple(), { source: { kind: 'original' } }), /source\.title/],
    [Object.assign(goodMultiple(), { source: { kind: 'author', page: 3 } }), /неизвестное поле page/],
    [Object.assign(goodMultiple(), { source: { kind: 'author', adapted: 'да' } }), /adapted/],
    [Object.assign(goodMultiple(), { difficulty: 4 }), /difficulty/],
    [Object.assign(goodMultiple(), { commonFeature: 'признак' }), /только у exclude-two/],
    [Object.assign(goodExclude(), { commonFeature: ' ' }), /commonFeature/]
  ];
  for (const [task, re] of cases) {
    assert.match(metadataErrors(EGE, task).join('; '), re);
  }
  const badMistake = goodMatching();
  badMistake.items[0].mistake = '';
  assert.match(metadataErrors(EGE, badMistake).join('; '), /mistake/);
});

test('правила новых заданий: формат ЕГЭ и объяснения', () => {
  const noSource = goodMultiple();
  delete noSource.source;
  assert.match(newTaskErrors(EGE, noSource).join('; '), /source/);

  const fourStatements = goodMultiple();
  fourStatements.statements.pop();
  assert.match(newTaskErrors(EGE, fourStatements).join('; '), /5 или 6/);

  const oneCorrect = goodMultiple();
  oneCorrect.statements.forEach((s, i) => { s.correct = i === 0; s.explanation = explain(s.correct ? 'Верно.' : 'Неверно.'); });
  assert.match(newTaskErrors(EGE, oneCorrect).join('; '), /2, 3 или 4/);

  const short = goodMultiple();
  short.statements[1].explanation = 'Неверно.';
  assert.match(newTaskErrors(EGE, short).join('; '), /суждение 2: нужно содержательное объяснение/);

  const noFeature = goodExclude();
  delete noFeature.commonFeature;
  assert.match(newTaskErrors(EGE, noFeature).join('; '), /commonFeature/);

  const five = goodExclude();
  five.statements.pop();
  assert.match(newTaskErrors(EGE, five).join('; '), /ровно 6/);

  const four = goodMatching();
  four.items.pop();
  assert.match(newTaskErrors(EGE, four).join('; '), /ровно 5 позиций/);

  const sixOptions = goodMatching();
  sixOptions.options = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.match(newTaskErrors(EGE, sixOptions).join('; '), /от 2 до 5 вариантов/);

  const unexplained = goodMatching();
  delete unexplained.items[2].explanation;
  assert.match(newTaskErrors(EGE, unexplained).join('; '), /позиция 3/);
});
