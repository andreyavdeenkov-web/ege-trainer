'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const scoring = require('../js/scoring.js');

const { countMistakes, scoreAnswer, getCorrectNumbers, formatAnswer, percent, pluralPoints } = scoring;

test('примеры из условия: правильный ответ 1, 3, 5', () => {
  const correct = [1, 3, 5];
  assert.equal(scoreAnswer([1, 3, 5], correct), 2);
  assert.equal(scoreAnswer([1, 3], correct), 1);
  assert.equal(scoreAnswer([1, 3, 5, 6], correct), 1);
  assert.equal(scoreAnswer([1, 4, 5], correct), 0);
  assert.equal(scoreAnswer([1], correct), 0);
});

test('порядок выбора не важен', () => {
  assert.equal(scoreAnswer([5, 1, 3], [1, 3, 5]), 2);
});

test('количество ошибок — размер симметрической разности', () => {
  assert.equal(countMistakes([1, 3, 5], [1, 3, 5]), 0);
  assert.equal(countMistakes([1, 3], [1, 3, 5]), 1);
  assert.equal(countMistakes([1, 3, 5, 6], [1, 3, 5]), 1);
  assert.equal(countMistakes([1, 4, 5], [1, 3, 5]), 2);
  assert.equal(countMistakes([2, 4], [1, 3, 5]), 5);
  assert.equal(countMistakes([], [1, 3]), 2);
});

test('балл никогда не бывает отрицательным', () => {
  assert.equal(scoreAnswer([2, 4, 6], [1, 3, 5]), 0);
});

test('номера верных суждений считаются с 1', () => {
  const task = { statements: [{ correct: false }, { correct: true }, { correct: true }, { correct: false }] };
  assert.deepEqual(getCorrectNumbers(task), [2, 3]);
});

test('форматирование ответа', () => {
  assert.equal(formatAnswer([5, 1, 3]), '1, 3, 5');
  assert.equal(formatAnswer([]), '—');
});

test('процент и склонение', () => {
  assert.equal(percent(8, 10), 80);
  assert.equal(percent(0, 0), 0);
  assert.equal(percent(2, 3), 67);
  assert.equal(pluralPoints(0), 'баллов');
  assert.equal(pluralPoints(1), 'балл');
  assert.equal(pluralPoints(2), 'балла');
  assert.equal(pluralPoints(5), 'баллов');
  assert.equal(pluralPoints(11), 'баллов');
  assert.equal(pluralPoints(21), 'балл');
  assert.equal(pluralPoints(24), 'балла');
});
