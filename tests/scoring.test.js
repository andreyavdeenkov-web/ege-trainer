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

test('склонение «балл» при числе: 1, 21, 31 — балл; 2–4, 22–24 — балла; 0, 5–20, 25–30 — баллов', () => {
  const expected = (n) => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m100 >= 11 && m100 <= 14) return 'баллов';
    if (m10 === 1) return 'балл';
    if (m10 >= 2 && m10 <= 4) return 'балла';
    return 'баллов';
  };
  for (let n = 0; n <= 1000; n++) assert.equal(pluralPoints(n), expected(n), `${n}`);
  for (const [n, form] of [[1, 'балл'], [2, 'балла'], [5, 'баллов'], [11, 'баллов'], [12, 'баллов'],
    [14, 'баллов'], [21, 'балл'], [22, 'балла'], [31, 'балл'], [34, 'балла'], [35, 'баллов'],
    [101, 'балл'], [111, 'баллов'], [112, 'баллов']]) {
    assert.equal(pluralPoints(n), form, `${n}`);
  }
});

test('«X из Y»: форма согласуется с Y — «из 31 балла», «из 32 баллов»', () => {
  const { pluralPointsOf, formatPointsOutOf } = scoring;
  for (const [n, form] of [[1, 'балла'], [2, 'баллов'], [4, 'баллов'], [5, 'баллов'], [11, 'баллов'],
    [21, 'балла'], [31, 'балла'], [32, 'баллов'], [111, 'баллов'], [101, 'балла']]) {
    assert.equal(pluralPointsOf(n), form, `из ${n}`);
  }
  assert.equal(formatPointsOutOf(11, 31), '11 из 31 балла');
  assert.equal(formatPointsOutOf(31, 31), '31 из 31 балла');
  assert.equal(formatPointsOutOf(19, 32), '19 из 32 баллов');
  assert.equal(formatPointsOutOf(5, 21), '5 из 21 балла');
  assert.equal(formatPointsOutOf(1, 1), '1 из 1 балла');
  assert.equal(formatPointsOutOf(0, 2), '0 из 2 баллов');
});
