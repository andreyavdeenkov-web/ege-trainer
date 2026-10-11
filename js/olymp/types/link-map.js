/**
 * Олимпиады: тип задания link-map — карта связей между положениями (Ф6).
 * Подключается после js/olymp/types/nrm-choice.js.
 *
 * Ученик определяет вид связи для каждой пары положений. Виды связи с определениями
 * задаёт задание (relations; среди них обязательно «связи нет»), положения — блоки legal.
 * Дополнительные строки (sections) — утверждения о связке (Ф7) и т. п.
 *
 * Данные задания:
 * {
 *   type: 'link-map',
 *   legal: [{ id: 'gk-1064', role: 'main' | 'reference', act, ref, verified, fragments }],
 *   relations: [{ label: 'Исключение из общего правила', definition: '…' }, …],   // 3–8
 *   none: 6,                              // номер вида «связи нет»
 *   relationsNote?: '…',                 // пояснение о статусе типологии и порядка (показывается в условии)
 *   ordered?: true,                       // упорядоченное правило: выбирается первый подходящий вид —
 *                                         // так виды связи взаимно исключают друг друга
 *   pairs: [{ id, a: 'gk-1064', b: 'gk-1083', key: [3], partial?, wrong: {…}, explanation }],
 *   sections?: [...]                      // строки выбора, как в analysis-grid, без доказательства
 * }
 *
 * Баллы: по 1 за пару (½ — допустимый более слабый вид связи), компонент K;
 * строки sections — по своему компоненту.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var R = OLY.nrmRows;

  function blockOf(task, id) {
    return (task.legal || []).filter(function (b) { return b.id === id; })[0] || null;
  }

  function blockName(block) {
    return block ? block.act + ', ' + block.ref : '?';
  }

  function pairRows(task) {
    var options = (task.relations || []).map(function (r) { return r && r.label; });
    return (task.pairs || []).map(function (pair) {
      var row = {
        id: pair.id,
        label: blockName(blockOf(task, pair.a)) + ' — ' + blockName(blockOf(task, pair.b)),
        options: options, key: pair.key, wrong: pair.wrong, explanation: pair.explanation,
        component: 'K'
      };
      if (pair.partial !== undefined) row.partial = pair.partial;
      if (pair.short !== undefined) row.short = pair.short;
      return row;
    });
  }

  function rowsOf(task) {
    return pairRows(task).concat(R.rowsOf(task.sections || []));
  }

  function validate(task) {
    // Сами блоки legal и строки проверяет общая основа (nrm-choice.js).
    var errors = Array.isArray(task.legal) && task.legal.length >= 2 ? [] : ['legal — не меньше двух положений'];
    if (!Array.isArray(task.relations) || task.relations.length < 3 || task.relations.length > 8) {
      return errors.concat('relations — от 3 до 8 видов связи');
    }
    task.relations.forEach(function (r, i) {
      if (!r || !R.isText(r.label)) errors.push('relations[' + i + ']: нет label');
      if (!r || !R.isText(r.definition)) errors.push('relations[' + i + ']: нет definition — определение вида связи задаётся в условии');
    });
    if (!Number.isInteger(task.none) || !task.relations[task.none]) errors.push('none — номер вида «связи нет» в relations');
    else if (task.ordered === true && task.none !== task.relations.length - 1) errors.push('при упорядоченном правиле «связи нет» — последний вид');
    if (task.ordered !== undefined && typeof task.ordered !== 'boolean') errors.push('ordered — true или false');
    if (task.relationsNote !== undefined && !R.isText(task.relationsNote)) errors.push('relationsNote — строка');
    if (task.ordered === true && !R.isText(task.relationsNote)) errors.push('при упорядоченном правиле нужно relationsNote — объяснить ученику, что порядок — условие упражнения');
    if (!Array.isArray(task.pairs) || task.pairs.length < 2) return errors.concat('pairs — не меньше двух пар');
    task.pairs.forEach(function (pair, i) {
      var name = 'pairs[' + i + ']';
      if (!pair) { errors.push(name + ': пусто'); return; }
      if (!blockOf(task, pair.a)) errors.push(name + ': неизвестное положение a ' + pair.a);
      if (!blockOf(task, pair.b)) errors.push(name + ': неизвестное положение b ' + pair.b);
      if (pair.a === pair.b) errors.push(name + ': пара из одного положения');
    });
    if (task.sections !== undefined) {
      if (!Array.isArray(task.sections) || !task.sections.length) errors.push('sections — непустой список разделов');
      else task.sections.forEach(function (section, i) {
        if (!section || !R.isText(section.id) || !R.isText(section.title) || !Array.isArray(section.rows) || !section.rows.length) {
          errors.push('sections[' + i + ']: нужны id, title и строки');
        }
      });
    }
    return errors;
  }

  var api = OLY.nrmChoice.register('link-map', { rowsOf: rowsOf, validate: validate });

  OLY.linkMap = {
    rowsOf: rowsOf,
    pairRows: pairRows,
    blockOf: blockOf,
    blockName: blockName,
    maxByComponent: api.maxByComponent,
    maxPoints: api.maxPoints
  };
})(typeof window !== 'undefined' ? window : globalThis);
