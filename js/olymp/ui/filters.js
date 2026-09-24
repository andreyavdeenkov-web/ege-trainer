/**
 * Олимпиады, интерфейс: фильтры тематической тренировки. Чистые функции.
 *
 * Фильтр — описание в реестре; новый фильтр добавляется вызовом
 * OLY.ui.filters.register({ key, label, always?, values(ctx), format(value, ctx) }),
 * где key — поле запроса OLY.query (class, stage, round, year, sourceKind, type…).
 *   always  — показывать всегда (класс и тур); иначе фильтр виден,
 *             только если в выборке больше одного значения;
 *   values  — возможные значения для текущей области (олимпиада, дисциплина, тема);
 *   format  — подпись значения.
 * Значения берутся из данных (индекса появлений и самих заданий) — ничего не выдумывается.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui || (OLY.ui = {});
  var fmt = ui.format;

  var ALL = 'all';
  var registry = [];

  function register(filter) {
    if (!filter || !filter.key || !filter.label || typeof filter.values !== 'function') {
      throw new Error('Фильтр: нужны key, label и values');
    }
    if (registry.some(function (f) { return f.key === filter.key; })) {
      throw new Error('Фильтр уже зарегистрирован: ' + filter.key);
    }
    registry.push(filter);
  }

  /** Объединение значений фасета по заданиям выборки. */
  function facetValues(ctx, name) {
    var seen = [];
    ctx.tasks.forEach(function (task) {
      OLY.getTaskFacets(task.id)[name].forEach(function (v) {
        if (seen.indexOf(v) === -1) seen.push(v);
      });
    });
    return seen.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
  }

  register({
    key: 'class', label: 'Класс', always: true,
    values: function (ctx) { return ctx.olympiad.classes.slice(); },
    format: function (v) { return String(v); }
  });
  register({
    key: 'round', label: 'Тур', always: true,
    values: function (ctx) { return ctx.olympiad.rounds.slice(); },
    format: function (v) { return fmt.roundLabel(v); }
  });
  register({
    key: 'stage', label: 'Этап',
    values: function (ctx) {
      var found = facetValues(ctx, 'stages');
      return (ctx.olympiad.stages || []).filter(function (s) { return found.indexOf(s) !== -1; });
    },
    format: function (v, ctx) { return fmt.stageTitle(ctx.olympiad, v).replace(/\s*этап$/i, ''); }
  });
  register({
    key: 'year', label: 'Год',
    values: function (ctx) { return facetValues(ctx, 'years'); },
    format: function (v) { return v; }
  });
  register({
    key: 'sourceKind', label: 'Источник',
    values: function (ctx) {
      var found = facetValues(ctx, 'sourceKinds');
      return OLY.SOURCE_KINDS.filter(function (k) { return found.indexOf(k) !== -1; });
    },
    format: function (v) { return fmt.sourceKindTitle(v); }
  });
  register({
    key: 'type', label: 'Тип задания',
    values: function (ctx) {
      var types = [];
      ctx.tasks.forEach(function (t) { if (types.indexOf(t.type) === -1) types.push(t.type); });
      return types;
    },
    format: function (v) { return fmt.typeTitle(v); }
  });

  /** Задания, для которых есть интерфейс. */
  function isSupported(task) {
    return !ui.views || ui.views.has(task.type);
  }

  /** Запрос по области: { olympiad, subject, discipline?, topic? } ('all' — без ограничения). */
  function scopeQuery(scope) {
    var q = { olympiad: scope.olympiad, subject: scope.subject };
    if (scope.discipline) q.discipline = scope.discipline;
    if (scope.topic && scope.topic !== ALL) q.topic = scope.topic;
    return q;
  }

  /** Задания области с учётом выбранных фильтров. */
  function buildPool(scope, selection) {
    var q = scopeQuery(scope);
    Object.keys(selection || {}).forEach(function (key) {
      if (selection[key] !== ALL && selection[key] !== undefined) q[key] = selection[key];
    });
    return OLY.query(q).filter(isSupported);
  }

  function withValue(selection, key, value) {
    var next = {};
    Object.keys(selection || {}).forEach(function (k) { next[k] = selection[k]; });
    next[key] = value;
    return next;
  }

  /**
   * Видимые фильтры с вариантами и счётчиками:
   * [{ key, label, options: [{ value, label, count, disabled, checked }] }].
   * Счётчик варианта — сколько заданий найдётся, если выбрать его
   * при остальных текущих фильтрах.
   */
  function describe(scope, selection) {
    var sel = selection || {};
    var ctx = { olympiad: OLY.getOlympiad(scope.olympiad), tasks: buildPool(scope, {}) };
    var groups = [];
    registry.forEach(function (filter) {
      var values = filter.values(ctx);
      if (!filter.always && values.length < 2) return;
      var current = sel[filter.key] === undefined ? ALL : sel[filter.key];
      var options = [{ value: ALL, label: 'Все' }].concat(values.map(function (v) {
        return { value: v, label: filter.format(v, ctx) };
      }));
      options.forEach(function (option) {
        option.count = buildPool(scope, withValue(sel, filter.key, option.value)).length;
        option.disabled = option.value !== ALL && option.count === 0;
        option.checked = option.value === current;
      });
      groups.push({ key: filter.key, label: filter.label, options: options });
    });
    return groups;
  }

  /**
   * Приводит выбор к допустимому: скрытые фильтры и значения, которых нет
   * в области, сбрасываются на «Все».
   */
  function normalize(scope, selection) {
    var sel = selection || {};
    var result = {};
    describe(scope, {}).forEach(function (group) {
      var value = sel[group.key];
      var ok = group.options.some(function (o) { return o.value === value && o.value !== ALL; });
      result[group.key] = ok ? value : ALL;
    });
    return result;
  }

  function isDefault(selection) {
    return Object.keys(selection || {}).every(function (k) { return selection[k] === ALL; });
  }

  ui.filters = {
    ALL: ALL,
    register: register,
    list: function () { return registry.slice(); },
    scopeQuery: scopeQuery,
    buildPool: buildPool,
    describe: describe,
    normalize: normalize,
    isDefault: isDefault
  };
})(typeof window !== 'undefined' ? window : globalThis);
