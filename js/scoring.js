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
 *                   Модель оценивания задаёт task.kimTask: 3 — 1 балл только
 *                   за полностью верный ответ; без поля (модель заданий 6, 13, 15) —
 *                   2 балла, 1 балл при одной неверной позиции.
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

  /**
   * Количество ошибок в ответе с выбором нескольких цифр — по правилу ФИПИ:
   * большее из числа лишних (неверных) и числа недостающих цифр.
   * Одна ошибка: одна цифра заменена другой (ключ 135, ответ 145), одна лишняя
   * (1356) или одна пропущена (13). Две и больше — всё остальное.
   */
  function countMistakes(selected, correct) {
    var sel = new Set(selected);
    var cor = new Set(correct);
    var extra = 0;
    var missed = 0;
    sel.forEach(function (n) { if (!cor.has(n)) extra++; });
    cor.forEach(function (n) { if (!sel.has(n)) missed++; });
    return Math.max(extra, missed);
  }

  /** 0 ошибок — 2 балла, 1 ошибка — 1 балл, 2 и более — 0 баллов (ошибки — см. countMistakes). */
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
    return countMistakes(selected, correct);
  }

  /** matching: ошибка — каждая позиция, у которой номер не совпал с ключом (или не выбран). */
  function countMatchingMistakes(selected, correct) {
    var mistakes = 0;
    correct.forEach(function (n, i) { if (!selected || selected[i] !== n) mistakes++; });
    return mistakes;
  }

  /** Шкала «ошибки → баллы»: 0 ошибок — максимум, каждая ошибка снимает балл. */
  function pointsByMistakes(maxPoints) {
    return function (mistakes) { return Math.max(0, maxPoints - mistakes); };
  }

  /** Шкала «всё или ничего»: балл только за полностью верный ответ. */
  function allOrNothing(maxPoints) {
    return function (mistakes) { return mistakes === 0 ? maxPoints : 0; };
  }

  /**
   * Своя проверка для каждой модели оценивания: подсчёт ошибок и шкала баллов.
   * Модель — это тип задания, а у matching ещё и позиция в КИМ (task.kimTask):
   * соответствие на позиции 3 оценивается иначе, чем на позициях 6, 13, 15.
   * Оценивание моделей не смешивается. Новая модель — новая строка таблицы.
   */
  var GRADERS = {
    'multiple': { maxPoints: MAX_SCORE, countMistakes: countMistakes, points: pointsByMistakes(MAX_SCORE) },
    'exclude-two': { maxPoints: 1, countMistakes: countExcludeMistakes, points: allOrNothing(1) },
    'matching': { maxPoints: MAX_SCORE, countMistakes: countMatchingMistakes, points: pointsByMistakes(MAX_SCORE) },
    'matching-1': { maxPoints: 1, countMistakes: countMatchingMistakes, points: allOrNothing(1) }
  };

  /** Модели оценивания (ключи GRADERS и SCORING_RULES). */
  var SCORING_MODELS = Object.keys(GRADERS);

  /**
   * Позиции КИМ, при которых соответствие оценивается в 1 балл.
   * Остальные соответствия (task.kimTask не задан или 6, 13, 15) — 2 балла.
   */
  var ONE_POINT_MATCHING_KIM_TASKS = [3];

  /** Модель оценивания задания: тип, а для matching — с учётом task.kimTask. */
  function getScoringModel(task) {
    var type = getTaskType(task);
    if (type === 'matching' && ONE_POINT_MATCHING_KIM_TASKS.indexOf(task.kimTask) !== -1) return 'matching-1';
    return type;
  }

  /** Источник, по которому сверены правила оценивания. */
  var FIPI_REFERENCE = 'Демонстрационный вариант КИМ ЕГЭ-2026 по обществознанию (ФИПИ), ' +
    '«Система оценивания экзаменационной работы», часть 1; совпадает с п. 10 ' +
    'спецификации КИМ ЕГЭ-2027 (проект). Спецификация 2026 г. при сверке не использовалась.';

  /**
   * Правила оценивания, на которых построены GRADERS, и статус их сверки
   * с официальными документами ФИПИ. verified: true — правило совпадает
   * с документом из reference. kimTasks — позиции КИМ с этой моделью.
   */
  var SCORING_RULES = {
    'multiple': {
      title: 'Выбор нескольких верных ответов',
      rule: 'Полное совпадение — 2 балла; одна цифра заменена другой, одна лишняя или одна пропущена — 1 балл; иначе 0.',
      kimTasks: [2, 4, 5, 7, 8, 10, 11, 14, 16],
      verified: true,
      reference: FIPI_REFERENCE
    },
    'exclude-two': {
      title: 'Два термина, «выпадающих» из общего ряда',
      rule: 'Ровно две позиции; 1 балл только за полностью верный ответ, иначе 0.',
      kimTasks: [1],
      verified: true,
      reference: FIPI_REFERENCE
    },
    'matching': {
      title: 'Установление соответствия (2 балла)',
      rule: 'Ошибка — каждая позиция с неверным номером; 0 ошибок — 2 балла, 1 — 1 балл, 2 и более — 0.',
      kimTasks: [6, 13, 15],
      verified: true,
      reference: FIPI_REFERENCE
    },
    'matching-1': {
      title: 'Установление соответствия (1 балл)',
      rule: '1 балл только при полном совпадении всех позиций с ключом, иначе 0.',
      kimTasks: [3],
      verified: true,
      reference: FIPI_REFERENCE
    }
  };

  function graderFor(task) {
    var grader = GRADERS[getScoringModel(task)];
    if (!grader) throw new Error('Неизвестный тип задания: ' + getTaskType(task));
    return grader;
  }

  /** Количество ошибок с учётом типа задания. */
  function countTaskMistakes(task, selected, correct) {
    return graderFor(task).countMistakes(selected, correct || getCorrect(task));
  }

  /** Максимальный балл за задание: exclude-two и matching на позиции 3 — 1, остальные — 2. */
  function getMaxPoints(task) {
    return graderFor(task).maxPoints;
  }

  /**
   * Балл за задание любого типа.
   * multiple и matching: 0 ошибок — 2, 1 ошибка — 1, 2 и более — 0.
   * exclude-two и matching на позиции 3: 1 балл только за полностью верный ответ.
   */
  function scoreTask(task, selected, correct) {
    return graderFor(task).points(countTaskMistakes(task, selected, correct));
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
    GRADERS: GRADERS,
    SCORING_MODELS: SCORING_MODELS,
    ONE_POINT_MATCHING_KIM_TASKS: ONE_POINT_MATCHING_KIM_TASKS,
    getScoringModel: getScoringModel,
    SCORING_RULES: SCORING_RULES,
    getMaxPoints: getMaxPoints,
    scoreTask: scoreTask,
    pointsLevel: pointsLevel,
    formatTaskAnswer: formatTaskAnswer
  };

  var EGE = root.EGE || (root.EGE = {});
  EGE.scoring = scoring;
  if (typeof module !== 'undefined' && module.exports) module.exports = scoring;
})(typeof window !== 'undefined' ? window : globalThis);
