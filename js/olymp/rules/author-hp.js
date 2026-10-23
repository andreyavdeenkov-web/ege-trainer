/**
 * Олимпиады: авторские правила оценивания пробных туров «Высшей пробы».
 * Утверждены преподавателем (basis: 'author'); официальны только максимальные
 * баллы за задание каждого типа (методические рекомендации 2026/27, п. 2.2),
 * правила начисления баллов олимпиада не публикует.
 *
 *   all-or-nothing       — строгая схема: максимум только за полностью верный ответ;
 *   one-mistake-partial  — диагностическая схема для множественного выбора:
 *                          максимум за верный набор, params.points за набор с одной
 *                          ошибкой (один пропуск или один лишний вариант), иначе 0;
 *   per-item             — диагностическая схема для соотнесения:
 *                          params.points за каждую верную пару.
 *
 * Подключается после js/olymp/scoring-rules.js и типов заданий.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});

  function positive(params, key) {
    return typeof params[key] === 'number' && isFinite(params[key]) && params[key] > 0
      ? [] : [key + ' должно быть положительным числом'];
  }

  OLY.scoringRules.register('all-or-nothing', {
    supports: ['multiple-select', 'short-text', 'numeric', 'matching', 'multi-field'],
    score: function (result, maxPoints) {
      return result.verdict === 'correct' ? maxPoints : 0;
    }
  });

  OLY.scoringRules.register('one-mistake-partial', {
    supports: ['multiple-select'],
    validateParams: function (params) { return positive(params, 'points'); },
    score: function (result, maxPoints, params) {
      if (result.verdict === 'correct') return maxPoints;
      return result.details && result.details.mistakes === 1 ? params.points : 0;
    }
  });

  OLY.scoringRules.register('per-item', {
    supports: ['matching'],
    validateParams: function (params) { return positive(params, 'points'); },
    score: function (result, maxPoints, params) {
      var perItem = (result.details && result.details.perItem) || [];
      return perItem.filter(Boolean).length * params.points;
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
