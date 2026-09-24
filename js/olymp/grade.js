/**
 * Олимпиады: оценка ответа на задание. Одна функция для тематической
 * тренировки и пробного тура, поэтому результаты в режимах совпадают.
 *
 * Проверка по ключу (вердикт) не зависит от критериев оценивания.
 * Баллы начисляются, только если критерии определены; иначе points и
 * maxPoints — null.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var types = OLY.types;
  var scoringRules = OLY.scoringRules;

  /**
   * Критерии задания с учётом позиции источника: если у позиции есть поле
   * scoring (в том числе null), оно заменяет task.scoring.
   */
  function resolveScoring(task, sourceItem) {
    if (sourceItem && Object.prototype.hasOwnProperty.call(sourceItem, 'scoring')) return sourceItem.scoring;
    return task.scoring === undefined ? null : task.scoring;
  }

  /**
   * Оценивает ответ ученика.
   * scoring — критерии (см. resolveScoring); если не передан, берётся task.scoring.
   * Возвращает:
   *   { response,               // ответ в каноническом виде
   *     verdict,                // 'correct' | 'incorrect' | 'unanswered'
   *     details,                // подробности проверки от типа задания (или null)
   *     correct,                // правильный ответ
   *     points, maxPoints,      // null, если критерии не определены
   *     scored }                // определены ли критерии
   * Пустой ответ — 'unanswered'; при определённых критериях за него 0 баллов.
   */
  function gradeTask(task, response, scoring) {
    var type = types.get(task.type);
    var criteria = scoring === undefined ? resolveScoring(task, null) : scoring;
    var errors = scoringRules.validateScoring(criteria, task.type);
    if (errors.length) throw new Error('Задание ' + task.id + ': ' + errors.join('; '));

    var result = {
      response: null,
      verdict: 'unanswered',
      details: null,
      correct: type.getCorrect(task),
      points: null,
      maxPoints: criteria ? criteria.maxPoints : null,
      scored: !!criteria
    };

    if (type.isEmpty(task, response)) {
      result.response = type.emptyResponse(task);
      if (criteria) result.points = 0;
      return result;
    }

    result.response = type.cleanResponse(task, response);
    var checked = type.check(task, result.response);
    result.verdict = checked.verdict;
    result.details = checked.details;

    if (criteria) {
      var rule = scoringRules.get(criteria.rule);
      var points = rule.score(checked, criteria.maxPoints, criteria.params || {}, task);
      if (typeof points !== 'number' || !isFinite(points)) {
        throw new Error('Правило ' + criteria.rule + ' вернуло некорректный балл для ' + task.id);
      }
      result.points = Math.min(criteria.maxPoints, Math.max(0, points));
    }
    return result;
  }

  OLY.grade = {
    resolveScoring: resolveScoring,
    gradeTask: gradeTask
  };
})(typeof window !== 'undefined' ? window : globalThis);
