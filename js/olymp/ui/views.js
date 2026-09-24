/**
 * Олимпиады, интерфейс: реестр отрисовки типов заданий.
 *
 * Логику типа (проверку ответа) задаёт js/olymp/types.js, а здесь — только
 * то, как задание выглядит. Новый тип (short-text, numeric, matching…)
 * подключается вызовом OLY.ui.views.register(type, view); экраны тренировки
 * менять не нужно. Задания типов без отрисовки в тренировку не попадают.
 *
 * Контракт view:
 *   hint(task)                          → подсказка под вопросом;
 *   render(container, task, ctx)        → поле ответа; ctx: { response, onChange(response) };
 *                                         возвращает { set(response) } для обновления извне;
 *   renderReview(container, task, ctx)  → разбор только для чтения;
 *                                         ctx: { response, result } (result = null — задание не решено);
 *   keyInput(task, response, digit)     → новый ответ по нажатию цифры или null (необязательно).
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui || (OLY.ui = {});

  var REQUIRED = ['hint', 'render', 'renderReview'];
  var registry = Object.create(null);

  function register(type, view) {
    if (registry[type]) throw new Error('Отрисовка типа уже зарегистрирована: ' + type);
    REQUIRED.forEach(function (fn) {
      if (typeof view[fn] !== 'function') throw new Error('Отрисовка ' + type + ': нет функции ' + fn);
    });
    registry[type] = view;
  }

  function has(type) {
    return !!registry[type];
  }

  function get(type) {
    var view = registry[type];
    if (!view) throw new Error('Нет отрисовки для типа ' + type);
    return view;
  }

  ui.views = {
    register: register,
    has: has,
    get: get,
    list: function () { return Object.keys(registry); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
