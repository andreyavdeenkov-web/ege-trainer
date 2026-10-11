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
   * 'correct' | 'incorrect' | 'partial' — проверено ('partial' — частичный результат
   * новых типов практикума «Норма права»); 'draft' — ответ введён, но не проверен;
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
      if (kind === 'mistakes') return state === 'incorrect' || state === 'partial';
      if (kind === 'partial') return state === 'partial';
      if (kind === 'skipped') return state !== 'correct' && state !== 'incorrect' && state !== 'partial';
      return true;
    });
  }

  /**
   * Итоги для экрана результатов. Баллы показываются, только если хотя бы у одного
   * проверенного задания есть критерии оценивания; процент не считается.
   */
  function outcome(attempt) {
    var s = A.summary(attempt);
    var o = {
      total: s.total,
      correct: s.correct,
      incorrect: s.incorrect,
      skipped: s.skipped,
      showPoints: s.scoredCount > 0,
      points: s.points,
      maxPoints: s.maxPoints,
      scoredCount: s.scoredCount
    };
    // Поля новых типов практикума «Норма права» — только если такие задания есть
    // в попытке; итоги попыток со старыми типами остаются прежними.
    if (s.partial) o.partial = s.partial;
    var components = componentTotals(attempt);
    if (components) o.components = components;
    return o;
  }

  /**
   * Баллы по компонентам (K — квалификация, T — текстовое доказательство,
   * R — логика рассуждения) по проверенным заданиям и максимум по всем заданиям
   * попытки с критериями components. null — таких заданий в попытке нет.
   */
  function componentTotals(attempt) {
    var found = false;
    var totals = { K: { earned: 0, max: 0 }, T: { earned: 0, max: 0 }, R: { earned: 0, max: 0 }, possible: 0 };
    attempt.taskIds.forEach(function (id) {
      var task = OLY.getTask(id);
      if (!task || !task.scoring || task.scoring.rule !== 'components') return;
      found = true;
      totals.possible += task.scoring.maxPoints;
      var result = attempt.results[id];
      var comp = result && result.details && result.details.components;
      if (!comp) return;
      Object.keys(comp).forEach(function (key) {
        if (!totals[key]) return;
        totals[key].earned += comp[key].earned;
        totals[key].max += comp[key].max;
      });
    });
    return found ? totals : null;
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

  /**
   * Порядок заданий новой тренировки. В практикуме — учебная последовательность
   * из данных (тема, затем order); в олимпиаде — случайный.
   */
  function arrange(olympiadId, tasks, random) {
    return OLY.isPracticum(olympiadId) ? OLY.sortByOrder(tasks) : shuffle(tasks, random);
  }

  /** То же для списка ID (повтор ошибок, пропущенных). */
  function arrangeIds(olympiadId, taskIds, random) {
    return arrange(olympiadId, taskIds.map(OLY.getTask), random).map(function (t) { return t.id; });
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
    componentTotals: componentTotals,
    shuffle: shuffle,
    arrange: arrange,
    arrangeIds: arrangeIds
  };
})(typeof window !== 'undefined' ? window : globalThis);
