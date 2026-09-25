/**
 * Учебник: адреса экранов (hash). Чистые функции.
 *
 *   #/                    каталог глав                { name: 'home' }
 *   #/power               обзор главы                 { name: 'chapter', chapter: 'power' }
 *   #/power/legitimacy    раздел главы                { name: 'section', chapter: 'power', section: 'legitimacy' }
 */
(function (root) {
  'use strict';

  var TXT = root.TXT || (root.TXT = {});
  var ID = /^[a-z][a-z0-9-]*$/;

  function parse(hash) {
    var path = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
    if (path === '') return { name: 'home' };
    var parts = path.split('/').map(function (p) {
      try { return decodeURIComponent(p).toLowerCase(); } catch (e) { return p.toLowerCase(); }
    });
    if (parts.length > 2 || !parts.every(function (p) { return ID.test(p); })) return { name: 'unknown' };
    if (parts.length === 1) return { name: 'chapter', chapter: parts[0] };
    return { name: 'section', chapter: parts[0], section: parts[1] };
  }

  function format(route) {
    if (!route || route.name === 'home' || route.name === 'unknown') return '#/';
    if (route.name === 'chapter') return '#/' + route.chapter;
    return '#/' + route.chapter + '/' + route.section;
  }

  TXT.router = { parse: parse, format: format };
})(typeof window !== 'undefined' ? window : globalThis);
