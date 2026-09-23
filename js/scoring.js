/**
 * Логика проверки ответов. Чистые функции без зависимостей от DOM.
 *
 * Номера суждений — числа начиная с 1 (как их видит ученик).
 *
 * Типы заданий (поле task.type):
 *   'multiple'    — выбрать все верные суждения (по умолчанию, если type не указан);
 *   'exclude-two' — выбрать ровно две позиции, «выпадающие» из ряда
 *                   (correct: true у суждения означает «выпадает»);
 *                   максимум — 1 балл, только за полностью верный ответ;
 *   'matching'    — соответствие: для каждой позиции А, Б, В… (task.items)
 *                   выбрать номер из второго столбца (task.options).
 * Ответ на задания с выбором — отсортированный список номеров [1, 3, 5];
 * ответ на matching — номера вариантов по порядку позиций: [1, 2, 3, 4, 5]
 * означает А — 1, Б — 2 и т. д.
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

  var TYPES = ['multiple', 'exclude-two', 'matching'];
  var LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И'];
  /** В задании exclude-two ученик выбирает ровно столько позиций. */
  var EXCLUDE_COUNT = 2;

  function getTaskType(task) {
    return task.type || 'multiple';
  }

  /** Буква позиции matching по номеру с 1: 1 → «А». */
  function letter(n) {
    return LETTERS[n - 1] || String(n);
  }

  /** Правильный ответ задания любого типа (в формате записи ответа). */
  function getCorrect(task) {
    if (getTaskType(task) === 'matching') {
      return task.items.map(function (item) { return item.match; });
    }
    return getCorrectNumbers(task);
  }

  /**
   * exclude-two: ошибка — каждая выбранная позиция не из ключа
   * (или недостающая до двух). Для балла это число важно только как «ноль или нет»:
   * задание оценивается в 1 балл и засчитывается лишь при полностью верном ответе.
   */
  function countExcludeMistakes(selected, correct) {
    var sel = new Set(selected);
    var cor = new Set(correct);
    var extra = 0;
    var missed = 0;
    sel.forEach(function (n) { if (!cor.has(n)) extra++; });
    cor.forEach(function (n) { if (!sel.has(n)) missed++; });
    return Math.max(extra, missed);
  }

  /** matching: ошибка — каждая позиция, у которой номер не совпал с ключом (или не выбран). */
  function countMatchingMistakes(selected, correct) {
    var mistakes = 0;
    correct.forEach(function (n, i) { if (!selected || selected[i] !== n) mistakes++; });
    return mistakes;
  }

  /** Количество ошибок с учётом типа задания. */
  function countTaskMistakes(task, selected, correct) {
    var key = correct || getCorrect(task);
    var type = getTaskType(task);
    if (type === 'matching') return countMatchingMistakes(selected, key);
    if (type === 'exclude-two') return countExcludeMistakes(selected, key);
    return countMistakes(selected, key);
  }

  /** Максимальный балл за задание: exclude-two — 1, остальные типы — 2. */
  function getMaxPoints(task) {
    return getTaskType(task) === 'exclude-two' ? 1 : MAX_SCORE;
  }

  /**
   * Балл за задание любого типа.
   * multiple и matching: 0 ошибок — 2, 1 ошибка — 1, 2 и более — 0.
   * exclude-two: 1 балл только за полностью верный ответ, иначе 0.
   */
  function scoreTask(task, selected, correct) {
    var mistakes = countTaskMistakes(task, selected, correct);
    if (getTaskType(task) === 'exclude-two') return mistakes === 0 ? 1 : 0;
    return Math.max(0, MAX_SCORE - mistakes);
  }

  /**
   * Уровень результата для оформления: 'full' — максимальный балл,
   * 'partial' — часть баллов, 'none' — 0.
   */
  function pointsLevel(points, maxPoints) {
    if (points >= maxPoints) return 'full';
    return points > 0 ? 'partial' : 'none';
  }

  /** «А — 1, Б — 2» для matching; для заданий с выбором — как formatAnswer. */
  function formatTaskAnswer(task, value) {
    if (getTaskType(task) !== 'matching') return formatAnswer(value);
    if (!value || value.length === 0) return '—';
    return value.map(function (n, i) {
      return letter(i + 1) + '\u00a0—\u00a0' + (n == null ? '?' : n);
    }).join(', ');
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

  /**
   * Форма после «из N» (родительный падеж, согласуется с N):
   * «из 1 балла», «из 21 балла», «из 2 баллов», «из 11 баллов», «из 32 баллов».
   */
  function pluralPointsOf(n) {
    return n % 10 === 1 && n % 100 !== 11 ? 'балла' : 'баллов';
  }

  /** «11 из 31 балла», «19 из 32 баллов». */
  function formatPointsOutOf(points, max) {
    return points + ' из ' + max + ' ' + pluralPointsOf(max);
  }

  var scoring = {
    MAX_SCORE: MAX_SCORE,
    getCorrectNumbers: getCorrectNumbers,
    countMistakes: countMistakes,
    scoreAnswer: scoreAnswer,
    formatAnswer: formatAnswer,
    percent: percent,
    pluralPoints: pluralPoints,
    pluralPointsOf: pluralPointsOf,
    formatPointsOutOf: formatPointsOutOf,
    TYPES: TYPES,
    EXCLUDE_COUNT: EXCLUDE_COUNT,
    getTaskType: getTaskType,
    letter: letter,
    getCorrect: getCorrect,
    countExcludeMistakes: countExcludeMistakes,
    countMatchingMistakes: countMatchingMistakes,
    countTaskMistakes: countTaskMistakes,
    getMaxPoints: getMaxPoints,
    scoreTask: scoreTask,
    pointsLevel: pointsLevel,
    formatTaskAnswer: formatTaskAnswer
  };

  var EGE = root.EGE || (root.EGE = {});
  EGE.scoring = scoring;
  if (typeof module !== 'undefined' && module.exports) module.exports = scoring;
})(typeof window !== 'undefined' ? window : globalThis);
