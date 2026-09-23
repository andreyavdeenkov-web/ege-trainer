/**
 * Логика проверки ответов. Чистые функции без зависимостей от DOM.
 *
 * Номера суждений — числа начиная с 1 (как их видит ученик).
 */
(function (root) {
  'use strict';

  var MAX_SCORE = 2;

  /** Номера верных суждений задания, по возрастанию. */
  function getCorrectNumbers(task) {
    var result = [];
    task.statements.forEach(function (s, i) {
      if (s.correct) result.push(i + 1);
    });
    return result;
  }

  /** Количество ошибок = размер симметрической разности множеств. */
  function countMistakes(selected, correct) {
    var sel = new Set(selected);
    var cor = new Set(correct);
    var mistakes = 0;
    sel.forEach(function (n) { if (!cor.has(n)) mistakes++; });
    cor.forEach(function (n) { if (!sel.has(n)) mistakes++; });
    return mistakes;
  }

  /** 0 ошибок — 2 балла, 1 ошибка — 1 балл, 2 и более — 0 баллов. */
  function scoreAnswer(selected, correct) {
    return Math.max(0, MAX_SCORE - countMistakes(selected, correct));
  }

  /** «1, 3, 5» — номера по возрастанию без повторов. */
  function formatAnswer(numbers) {
    if (!numbers || numbers.length === 0) return '—';
    return Array.from(new Set(numbers))
      .sort(function (a, b) { return a - b; })
      .join(', ');
  }

  /** Процент от максимума, округлённый до целого. */
  function percent(score, max) {
    if (!max) return 0;
    return Math.round((score / max) * 100);
  }

  /** «балл», «балла», «баллов». */
  function pluralPoints(n) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'балл';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'балла';
    return 'баллов';
  }

  var scoring = {
    MAX_SCORE: MAX_SCORE,
    getCorrectNumbers: getCorrectNumbers,
    countMistakes: countMistakes,
    scoreAnswer: scoreAnswer,
    formatAnswer: formatAnswer,
    percent: percent,
    pluralPoints: pluralPoints
  };

  var EGE = root.EGE || (root.EGE = {});
  EGE.scoring = scoring;
  if (typeof module !== 'undefined' && module.exports) module.exports = scoring;
})(typeof window !== 'undefined' ? window : globalThis);
