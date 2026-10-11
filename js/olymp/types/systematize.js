/**
 * Олимпиады: тип задания systematize — систематизация и сопоставление (Ф4).
 * Подключается после js/olymp/types/nrm-choice.js.
 *
 * Ученик относит каждую позицию (фрагмент акта, правило, ситуацию) к одной из общих
 * категорий. Категории повторяются, не все обязательно нужны; среди них может быть
 * «не относится». Категорий не меньше трёх, поэтому угадывание по исключению не работает.
 *
 * Данные задания:
 * {
 *   type: 'systematize',
 *   categories: [{ label: 'Норма права', short?: 'НП', definition?: '…' }, …],   // 3–8;
 *                                   // определения показываются в условии — по ним задание решается однозначно
 *   categoriesTitle?: 'Виды социальных норм',
 *   items: [{ id, text, source?: 'пересказ ст. 136 ТК', key: [0], partial?, wrong: {…},
 *             explanation, component?: 'K' | 'R' }],
 *   legal?: [...]
 * }
 *
 * Баллы: по 1 за позицию (½ — допустимая более слабая категория), компонент по умолчанию K.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var R = OLY.nrmRows;

  function labels(task) {
    return (task.categories || []).map(function (c) { return c && c.label; });
  }

  function rowsOf(task) {
    var options = labels(task);
    return (task.items || []).map(function (item) {
      var row = { id: item.id, label: item.text, options: options, key: item.key, wrong: item.wrong, explanation: item.explanation };
      if (item.partial !== undefined) row.partial = item.partial;
      if (item.component !== undefined) row.component = item.component;
      if (item.short !== undefined) row.short = item.short;
      if (item.source !== undefined) row.note = item.source;
      return row;
    });
  }

  function validate(task) {
    var errors = [];
    if (!Array.isArray(task.categories) || task.categories.length < 3 || task.categories.length > 8) {
      return ['categories — от 3 до 8 категорий'];
    }
    var seen = {};
    task.categories.forEach(function (c, i) {
      if (!c || !R.isText(c.label)) errors.push('categories[' + i + ']: нет label');
      else if (seen[c.label]) errors.push('categories: повторяется «' + c.label + '»');
      else seen[c.label] = true;
      if (c && c.short !== undefined && (!R.isText(c.short) || c.short.length > 4)) errors.push('categories[' + i + ']: short — до 4 символов');
      if (c && c.definition !== undefined && !R.isText(c.definition)) errors.push('categories[' + i + ']: definition — строка');
    });
    var withDef = task.categories.filter(function (c) { return c && c.definition !== undefined; }).length;
    if (withDef && withDef !== task.categories.length) errors.push('categories: определения задаются для всех категорий или ни для одной');
    if (task.criterion !== undefined && !R.isText(task.criterion)) errors.push('criterion — строка');
    if (!Array.isArray(task.items) || task.items.length < 3) errors.push('items — не меньше трёх позиций');
    else task.items.forEach(function (item, i) {
      if (!item || !R.isText(item.text)) errors.push('items[' + i + ']: нет text');
      if (item && item.source !== undefined && !R.isText(item.source)) errors.push('items[' + i + ']: source — строка');
    });
    return errors;
  }

  var api = OLY.nrmChoice.register('systematize', { rowsOf: rowsOf, validate: validate });

  OLY.systematize = { rowsOf: rowsOf, labels: labels, maxByComponent: api.maxByComponent, maxPoints: api.maxPoints };
})(typeof window !== 'undefined' ? window : globalThis);
