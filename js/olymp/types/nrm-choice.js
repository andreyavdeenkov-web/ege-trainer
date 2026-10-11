/**
 * Олимпиады: общая основа типов практикума «Норма права», в которых ответ —
 * набор строк выбора (js/olymp/types/nrm-rows.js), а различается только то,
 * откуда берутся строки и как они показаны:
 *   • formula-builder — конструктор формулировки (слоты в тексте утверждения);
 *   • systematize — систематизация (позиции распределяются по общим категориям);
 *   • link-map — карта связей (вид связи для пар положений).
 *
 * Ответ: { rowId: { c, f, e } } — как в классификационной карте.
 * Баллы: по 1 (или ½) за строку в её компоненте (K или R); сумма — details.earned.
 *
 * Подключается после js/olymp/types/nrm-rows.js.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var R = OLY.nrmRows;

  /**
   * Регистрирует тип.
   * spec.rowsOf(task) — строки задания (объекты строк nrm-rows);
   * spec.validate(task) — ошибки данных, специфичные для типа (до проверки строк);
   * spec.allowLegal — допускает блоки legal (для чтения).
   */
  function register(typeName, spec) {
    function rowsOf(task) { return spec.rowsOf(task); }

    function maxByComponent(task) {
      var max = { K: 0, T: 0, R: 0 };
      rowsOf(task).forEach(function (row) { R.addMax(max, R.rowMax(row)); });
      return max;
    }

    function maxPoints(task) {
      var m = maxByComponent(task);
      return m.K + m.T + m.R;
    }

    function validateTask(task) {
      var errors = task.legal === undefined ? [] : R.validateLegal(task.legal, { required: false, requireMain: false });
      errors = errors.concat(spec.validate(task));
      if (errors.length) return errors;
      var ids = Object.create(null);
      var fragments = R.fragmentIndex(task.legal || []);
      rowsOf(task).forEach(function (row) {
        if (row && R.isText(row.id)) {
          if (ids[row.id]) errors.push('повторяющийся id ' + row.id);
          ids[row.id] = true;
        }
        errors = errors.concat(R.validateRow(row, fragments, { allowEvidence: false }));
      });
      if (errors.length === 0) errors = errors.concat(R.validateScoringTotal(task, maxPoints(task)));
      return errors;
    }

    function emptyResponse(task) {
      var rows = {};
      rowsOf(task).forEach(function (row) { rows[row.id] = R.emptyRow(); });
      return rows;
    }

    function isEmpty(task, response) {
      return rowsOf(task).every(function (row) { return R.rowIsEmpty(R.rowAnswer(response, row)); });
    }

    function isComplete(task, response) {
      return rowsOf(task).every(function (row) { return R.rowIsComplete(row, R.rowAnswer(response, row)); });
    }

    function cleanResponse(task, response) {
      return R.cleanRows(rowsOf(task), response, R.fragmentIndex(task.legal || []));
    }

    function check(task, response) {
      var components = R.emptyComponents(maxByComponent(task));
      var rows = {};
      rowsOf(task).forEach(function (row) {
        rows[row.id] = R.scoreRow(row, R.rowAnswer(response, row), components);
      });
      var earned = R.total(components, 'earned');
      var max = R.total(components, 'max');
      return { verdict: R.verdictOf(earned, max), details: { rows: rows, components: components, earned: earned, max: max } };
    }

    function getCorrect(task) {
      var rows = {};
      rowsOf(task).forEach(function (row) { rows[row.id] = R.correctRow(row); });
      return rows;
    }

    function formatResponse(task, response) {
      var rows = rowsOf(task);
      var n = rows.filter(function (row) { return R.rowIsComplete(row, R.rowAnswer(response, row)); }).length;
      return 'заполнено ' + n + ' из ' + rows.length;
    }

    OLY.types.register(typeName, {
      validateTask: validateTask,
      emptyResponse: emptyResponse,
      isEmpty: isEmpty,
      isComplete: isComplete,
      cleanResponse: cleanResponse,
      check: check,
      getCorrect: getCorrect,
      formatResponse: formatResponse
    });

    return { rowsOf: rowsOf, maxByComponent: maxByComponent, maxPoints: maxPoints };
  }

  /** Нормализация текста для сравнения вариантов: регистр, ё, пробелы. */
  function norm(text) {
    return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  OLY.nrmChoice = { register: register, norm: norm };
})(typeof window !== 'undefined' ? window : globalThis);
