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
 *     elements: { H: { explanation: '…', wrong: '…' | { short, full } }, … },  // для каждого элемента палитры
 *     scoring?: 'independent'      // элементы оцениваются независимо (см. independent())
 *   },
 *   sections?: [...]                // строки выбора (как в analysis-grid, без доказательства)
 * }
 *
 * Ответ: { marks: { fragmentId: 'H' | null }, rows: { rowId: { c, f, e } } }.
 *
 * Баллы:
 *   T — по 1 за каждый элемент палитры. Балл элемента снимается, если хотя бы один
 *       его фрагмент (по эталону) пропущен или помечен другим элементом. Спорный фрагмент
 *       со списком засчитывается с любой меткой из списка. Одна неверная метка снимает
 *       не больше одного балла (см. scoreMarkup). Метка элементом, которого в тексте нет
 *       («дописанная» санкция), и метка на фрагменте вне всех элементов снимают балл
 *       элемента, которым поставлены.
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
    if (task.markup.scoring !== undefined && task.markup.scoring !== 'independent') errors.push("markup.scoring — только 'independent'");
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

  /**
   * Оценка разметки: по элементам и по фрагментам.
   *
   * Каждый неверно размеченный или пропущенный фрагмент — одна ошибка, и она снимает
   * не больше одного балла: ошибка засчитывается элементу, к которому фрагмент относится
   * по эталону (для спорного фрагмента — первому элементу списка). Метка, поставленная
   * не тем элементом, отмечается у этого элемента как замечание без снятия балла.
   * Ошибка засчитывается элементу, которым помечен фрагмент, если фрагмент по эталону
   * не относится ни к одному элементу (null) или если этого элемента в тексте нет вовсе
   * («дописанная» санкция): тогда у элемента фрагмента по эталону — замечание.
   */
  /**
   * markup.scoring: 'independent' — каждый элемент оценивается самостоятельно: элемент засчитывается,
   * если все его фрагменты размечены им и его метка не стоит на чужих фрагментах. Неверная метка на
   * фрагменте элемента X меткой Y снимает балл у X (не распознан) и у Y (поставлен ошибочно) — и только
   * у них. Без этого поля — прежнее правило: одна неверная метка снимает не больше одного балла.
   */
  function independent(task) {
    return !!task.markup && task.markup.scoring === 'independent';
  }

  function scoreMarkup(task, marks) {
    var elements = {};
    task.palette.forEach(function (p) { elements[p.id] = { status: 'ok', points: 1, missing: [], extra: [], noted: [], present: false }; });
    var fragments = {};
    markable(task).forEach(function (id) {
      accepted(task, id).forEach(function (label) { elements[label].present = true; });
    });
    markable(task).forEach(function (id) {
      var acc = accepted(task, id);
      var m = marks[id] || null;
      var ok = acc.length === 0 ? m === null : (m !== null && acc.indexOf(m) !== -1);
      var charged = null;
      if (!ok && independent(task)) {
        if (acc.length) elements[acc[0]].missing.push(id);
        if (m !== null) elements[m].extra.push(id);
        charged = acc.length ? acc[0] : m;
      } else if (!ok) {
        if (m !== null && !elements[m].present) {
          // «Дописан» элемент, которого в тексте нет: это и есть ошибка, балл снимается у него;
          // у элемента фрагмента по эталону — замечание.
          charged = m;
          elements[m].extra.push(id);
          if (acc.length) elements[acc[0]].noted.push(id);
        } else if (acc.length) {
          charged = acc[0];
          elements[charged].missing.push(id);
          if (m !== null) elements[m].noted.push(id);
        } else {
          charged = m;
          elements[m].extra.push(id);
        }
      }
      fragments[id] = { status: ok ? 'ok' : (m === null ? 'missed' : 'wrong'), mark: m, accepted: acc, charged: charged };
    });
    Object.keys(elements).forEach(function (label) {
      var e = elements[label];
      if (e.missing.length || e.extra.length) { e.status = 'wrong'; e.points = 0; }
      else if (e.noted.length) e.status = 'note';
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
    scoreMarkup: scoreMarkup,
    independent: independent
  };
})(typeof window !== 'undefined' ? window : globalThis);
