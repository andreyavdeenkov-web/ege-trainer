/**
 * Олимпиады, интерфейс: адреса экранов (hash). Чистые функции.
 *
 *   #/                         список олимпиад                  { name: 'home' }
 *   #/hp                       дисциплины олимпиады             { name: 'olympiad', olympiad: 'HP' }
 *   #/hp/SOC                   темы дисциплины                  { name: 'discipline', …, discipline: 'SOC' }
 *   #/hp/SOC/SOC-CAR           настройка тренировки по теме     { name: 'setup', …, topic: 'SOC-CAR' }
 *   #/hp/SOC/all               по всем темам дисциплины         { name: 'setup', …, topic: 'all' }
 *   #/hp/SOC/SOC-CAR/train     тренировка                       { name: 'train', … }
 *   #/hp/SOC/SOC-CAR/result    итоги                            { name: 'result', … }
 *
 * Предмет в адресе не указывается: платформа посвящена обществознанию, и
 * предмет берётся из олимпиады. Если платформа станет многопредметной,
 * уровень предмета можно вернуть в адрес и в интерфейс.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui || (OLY.ui = {});

  var STEPS = { train: true, result: true };

  function parse(hash) {
    var path = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
    if (path === '') return { name: 'home' };
    var parts = path.split('/').map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    var route = { olympiad: parts[0].toUpperCase() };
    if (parts.length === 1) { route.name = 'olympiad'; return route; }
    route.discipline = parts[1].toUpperCase();
    if (parts.length === 2) { route.name = 'discipline'; return route; }
    route.topic = parts[2].toLowerCase() === 'all' ? 'all' : parts[2].toUpperCase();
    if (parts.length === 3) { route.name = 'setup'; return route; }
    if (parts.length === 4 && STEPS[parts[3]]) { route.name = parts[3]; return route; }
    return { name: 'unknown' };
  }

  function format(route) {
    if (!route || route.name === 'home') return '#/';
    var path = '#/' + route.olympiad.toLowerCase();
    if (route.name === 'olympiad') return path;
    path += '/' + route.discipline;
    if (route.name === 'discipline') return path;
    path += '/' + route.topic;
    if (route.name === 'setup') return path;
    return path + '/' + route.name;
  }

  /** Тот же маршрут, другой экран: with(route, 'train'). */
  function withName(route, name) {
    var next = {};
    Object.keys(route).forEach(function (key) { next[key] = route[key]; });
    next.name = name;
    return next;
  }

  ui.router = { parse: parse, format: format, withName: withName };
})(typeof window !== 'undefined' ? window : globalThis);
