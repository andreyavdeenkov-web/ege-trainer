/**
 * Олимпиады, интерфейс: логика тематической тренировки поверх OLY.attempt.
 * Чистые функции без DOM.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui || (OLY.ui = {});
  var A = OLY.attempt;

  function hasDraft(attempt, taskId) {
    var task = OLY.getTask(taskId);
    return !OLY.types.get(task.type).isEmpty(task, A.getResponse(attempt, taskId));
  }

  /**
   * Состояние каждого задания для полосы номеров:
   * 'correct' | 'incorrect' — проверено; 'draft' — ответ введён, но не проверен;
   * 'empty' — ответа нет.
   */
  function taskState(attempt, taskId) {
    var result = attempt.results[taskId];
    if (result && result.verdict !== 'unanswered') return result.verdict;
    return hasDraft(attempt, taskId) ? 'draft' : 'empty';
  }

  function navItems(attempt) {
    return attempt.taskIds.map(function (id, index) {
      return { index: index, taskId: id, state: taskState(attempt, id) };
    });
  }

  function checkedCount(attempt) {
    return attempt.taskIds.filter(function (id) { return A.isChecked(attempt, id); }).length;
  }

  function uncheckedCount(attempt) {
    return attempt.taskIds.length - checkedCount(attempt);
  }

  /** Индекс ближайшего непроверенного задания после from (по кругу) или -1. */
  function nextUnchecked(attempt, from) {
    var n = attempt.taskIds.length;
    for (var step = 1; step <= n; step++) {
      var i = (from + step) % n;
      if (!A.isChecked(attempt, attempt.taskIds[i])) return i;
    }
    return -1;
  }

  /** Есть ли что терять при выходе: проверенные задания или введённые ответы. */
  function hasProgress(attempt) {
    if (!attempt || attempt.finishedAt) return false;
    return attempt.taskIds.some(function (id) {
      return A.isChecked(attempt, id) || hasDraft(attempt, id);
    });
  }

  /** ID заданий попытки: 'skipped' — без проверки, 'mistakes' — неверные. */
  function subsetIds(attempt, kind) {
    return attempt.taskIds.filter(function (id) {
      var state = taskState(attempt, id);
      if (kind === 'mistakes') return state === 'incorrect';
      if (kind === 'skipped') return state !== 'correct' && state !== 'incorrect';
      return true;
    });
  }

  /**
   * Итоги для экрана результатов. Баллы показываются, только если хотя бы у одного
   * проверенного задания есть критерии оценивания; процент не считается.
   */
  function outcome(attempt) {
    var s = A.summary(attempt);
    return {
      total: s.total,
      correct: s.correct,
      incorrect: s.incorrect,
      skipped: s.skipped,
      showPoints: s.scoredCount > 0,
      points: s.points,
      maxPoints: s.maxPoints,
      scoredCount: s.scoredCount
    };
  }

  /** Перемешивание (Фишер — Йетс); random — для тестов. */
  function shuffle(list, random) {
    var rnd = random || Math.random;
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  ui.session = {
    taskState: taskState,
    navItems: navItems,
    checkedCount: checkedCount,
    uncheckedCount: uncheckedCount,
    nextUnchecked: nextUnchecked,
    hasProgress: hasProgress,
    subsetIds: subsetIds,
    outcome: outcome,
    shuffle: shuffle
  };
})(typeof window !== 'undefined' ? window : globalThis);
