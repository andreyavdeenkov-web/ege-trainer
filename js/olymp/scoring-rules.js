/**
 * Олимпиады: реестр правил оценивания и проверка критериев задания.
 *
 * Критерии (task.scoring или scoring позиции источника) либо не определены —
 * null, либо описаны полностью:
 *   {
 *     maxPoints: 3,                 // максимальный балл
 *     rule: 'имя-правила',          // правило из этого реестра
 *     params: { … },                // параметры правила, необязательно
 *     basis: 'official' | 'author', // откуда критерии
 *     ref: 'Методические рекомендации 2026/27, с. 4' // обязательно для official
 *   }
 * null — нормальное состояние: задание проверяется по ключу (верно / неверно),
 * но баллы не начисляются, пока нет критериев из источника.
 *
 * Правил в реестре пока нет намеренно: каждое правило добавляется только тогда,
 * когда оно описано в официальных методических рекомендациях или утверждено
 * преподавателем. Контракт правила:
 *   supports: '*' или список типов заданий, к которым правило применимо;
 *   validateParams(params) → массив текстов ошибок (необязательно);
 *   score(result, maxPoints, params, task) → число баллов,
 *     где result — { verdict, details } из проверки типа задания.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});

  var BASES = ['official', 'author'];
  var SCORING_KEYS = ['maxPoints', 'rule', 'params', 'basis', 'ref'];

  var registry = Object.create(null);

  function register(name, definition) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Некорректное имя правила: ' + name);
    if (registry[name]) throw new Error('Правило уже зарегистрировано: ' + name);
    if (!definition || typeof definition.score !== 'function') {
      throw new Error('Правило ' + name + ': нет функции score');
    }
    var supports = definition.supports;
    if (supports !== '*' && !(Array.isArray(supports) && supports.length > 0)) {
      throw new Error('Правило ' + name + ': supports должно быть \'*\' или списком типов');
    }
    registry[name] = definition;
  }

  function has(name) {
    return !!registry[name];
  }

  function get(name) {
    var rule = registry[name];
    if (!rule) throw new Error('Неизвестное правило оценивания: ' + name);
    return rule;
  }

  function list() {
    return Object.keys(registry);
  }

  function supportsType(rule, type) {
    return rule.supports === '*' || rule.supports.indexOf(type) !== -1;
  }

  /**
   * Проверяет критерии для задания типа taskType.
   * Возвращает массив текстов ошибок; null (критерии не определены) — без ошибок.
   */
  function validateScoring(scoring, taskType) {
    if (scoring === null) return [];
    if (!scoring || typeof scoring !== 'object' || Array.isArray(scoring)) {
      return ['scoring должно быть объектом или null'];
    }
    var errors = [];
    Object.keys(scoring).forEach(function (key) {
      if (SCORING_KEYS.indexOf(key) === -1) errors.push('scoring: неизвестное поле ' + key);
    });
    if (typeof scoring.maxPoints !== 'number' || !isFinite(scoring.maxPoints) || scoring.maxPoints <= 0) {
      errors.push('scoring.maxPoints должно быть положительным числом');
    }
    if (BASES.indexOf(scoring.basis) === -1) {
      errors.push('scoring.basis должно быть одним из: ' + BASES.join(', '));
    }
    if (scoring.basis === 'official' && (typeof scoring.ref !== 'string' || scoring.ref.trim() === '')) {
      errors.push('scoring.ref: для официальных критериев нужна ссылка на документ');
    }
    if (scoring.params !== undefined &&
        (!scoring.params || typeof scoring.params !== 'object' || Array.isArray(scoring.params))) {
      errors.push('scoring.params должно быть объектом');
    }
    if (!has(scoring.rule)) {
      errors.push('scoring.rule: неизвестное правило ' + scoring.rule);
    } else {
      var rule = get(scoring.rule);
      if (!supportsType(rule, taskType)) {
        errors.push('scoring.rule: правило ' + scoring.rule + ' не применяется к типу ' + taskType);
      }
      if (typeof rule.validateParams === 'function') {
        errors = errors.concat(rule.validateParams(scoring.params || {}).map(function (e) {
          return 'scoring.params: ' + e;
        }));
      }
    }
    return errors;
  }

  OLY.scoringRules = {
    register: register,
    has: has,
    get: get,
    list: list,
    supportsType: supportsType,
    validateScoring: validateScoring
  };
})(typeof window !== 'undefined' ? window : globalThis);
