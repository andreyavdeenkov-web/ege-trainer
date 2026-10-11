/**
 * Олимпиады: тип задания text-markup — разметка структуры нормы.
 * Чистые функции без DOM. Подключается после js/olymp/types/nrm-rows.js.
 *
 * Ученик помечает фрагменты нормативного текста элементами структуры
 * (по умолчанию — гипотеза, диспозиция, санкция; набор задаёт palette) и
 * отвечает на строки выбора (где находится недостающий элемент, вид гипотезы,
 * роли фрагментов других актов, утверждения).
 *
 * Данные задания:
 * {
 *   type: 'text-markup',
 *   legal: [...],                   // как в analysis-grid; размечаются фрагменты основных блоков (role: 'main'),
 *                                   // справочные блоки показываются только для чтения
 *   palette: [{ id: 'H', label: 'Гипотеза', short: 'Г', tool?: 'подпись кнопки' }, …],  // 2–6 элементов
 *   markup: {
 *     key: { fragmentId: 'H' | ['H', 'D'] | null },  // каждый размечаемый фрагмент;
 *                                   // список — спорная граница: принимается любая метка из списка;
 *                                   // null — фрагмент не относится ни к одному элементу
 *     elements: { H: { explanation: '…', wrong: '…' | { short, full } }, … }  // для каждого элемента палитры
 *   },
 *   sections?: [...]                // строки выбора (как в analysis-grid, без доказательства)
 * }
 *
 * Ответ: { marks: { fragmentId: 'H' | null }, rows: { rowId: { c, f, e } } }.
 *
 * Баллы:
 *   T — по 1 за каждый элемент палитры. Элемент размечен верно, если каждый фрагмент,
 *       который в ключе относится только к нему, помечен им; спорный фрагмент со
 *       списком помечен любой меткой из списка (неразмеченный спорный фрагмент —
 *       ошибка первого элемента списка); ни один фрагмент вне ключа элемента не помечен им.
 *       Элемент, которого в тексте нет, размечен верно, если им не помечен ни один фрагмент
 *       («санкцию в тексте не дописывают»).
 *   K / R — строки выбора (компонент строки, по умолчанию K).
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var types = OLY.types;
  var R = OLY.nrmRows;

  function rowsOf(task) {
    return R.rowsOf(task.sections || []);
  }

  /** Размечаемые фрагменты — по порядку в основных блоках. */
  function markable(task) {
    var list = [];
    (task.legal || []).forEach(function (block) {
      if (block.role !== 'main') return;
      (block.fragments || []).forEach(function (f) { if (f && f.id) list.push(f.id); });
    });
    return list;
  }

  function accepted(task, fragmentId) {
    var k = task.markup.key[fragmentId];
    if (k === null || k === undefined) return [];
    return Array.isArray(k) ? k : [k];
  }

  function paletteIds(task) {
    return task.palette.map(function (p) { return p.id; });
  }

  function maxByComponent(task) {
    var max = { K: 0, T: task.palette.length, R: 0 };
    rowsOf(task).forEach(function (row) { R.addMax(max, R.rowMax(row)); });
    return max;
  }

  function maxPoints(task) {
    var m = maxByComponent(task);
    return m.K + m.T + m.R;
  }

  /* ---------- Данные ---------- */

  function validateTask(task) {
    var errors = R.validateLegal(task.legal, { required: true, requireMain: true });
    if (!Array.isArray(task.palette) || task.palette.length < 2 || task.palette.length > 6) {
      return errors.concat('palette — от 2 до 6 элементов');
    }
    var ids = Object.create(null);
    task.palette.forEach(function (p, i) {
      if (!p || !/^[A-Z][A-Z0-9]?$/.test(p.id)) errors.push('palette[' + i + ']: id — одна-две заглавные латинские буквы');
      else if (ids[p.id]) errors.push('palette: повторяющийся id ' + p.id);
      else ids[p.id] = true;
      if (!p || !R.isText(p.label)) errors.push('palette[' + i + ']: нет label');
      if (!p || !R.isText(p.short) || p.short.length > 6) errors.push('palette[' + i + ']: short — короткая метка до 6 символов');
      if (p && p.tool !== undefined && (!R.isText(p.tool) || p.tool.length > 12)) errors.push('palette[' + i + ']: tool — подпись кнопки до 12 символов');
    });
    if (!task.markup || typeof task.markup !== 'object') return errors.concat('нет markup');
    var key = task.markup.key;
    if (!key || typeof key !== 'object' || Array.isArray(key)) return errors.concat('markup.key должно быть объектом');
    var fragments = markable(task);
    if (fragments.length === 0) errors.push('в основных блоках нет размечаемых фрагментов');
    fragments.forEach(function (id) {
      if (!R.own(key, id)) { errors.push('markup.key: нет ключа для фрагмента ' + id); return; }
      var k = key[id];
      if (k === null) return;
      var list = Array.isArray(k) ? k : [k];
      if (list.length === 0 || new Set(list).size !== list.length) errors.push('markup.key ' + id + ': пустой или повторяющийся список');
      list.forEach(function (label) {
        if (!ids[label]) errors.push('markup.key ' + id + ': неизвестный элемент ' + label);
      });
    });
    Object.keys(key).forEach(function (id) {
      if (fragments.indexOf(id) === -1) errors.push('markup.key: фрагмент ' + id + ' не размечается (нет в основных блоках)');
    });
    var elements = task.markup.elements;
    if (!elements || typeof elements !== 'object') errors.push('нет markup.elements');
    else {
      task.palette.forEach(function (p) {
        var e = elements[p.id];
        if (!e || !R.isText(e.explanation)) errors.push('markup.elements.' + p.id + ': нет explanation');
        if (!e || !R.isExplanation(e.wrong)) errors.push('markup.elements.' + p.id + ': нет объяснения ошибки wrong');
      });
    }
    if (task.sections !== undefined) {
      errors = errors.concat(R.validateSections(task.sections, R.fragmentIndex(task.legal), { allowEvidence: false }));
    }
    if (errors.length === 0) errors = errors.concat(R.validateScoringTotal(task, maxPoints(task)));
    return errors;
  }

  /* ---------- Ответ ---------- */

  function emptyResponse(task) {
    var marks = {};
    markable(task).forEach(function (id) { marks[id] = null; });
    var rows = {};
    rowsOf(task).forEach(function (row) { rows[row.id] = R.emptyRow(); });
    return { marks: marks, rows: rows };
  }

  function marksOf(response) {
    return response && response.marks && typeof response.marks === 'object' ? response.marks : {};
  }

  function isEmpty(task, response) {
    if (!response || typeof response !== 'object') return true;
    var marks = marksOf(response);
    var anyMark = markable(task).some(function (id) { return marks[id]; });
    if (anyMark) return false;
    return rowsOf(task).every(function (row) { return R.rowIsEmpty(R.rowAnswer(response.rows, row)); });
  }

  function isComplete(task, response) {
    if (!response || typeof response !== 'object') return false;
    var marks = marksOf(response);
    var anyMark = markable(task).some(function (id) { return marks[id]; });
    return anyMark && rowsOf(task).every(function (row) { return R.rowIsComplete(row, R.rowAnswer(response.rows, row)); });
  }

  function cleanResponse(task, response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Ответ должен быть объектом');
    Object.keys(response).forEach(function (k) {
      if (k !== 'marks' && k !== 'rows') throw new Error('Неизвестное поле ответа: ' + k);
    });
    var marks = response.marks === undefined ? {} : response.marks;
    if (!marks || typeof marks !== 'object' || Array.isArray(marks)) throw new Error('marks должно быть объектом');
    var fragments = markable(task);
    var labels = paletteIds(task);
    Object.keys(marks).forEach(function (id) {
      if (fragments.indexOf(id) === -1) throw new Error('Фрагмент ' + id + ' не размечается');
      var v = marks[id];
      if (v !== null && labels.indexOf(v) === -1) throw new Error('Неизвестная метка ' + v);
    });
    var cleanedMarks = {};
    fragments.forEach(function (id) { cleanedMarks[id] = R.own(marks, id) ? marks[id] : null; });
    return { marks: cleanedMarks, rows: R.cleanRows(rowsOf(task), response.rows, R.fragmentIndex(task.legal)) };
  }

  /* ---------- Проверка ---------- */

  /** Оценка разметки: по элементам и по фрагментам. */
  function scoreMarkup(task, marks) {
    var elements = {};
    task.palette.forEach(function (p) { elements[p.id] = { status: 'ok', points: 1, missing: [], extra: [], present: false }; });
    var fragments = {};
    markable(task).forEach(function (id) {
      var acc = accepted(task, id);
      var m = marks[id] || null;
      acc.forEach(function (label) { elements[label].present = true; });
      var ok = acc.length === 0 ? m === null : (m !== null && acc.indexOf(m) !== -1);
      fragments[id] = { status: ok ? 'ok' : (m === null ? 'missed' : 'wrong'), mark: m, accepted: acc };
      if (ok) return;
      if (m !== null && acc.indexOf(m) === -1) elements[m].extra.push(id);
      if (acc.length && (m === null || acc.indexOf(m) === -1)) {
        // Пропущенный или неверно помеченный фрагмент — ошибка элемента(ов) ключа.
        if (acc.length === 1) elements[acc[0]].missing.push(id);
        else if (m === null) elements[acc[0]].missing.push(id);
        else acc.forEach(function (label) { elements[label].missing.push(id); });
      }
    });
    Object.keys(elements).forEach(function (label) {
      var e = elements[label];
      if (e.missing.length || e.extra.length) { e.status = 'wrong'; e.points = 0; }
    });
    return { elements: elements, fragments: fragments };
  }

  function check(task, response) {
    var components = R.emptyComponents(maxByComponent(task));
    var markup = scoreMarkup(task, marksOf(response));
    Object.keys(markup.elements).forEach(function (label) { components.T.earned += markup.elements[label].points; });
    var rows = {};
    rowsOf(task).forEach(function (row) {
      rows[row.id] = R.scoreRow(row, R.rowAnswer(response.rows, row), components);
    });
    var earned = R.total(components, 'earned');
    var max = R.total(components, 'max');
    return {
      verdict: R.verdictOf(earned, max),
      details: { markup: markup, rows: rows, components: components, earned: earned, max: max }
    };
  }

  function getCorrect(task) {
    var marks = {};
    markable(task).forEach(function (id) {
      var acc = accepted(task, id);
      marks[id] = acc.length ? acc[0] : null;
    });
    var rows = {};
    rowsOf(task).forEach(function (row) { rows[row.id] = R.correctRow(row); });
    return { marks: marks, rows: rows };
  }

  function formatResponse(task, response) {
    var marks = marksOf(response);
    var n = markable(task).filter(function (id) { return marks[id]; }).length;
    return 'размечено фрагментов: ' + n + ' из ' + markable(task).length;
  }

  types.register('text-markup', {
    validateTask: validateTask,
    emptyResponse: emptyResponse,
    isEmpty: isEmpty,
    isComplete: isComplete,
    cleanResponse: cleanResponse,
    check: check,
    getCorrect: getCorrect,
    formatResponse: formatResponse
  });

  OLY.textMarkup = {
    markable: markable,
    accepted: accepted,
    rowsOf: rowsOf,
    maxByComponent: maxByComponent,
    maxPoints: maxPoints,
    scoreMarkup: scoreMarkup
  };
})(typeof window !== 'undefined' ? window : globalThis);
