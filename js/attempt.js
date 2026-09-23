/**
 * Попытка прохождения теста. Чистые функции без зависимостей от DOM.
 *
 * Попытка — простой объект из примитивов и ID заданий (без ссылок на объекты
 * заданий), поэтому она целиком сериализуется в JSON и в будущем может быть
 * отправлена на сервер как есть:
 *
 * {
 *   schemaVersion: 1,
 *   id: 'uuid',
 *   startedAt: ISO-строка UTC, finishedAt: ISO-строка | null,
 *   settings: { section, topic, count },
 *   taskIds: ['SOC-STR-004', ...],          // порядок показа, фиксируется при старте
 *   answers: [{ taskId, taskVersion, position, selected, correct,
 *               points, maxPoints, answeredAt }]   // в порядке выполнения
 * }
 *
 * selected и correct — в формате js/scoring.js: номера суждений по возрастанию
 * или, для matching, номера вариантов по порядку позиций А, Б, В…
 *
 * Ответы засчитываются строго по порядку и не изменяются: answers[i]
 * всегда относится к заданию taskIds[i].
 */
(function (root) {
  'use strict';

  var EGE = root.EGE || (root.EGE = {});
  var scoring = EGE.scoring || (typeof require === 'function' ? require('./scoring.js') : null);

  var SCHEMA_VERSION = 1;

  function nowIso(now) {
    return (now || new Date()).toISOString();
  }

  function generateId() {
    var c = root.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    // Запасной вариант для старых браузеров: UUID v4 на Math.random.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
      var r = Math.random() * 16 | 0;
      return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /** Новая попытка с зафиксированным набором и порядком заданий. */
  function createAttempt(options) {
    var taskIds = options.taskIds.slice();
    if (taskIds.length === 0) throw new Error('В попытке нет заданий');
    if (new Set(taskIds).size !== taskIds.length) throw new Error('Задания в попытке повторяются');
    var s = options.settings || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      id: options.id || generateId(),
      startedAt: nowIso(options.now),
      finishedAt: null,
      settings: { section: s.section || 'all', topic: s.topic || 'all', count: s.count || null },
      taskIds: taskIds,
      answers: []
    };
  }

  function answeredCount(attempt) {
    return attempt.answers.length;
  }

  function isComplete(attempt) {
    return attempt.answers.length === attempt.taskIds.length;
  }

  /** Индекс задания, которое нужно решать сейчас (или -1, если всё решено). */
  function currentIndex(attempt) {
    return isComplete(attempt) ? -1 : attempt.answers.length;
  }

  /** Последний индекс, до которого ученик может дойти: выполненные + текущее. */
  function lastReachableIndex(attempt) {
    return Math.min(attempt.answers.length, attempt.taskIds.length - 1);
  }

  /** Можно ли открыть задание: только выполненные и текущее. */
  function canView(attempt, index) {
    return Number.isInteger(index) && index >= 0 && index <= lastReachableIndex(attempt);
  }

  /** Засчитанный ответ на задание по индексу или null. */
  function getAnswer(attempt, index) {
    return attempt.answers[index] || null;
  }

  /** Выбор суждений: номера без повторов по возрастанию. */
  function cleanChoice(task, selected) {
    var cleaned = Array.from(new Set(selected)).sort(function (a, b) { return a - b; });
    if (cleaned.length === 0) throw new Error('Не выбрано ни одного суждения');
    var max = task.statements.length;
    cleaned.forEach(function (n) {
      if (!Number.isInteger(n) || n < 1 || n > max) throw new Error('Некорректный номер суждения: ' + n);
    });
    if (scoring.getTaskType(task) === 'exclude-two' && cleaned.length !== scoring.EXCLUDE_COUNT) {
      throw new Error('Нужно выбрать ровно ' + scoring.EXCLUDE_COUNT + ' позиции');
    }
    return cleaned;
  }

  /** Соответствие: номер варианта для каждой позиции по порядку (А, Б, В…). */
  function cleanMatching(task, selected) {
    if (!Array.isArray(selected) || selected.length !== task.items.length) {
      throw new Error('Нужно выбрать вариант для каждой позиции');
    }
    var max = task.options.length;
    selected.forEach(function (n, i) {
      if (n == null) throw new Error('Не выбран вариант для позиции ' + scoring.letter(i + 1));
      if (!Number.isInteger(n) || n < 1 || n > max) throw new Error('Некорректный номер варианта: ' + n);
    });
    if (task.oneToOne && new Set(selected).size !== selected.length) {
      throw new Error('Каждый вариант можно использовать только один раз');
    }
    return selected.slice();
  }

  /**
   * Засчитывает ответ на текущее задание и возвращает запись ответа.
   * Повторный ответ на то же задание невозможен.
   */
  function recordAnswer(attempt, task, selected, now) {
    if (attempt.finishedAt) throw new Error('Попытка уже завершена');
    var index = currentIndex(attempt);
    if (index === -1) throw new Error('Все задания уже выполнены');
    if (task.id !== attempt.taskIds[index]) {
      var done = attempt.taskIds.indexOf(task.id) !== -1 && attempt.taskIds.indexOf(task.id) < index;
      throw new Error(done
        ? 'Ответ на задание ' + task.id + ' уже засчитан'
        : 'Сейчас нельзя отвечать на задание ' + task.id);
    }
    var cleaned = scoring.getTaskType(task) === 'matching'
      ? cleanMatching(task, selected)
      : cleanChoice(task, selected);

    var correct = scoring.getCorrect(task);
    var answer = {
      taskId: task.id,
      taskVersion: task.version || 1,
      position: index + 1,
      selected: cleaned,
      correct: correct,
      points: scoring.scoreTask(task, cleaned, correct),
      maxPoints: scoring.getMaxPoints(task),
      answeredAt: nowIso(now)
    };
    attempt.answers.push(answer);
    return answer;
  }

  /** Отмечает попытку завершённой. Повторный вызов ничего не меняет. */
  function finishAttempt(attempt, now) {
    if (!attempt.finishedAt) attempt.finishedAt = nowIso(now);
    return attempt;
  }

  function totalScore(attempt) {
    return attempt.answers.reduce(function (sum, a) { return sum + a.points; }, 0);
  }

  /** Максимум баллов за уже выполненные задания (для прогресса во время попытки). */
  function answeredMaxScore(attempt) {
    return attempt.answers.reduce(function (sum, a) { return sum + a.maxPoints; }, 0);
  }

  /**
   * Максимум баллов за попытку — сумма максимумов её заданий (exclude-two — 1, остальные — 2).
   * Для выполненных заданий берётся maxPoints из ответа; для невыполненных нужен
   * getTask(id) → задание, чтобы узнать его тип.
   */
  function maxScore(attempt, getTask) {
    return attempt.taskIds.reduce(function (sum, id, i) {
      var answer = attempt.answers[i];
      if (answer) return sum + answer.maxPoints;
      var task = getTask ? getTask(id) : null;
      if (!task) throw new Error('Не удалось определить максимум баллов за задание ' + id);
      return sum + scoring.getMaxPoints(task);
    }, 0);
  }

  /** Индексы выполненных заданий, за которые получен не максимальный балл. */
  function mistakeIndexes(attempt) {
    var result = [];
    attempt.answers.forEach(function (a, i) {
      if (a.points < a.maxPoints) result.push(i);
    });
    return result;
  }

  /** Независимая копия попытки для передачи наружу (например, на сервер). */
  function snapshot(attempt) {
    return JSON.parse(JSON.stringify(attempt));
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    generateId: generateId,
    createAttempt: createAttempt,
    answeredCount: answeredCount,
    isComplete: isComplete,
    currentIndex: currentIndex,
    lastReachableIndex: lastReachableIndex,
    canView: canView,
    getAnswer: getAnswer,
    recordAnswer: recordAnswer,
    finishAttempt: finishAttempt,
    totalScore: totalScore,
    answeredMaxScore: answeredMaxScore,
    maxScore: maxScore,
    mistakeIndexes: mistakeIndexes,
    snapshot: snapshot
  };

  EGE.attempt = api;

  /**
   * Точки расширения для будущей отправки результатов в базу данных.
   * Сейчас ничего не делают. Приложение вызывает их с независимыми копиями данных:
   *   onAnswer(answer, attempt) — сразу после того, как ответ засчитан;
   *   onFinish(attempt)         — один раз, когда попытка завершена.
   * Чтобы подключить сервер, достаточно переопределить эти функции,
   * например в отдельном файле js/attempt-store-api.js.
   */
  EGE.attemptStore = EGE.attemptStore || {
    onAnswer: function () {},
    onFinish: function () {}
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
