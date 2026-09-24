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
   * (всегда); ё → е — только при options.yo === true (настройка задания).
   */
  function normalizeText(value, options) {
    if (typeof value !== 'string') return '';
    var text = value.replace(/\s+/g, ' ').trim().toLowerCase();
    if (options && options.yo === true) text = text.replace(/ё/g, 'е');
    return text;
  }

  /**
   * Число из ввода ученика: «12,5» и «12.5», знак «−», пробелы между разрядами
   * («1 000»). Возвращает число или null, если ввод не является числом.
   */
  function parseNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    var text = value.trim().replace(/−/g, '-').replace(/(\d)\s+(?=\d)/g, '$1');
    if (!/^[+-]?\d+([.,]\d+)?$/.test(text)) return null;
    return Number(text.replace(',', '.'));
  }

  OLY.normalize = {
    normalizeText: normalizeText,
    parseNumber: parseNumber
  };
})(typeof window !== 'undefined' ? window : globalThis);
