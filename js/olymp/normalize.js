/**
 * Олимпиады: нормализация ответов. Чистые функции без зависимостей от DOM.
 *
 * Убираются только технические различия. Содержательно эквивалентные ответы
 * система не придумывает: допустимые варианты перечисляет преподаватель
 * в acceptedAnswers задания.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});

  /**
   * Текстовый ответ для сравнения: регистр, пробелы по краям, повторные пробелы
   * (всегда); ё → е — только при options.yo === true; кавычки и знаки препинания
   * в начале и конце ответа — только при options.punctuation === true
   * (настройки задания). Дефис и знаки внутри ответа сохраняются.
   */
  function normalizeText(value, options) {
    if (typeof value !== 'string') return '';
    var text = value;
    if (options && options.punctuation === true) text = text.replace(/[«»"“”„‘’']/g, '');
    text = text.replace(/\s+/g, ' ').trim().toLowerCase();
    if (options && options.yo === true) text = text.replace(/ё/g, 'е');
    if (options && options.punctuation === true) text = text.replace(/^[\s.,;:!?…]+|[\s.,;:!?…]+$/g, '');
    return text;
  }

  /**
   * Число из ввода ученика: «12,5» и «12.5», знак «−», пробелы между разрядами
   * («1 000»). Возвращает число или null, если ввод не является числом.
   */
  function parseNumber(value, unitSuffixes) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    var text = value.trim();
    if (unitSuffixes && unitSuffixes.length) text = stripUnit(text, unitSuffixes);
    text = text.replace(/−/g, '-').replace(/(\d)\s+(?=\d)/g, '$1');
    if (!/^[+-]?\d+([.,]\d+)?$/.test(text)) return null;
    return Number(text.replace(',', '.'));
  }

  /**
   * Убирает в конце ответа знак препинания и одну из допустимых приписок единиц
   * («1800 млрд», «1800 млрд ден. ед.»). Сравнение без учёта регистра и ё.
   */
  function stripUnit(text, unitSuffixes) {
    var rest = text.replace(/[\s.,;]+$/, '');
    var lower = rest.toLowerCase().replace(/ё/g, 'е');
    var suffixes = unitSuffixes.map(function (u) {
      return u.toLowerCase().replace(/ё/g, 'е').replace(/[\s.,;]+$/, '');
    }).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < suffixes.length; i++) {
      var u = suffixes[i];
      if (lower.length > u.length && lower.slice(-u.length) === u && /\s/.test(lower.charAt(lower.length - u.length - 1))) {
        return rest.slice(0, rest.length - u.length).trim();
      }
    }
    return rest;
  }

  OLY.normalize = {
    normalizeText: normalizeText,
    parseNumber: parseNumber
  };
})(typeof window !== 'undefined' ? window : globalThis);
