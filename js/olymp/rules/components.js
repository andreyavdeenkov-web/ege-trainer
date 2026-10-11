/**
 * Олимпиады: правило оценивания components — авторские баллы олимпиадного
 * практикума «Норма права». Утверждено преподавателем (basis: 'author').
 *
 * Баллы задания — сумма баллов его элементов, которую считает сам тип задания
 * (details.earned): квалификация (K), текстовое доказательство (T) и логика
 * рассуждения (R), включая частичные баллы. maxPoints задания должен равняться
 * сумме максимумов элементов — это проверяет тип при регистрации задания.
 *
 * Подключается после js/olymp/scoring-rules.js и типов заданий.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});

  OLY.scoringRules.register('components', {
    supports: ['analysis-grid'],
    score: function (result) {
      return result && result.details && typeof result.details.earned === 'number' ? result.details.earned : 0;
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
