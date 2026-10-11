/**
 * Олимпиады: тип задания analysis-grid — классификационная карта.
 * Чистые функции без зависимостей от DOM. Подключается после js/olymp/types.js.
 *
 * Ученик для каждой строки выбирает значение (квалификацию нормы по основанию,
 * решение о применимости основания, оценку довода), при необходимости уточняет
 * выбор («спорно» → между какими видами) и отмечает фрагменты нормативного текста,
 * на которых основан вывод. Проверка полностью автоматическая, с частичными баллами
 * по трём компонентам: K — квалификация, T — текстовое доказательство,
 * R — логика рассуждения.
 *
 * Данные задания:
 * {
 *   type: 'analysis-grid',
 *   legal: [{ id, act, ref, role: 'main' | 'reference', edition?, checked?, url?,
 *             verified: true | false,          // сверен ли текст с официальным источником
 *             fragments: [{ id?, text }] }],   // фрагмент без id — связка, его нельзя отметить
 *   sections: [{ id, title, hint?, rows: [{
 *     id, label, note?,
 *     options: ['…', …],
 *     key: [i, …],             // правильные значения (номера с 0); несколько — равноправные ответы
 *     partial: [i, …]?,        // допустимые, но более слабые ответы — 0,5 балла
 *     component: 'K' | 'R'?,   // компонент балла за выбор (по умолчанию K)
 *     wrong: { i: '…' },       // объяснение для каждого варианта не из key (обязательно)
 *     explanation: '…',        // почему верен ключ
 *     followUp?: {             // уточнение выбора: например, «спорно → между какими видами»
 *       when: i, label, options: ['…'], key: [j, …], wrong?: { j: '…' }
 *     },
 *     evidence?: {             // текстовое доказательство (компонент T)
 *       key: ['fragmentId', …], max?: 3, explanation: '…', wrong?: { fragmentId: '…' }
 *     }
 *   }] }]
 * }
 *
 * Ответ ученика: { rowId: { c: номер варианта | null, f: [номера уточнения], e: [id фрагментов] } }.
 *
 * Баллы строки:
 *   выбор — 1, если значение в key (при уточнении — и набор уточнения совпал;
 *           0,5 — если уточнение указано частично без лишнего; 0 — если уточнение
 *           не указано или в нём есть неверный вариант);
 *           0,5 — если значение в partial; иначе 0;
 *   доказательство — 1, если отмечен хотя бы один ключевой фрагмент
 *           и не больше одного постороннего; иначе 0.
 * Вердикт: correct — все баллы; partial — часть; incorrect — ноль.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var types = OLY.types;

  var COMPONENTS = ['K', 'T', 'R'];
  var CHOICE_COMPONENTS = ['K', 'R'];
  var DEFAULT_EVIDENCE_MAX = 3;

  function isText(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function isIndex(n, length) {
    return Number.isInteger(n) && n >= 0 && n < length;
  }

  function uniqueIndices(list, length) {
    return Array.isArray(list) && list.length > 0 &&
      list.every(function (n) { return isIndex(n, length); }) &&
      new Set(list).size === list.length;
  }

  function own(object, key) {
    return !!object && Object.prototype.hasOwnProperty.call(object, key);
  }

  /** Все строки задания по порядку разделов. */
  function rowsOf(task) {
    var rows = [];
    (task.sections || []).forEach(function (section) {
      (section.rows || []).forEach(function (row) { rows.push(row); });
    });
    return rows;
  }

  /** Все фрагменты, которые можно отметить: { id: { fragment, block } }. */
  function fragmentIndex(task) {
    var index = Object.create(null);
    (task.legal || []).forEach(function (block) {
      (block.fragments || []).forEach(function (fragment) {
        if (fragment && fragment.id) index[fragment.id] = { fragment: fragment, block: block };
      });
    });
    return index;
  }

  function choiceComponent(row) {
    return row.component || 'K';
  }

  /** Максимум баллов по компонентам: { K, T, R }. */
  function maxByComponent(task) {
    var max = { K: 0, T: 0, R: 0 };
    rowsOf(task).forEach(function (row) {
      max[choiceComponent(row)] += 1;
      if (row.evidence) max.T += 1;
    });
    return max;
  }

  function maxPoints(task) {
    var max = maxByComponent(task);
    return max.K + max.T + max.R;
  }

  /* ---------- Проверка данных ---------- */

  function validateLegal(task) {
    var errors = [];
    if (!Array.isArray(task.legal) || task.legal.length === 0) return ['нужен хотя бы один блок legal'];
    var ids = Object.create(null);
    var blockIds = Object.create(null);
    task.legal.forEach(function (block, b) {
      var name = 'legal[' + b + ']';
      if (!block || !isText(block.id)) { errors.push(name + ': нет id'); return; }
      if (blockIds[block.id]) errors.push(name + ': повторяющийся id ' + block.id);
      blockIds[block.id] = true;
      if (!isText(block.act)) errors.push(name + ': нет act (наименование акта)');
      if (!isText(block.ref)) errors.push(name + ': нет ref (статья, часть)');
      if (block.role !== 'main' && block.role !== 'reference') errors.push(name + ': role должно быть main или reference');
      if (typeof block.verified !== 'boolean') errors.push(name + ': verified должно быть true или false');
      if (block.verified === true) {
        if (!isText(block.edition)) errors.push(name + ': для сверенного текста нужна редакция (edition)');
        if (!isText(block.checked)) errors.push(name + ': для сверенного текста нужна дата проверки (checked)');
        if (!isText(block.url)) errors.push(name + ': для сверенного текста нужен адрес источника (url)');
      }
      if (!Array.isArray(block.fragments) || block.fragments.length === 0) {
        errors.push(name + ': нет фрагментов текста');
        return;
      }
      block.fragments.forEach(function (fragment, f) {
        if (!fragment || typeof fragment.text !== 'string' || fragment.text === '') {
          errors.push(name + '.fragments[' + f + ']: нет текста');
        } else if (fragment.id !== undefined) {
          if (!isText(fragment.id)) errors.push(name + '.fragments[' + f + ']: id должен быть строкой');
          else if (ids[fragment.id]) errors.push('повторяющийся id фрагмента ' + fragment.id);
          else ids[fragment.id] = true;
        }
      });
    });
    if (!task.legal.some(function (block) { return block && block.role === 'main'; })) {
      errors.push('нужен основной блок legal (role: main)');
    }
    return errors;
  }

  function validateWrong(name, options, key, wrong, required) {
    var errors = [];
    if (wrong !== undefined && (!wrong || typeof wrong !== 'object' || Array.isArray(wrong))) {
      return [name + ': wrong должно быть объектом'];
    }
    options.forEach(function (option, i) {
      if (key.indexOf(i) !== -1) {
        if (own(wrong, i)) errors.push(name + ': у правильного варианта ' + i + ' не должно быть объяснения ошибки');
        return;
      }
      if (required && !isText(wrong && wrong[i])) {
        errors.push(name + ': нет объяснения ошибки для варианта «' + option + '»');
      }
    });
    return errors;
  }

  function validateRow(row, fragments) {
    var errors = [];
    var name = 'строка ' + (row && row.id);
    if (!row || !isText(row.id)) return ['строка без id'];
    if (!isText(row.label)) errors.push(name + ': нет label');
    if (!Array.isArray(row.options) || row.options.length < 2 || !row.options.every(isText)) {
      return errors.concat(name + ': нужно не меньше двух вариантов с текстом');
    }
    var n = row.options.length;
    if (!uniqueIndices(row.key, n)) return errors.concat(name + ': key — непустой список номеров вариантов без повторов');
    if (row.partial !== undefined) {
      if (!uniqueIndices(row.partial, n)) errors.push(name + ': partial — список номеров вариантов без повторов');
      else if (row.partial.some(function (i) { return row.key.indexOf(i) !== -1; })) {
        errors.push(name + ': вариант не может быть одновременно в key и partial');
      }
    }
    if (row.component !== undefined && CHOICE_COMPONENTS.indexOf(row.component) === -1) {
      errors.push(name + ': component должно быть K или R');
    }
    if (!isText(row.explanation)) errors.push(name + ': нет explanation');
    errors = errors.concat(validateWrong(name, row.options, row.key, row.wrong, true));

    if (row.followUp !== undefined) {
      var fu = row.followUp;
      var fname = name + ', уточнение';
      if (!fu || typeof fu !== 'object') {
        errors.push(fname + ': должно быть объектом');
      } else {
        if (row.key.indexOf(fu.when) === -1) errors.push(fname + ': when должно быть одним из правильных вариантов');
        if (!isText(fu.label)) errors.push(fname + ': нет label');
        if (!Array.isArray(fu.options) || fu.options.length < 2 || !fu.options.every(isText)) {
          errors.push(fname + ': нужно не меньше двух вариантов');
        } else if (!uniqueIndices(fu.key, fu.options.length)) {
          errors.push(fname + ': key — непустой список номеров без повторов');
        } else {
          errors = errors.concat(validateWrong(fname, fu.options, fu.key, fu.wrong, false));
        }
      }
    }

    if (row.evidence !== undefined) {
      var ev = row.evidence;
      var ename = name + ', доказательство';
      if (!ev || typeof ev !== 'object') {
        errors.push(ename + ': должно быть объектом');
      } else {
        if (!Array.isArray(ev.key) || ev.key.length === 0) errors.push(ename + ': нужен непустой key');
        else {
          ev.key.forEach(function (id) {
            if (!fragments[id]) errors.push(ename + ': неизвестный фрагмент ' + id);
          });
        }
        if (ev.max !== undefined && !(Number.isInteger(ev.max) && ev.max >= 1 && ev.max <= 5)) {
          errors.push(ename + ': max — целое от 1 до 5');
        }
        if (!isText(ev.explanation)) errors.push(ename + ': нет explanation');
        if (ev.wrong !== undefined) {
          Object.keys(ev.wrong).forEach(function (id) {
            if (!fragments[id]) errors.push(ename + ': объяснение для неизвестного фрагмента ' + id);
          });
        }
      }
    }
    return errors;
  }

  function validateTask(task) {
    var errors = validateLegal(task);
    var fragments = fragmentIndex(task);
    if (!Array.isArray(task.sections) || task.sections.length === 0) return errors.concat('нужен хотя бы один раздел sections');
    var rowIds = Object.create(null);
    task.sections.forEach(function (section, s) {
      if (!section || !isText(section.id)) errors.push('sections[' + s + ']: нет id');
      if (!section || !isText(section.title)) errors.push('sections[' + s + ']: нет title');
      if (!section || !Array.isArray(section.rows) || section.rows.length === 0) {
        errors.push('sections[' + s + ']: нет строк');
        return;
      }
      section.rows.forEach(function (row) {
        if (row && isText(row.id)) {
          if (rowIds[row.id]) errors.push('повторяющийся id строки ' + row.id);
          rowIds[row.id] = true;
        }
        errors = errors.concat(validateRow(row, fragments));
      });
    });
    if (errors.length === 0 && task.scoring) {
      var max = maxPoints(task);
      if (task.scoring.rule !== 'components') errors.push('scoring.rule для analysis-grid — components');
      if (task.scoring.maxPoints !== max) errors.push('scoring.maxPoints должно равняться сумме баллов строк: ' + max);
    }
    return errors;
  }

  /* ---------- Ответ ---------- */

  function emptyRow() {
    return { c: null, f: [], e: [] };
  }

  function emptyResponse(task) {
    var response = {};
    rowsOf(task).forEach(function (row) { response[row.id] = emptyRow(); });
    return response;
  }

  function rowAnswer(response, row) {
    return response && own(response, row.id) && response[row.id] ? response[row.id] : emptyRow();
  }

  function isEmpty(task, response) {
    if (!response || typeof response !== 'object') return true;
    return rowsOf(task).every(function (row) {
      var a = rowAnswer(response, row);
      return (a.c === null || a.c === undefined) && (!a.e || a.e.length === 0);
    });
  }

  function needsFollowUp(row, answer) {
    return !!row.followUp && answer.c === row.followUp.when;
  }

  function isComplete(task, response) {
    if (!response || typeof response !== 'object') return false;
    return rowsOf(task).every(function (row) {
      var a = rowAnswer(response, row);
      if (a.c === null || a.c === undefined) return false;
      if (needsFollowUp(row, a) && (!a.f || a.f.length === 0)) return false;
      if (row.evidence && (!a.e || a.e.length === 0)) return false;
      return true;
    });
  }

  /** Канонический ответ: все строки, проверенные номера и фрагменты. Бросает ошибку при неверной структуре. */
  function cleanResponse(task, response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      throw new Error('Ответ должен быть объектом со строками карты');
    }
    var rows = rowsOf(task);
    var known = Object.create(null);
    rows.forEach(function (row) { known[row.id] = row; });
    Object.keys(response).forEach(function (id) {
      if (!known[id]) throw new Error('Неизвестная строка карты: ' + id);
    });
    var fragments = fragmentIndex(task);
    var cleaned = {};
    rows.forEach(function (row) {
      var a = own(response, row.id) ? response[row.id] : emptyRow();
      if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Строка ' + row.id + ': ответ должен быть объектом');
      var c = a.c === undefined ? null : a.c;
      if (c !== null && !isIndex(c, row.options.length)) throw new Error('Строка ' + row.id + ': некорректный вариант ' + c);
      var f = a.f === undefined ? [] : a.f;
      if (!Array.isArray(f)) throw new Error('Строка ' + row.id + ': уточнение должно быть списком');
      if (f.length && !row.followUp) throw new Error('Строка ' + row.id + ': уточнения нет');
      f.forEach(function (j) {
        if (!isIndex(j, row.followUp.options.length)) throw new Error('Строка ' + row.id + ': некорректное уточнение ' + j);
      });
      var e = a.e === undefined ? [] : a.e;
      if (!Array.isArray(e)) throw new Error('Строка ' + row.id + ': доказательство должно быть списком');
      if (e.length && !row.evidence) throw new Error('Строка ' + row.id + ': доказательство не предусмотрено');
      e.forEach(function (id) {
        if (!fragments[id]) throw new Error('Строка ' + row.id + ': неизвестный фрагмент ' + id);
      });
      var max = row.evidence ? (row.evidence.max || DEFAULT_EVIDENCE_MAX) : 0;
      if (new Set(e).size > max) throw new Error('Строка ' + row.id + ': можно отметить не больше ' + max + ' фрагментов');
      cleaned[row.id] = {
        c: c,
        // Уточнение имеет смысл только при выборе, к которому оно относится.
        f: needsFollowUp(row, { c: c }) ? Array.from(new Set(f)).sort(function (x, y) { return x - y; }) : [],
        e: Array.from(new Set(e))
      };
    });
    return cleaned;
  }

  /* ---------- Проверка ---------- */

  function sameSet(a, b) {
    return a.length === b.length && a.every(function (x) { return b.indexOf(x) !== -1; });
  }

  /** Оценка выбора в строке: { status, points, follow }. */
  function scoreChoice(row, answer) {
    if (answer.c === null || answer.c === undefined) return { status: 'empty', points: 0, follow: null };
    if (row.key.indexOf(answer.c) !== -1) {
      if (!needsFollowUp(row, answer)) return { status: 'ok', points: 1, follow: null };
      var key = row.followUp.key;
      var chosen = answer.f || [];
      var extra = chosen.filter(function (j) { return key.indexOf(j) === -1; });
      if (sameSet(chosen, key)) return { status: 'ok', points: 1, follow: 'ok' };
      if (chosen.length > 0 && extra.length === 0) return { status: 'partial', points: 0.5, follow: 'partial' };
      return { status: 'wrong', points: 0, follow: chosen.length ? 'wrong' : 'empty' };
    }
    if (row.partial && row.partial.indexOf(answer.c) !== -1) return { status: 'partial', points: 0.5, follow: null };
    return { status: 'wrong', points: 0, follow: null };
  }

  /** Оценка доказательства: { status, points, hits, extra }. */
  function scoreEvidence(row, answer) {
    var chosen = answer.e || [];
    if (chosen.length === 0) return { status: 'empty', points: 0, hits: [], extra: [] };
    var key = row.evidence.key;
    var hits = chosen.filter(function (id) { return key.indexOf(id) !== -1; });
    var extra = chosen.filter(function (id) { return key.indexOf(id) === -1; });
    var ok = hits.length > 0 && extra.length <= 1;
    return { status: ok ? 'ok' : 'wrong', points: ok ? 1 : 0, hits: hits, extra: extra };
  }

  function check(task, response) {
    var components = {};
    var max = maxByComponent(task);
    COMPONENTS.forEach(function (c) { components[c] = { earned: 0, max: max[c] }; });
    var rows = {};
    rowsOf(task).forEach(function (row) {
      var answer = rowAnswer(response, row);
      var choice = scoreChoice(row, answer);
      components[choiceComponent(row)].earned += choice.points;
      var detail = { choice: choice.status, choicePoints: choice.points, follow: choice.follow, evidence: null, evidencePoints: 0 };
      if (row.evidence) {
        var evidence = scoreEvidence(row, answer);
        components.T.earned += evidence.points;
        detail.evidence = evidence.status;
        detail.evidencePoints = evidence.points;
        detail.evidenceHits = evidence.hits;
        detail.evidenceExtra = evidence.extra;
      }
      rows[row.id] = detail;
    });
    var earned = components.K.earned + components.T.earned + components.R.earned;
    var total = max.K + max.T + max.R;
    var verdict = earned >= total ? 'correct' : (earned > 0 ? 'partial' : 'incorrect');
    return { verdict: verdict, details: { rows: rows, components: components, earned: earned, max: total } };
  }

  function getCorrect(task) {
    var correct = {};
    rowsOf(task).forEach(function (row) {
      correct[row.id] = {
        c: row.key[0],
        f: row.followUp && row.key[0] === row.followUp.when ? row.followUp.key.slice() : [],
        // Эталон доказательства — первые ключевые фрагменты в пределах лимита отметки.
        e: row.evidence ? row.evidence.key.slice(0, row.evidence.max || DEFAULT_EVIDENCE_MAX) : []
      };
    });
    return correct;
  }

  function formatResponse(task, response) {
    var rows = rowsOf(task);
    if (!response || typeof response !== 'object') return '—';
    var filled = rows.filter(function (row) {
      var a = rowAnswer(response, row);
      return a.c !== null && a.c !== undefined;
    }).length;
    return 'заполнено строк: ' + filled + ' из ' + rows.length;
  }

  types.register('analysis-grid', {
    validateTask: validateTask,
    emptyResponse: emptyResponse,
    isEmpty: isEmpty,
    isComplete: isComplete,
    cleanResponse: cleanResponse,
    check: check,
    getCorrect: getCorrect,
    formatResponse: formatResponse
  });

  /** Помощники для отрисовки и тестов. */
  OLY.analysisGrid = {
    rowsOf: rowsOf,
    fragmentIndex: fragmentIndex,
    maxByComponent: maxByComponent,
    maxPoints: maxPoints,
    scoreChoice: scoreChoice,
    scoreEvidence: scoreEvidence,
    needsFollowUp: needsFollowUp,
    DEFAULT_EVIDENCE_MAX: DEFAULT_EVIDENCE_MAX
  };
})(typeof window !== 'undefined' ? window : globalThis);
