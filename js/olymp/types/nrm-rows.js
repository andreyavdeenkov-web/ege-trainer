/**
 * Олимпиадный практикум «Норма права»: общее ядро новых типов заданий.
 * Чистые функции без DOM. Подключается после js/olymp/types.js и до самих типов.
 *
 * Здесь — то, что одинаково устроено в классификационной карте (analysis-grid),
 * разметке нормы (text-markup) и поиске ошибок в рассуждении (reasoning-check):
 *   • блоки нормативного текста legal и их фрагменты;
 *   • строки выбора (rows): значение, уточнение «спорно → между чем»,
 *     текстовое доказательство, частичные баллы, объяснение каждой ошибки;
 *   • сводка баллов по компонентам K / T / R и вердикт.
 *
 * Строка с множественным выбором (row.multi = { max: 2, contra: [номера] }): ученик выбирает
 * от 1 до max вариантов (ответ — answer.m); строка засчитывается, только если КАЖДЫЙ выбранный
 * вариант входит в key (один решающий признак или два решающих вместе). Любой лишний вариант —
 * ошибка, поэтому добавление вариантов наугад не помогает. contra — варианты, прямо
 * противоречащие случаю: в разборе они объясняются как противоречие, остальные — как «не решающий».
 * Используется, например, для «решающего признака» разграничения социальных норм.
 *
 * Объяснение ошибки (row.wrong[i]) — строка (краткая причина) или объект
 * { short: 'краткая причина', full: 'подробное юридическое объяснение' }.
 * Краткая причина видна сразу в разборе, подробное объяснение раскрывается отдельно.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});

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

  /* ---------- Нормативный текст ---------- */

  /** Все фрагменты, которые можно отметить: { id: { fragment, block } }. */
  function fragmentIndex(legal) {
    var index = Object.create(null);
    (legal || []).forEach(function (block) {
      (block.fragments || []).forEach(function (fragment) {
        if (fragment && fragment.id) index[fragment.id] = { fragment: fragment, block: block };
      });
    });
    return index;
  }

  /**
   * Проверка блоков legal. options.required — нужен ли хотя бы один блок;
   * options.requireMain — нужен ли основной блок (role: 'main').
   */
  function validateLegal(legal, options) {
    var opts = options || {};
    var errors = [];
    if (legal === undefined && !opts.required) return errors;
    if (!Array.isArray(legal) || legal.length === 0) return ['нужен хотя бы один блок legal'];
    var ids = Object.create(null);
    var blockIds = Object.create(null);
    legal.forEach(function (block, b) {
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
    if (opts.requireMain && !legal.some(function (block) { return block && block.role === 'main'; })) {
      errors.push('нужен основной блок legal (role: main)');
    }
    return errors;
  }

  /* ---------- Объяснения ошибок ---------- */

  function isExplanation(value) {
    if (isText(value)) return true;
    return !!value && typeof value === 'object' && isText(value.short) &&
      (value.full === undefined || isText(value.full));
  }

  /** { short, full } для объяснения в любом из двух форматов (или null). */
  function explanation(value) {
    if (isText(value)) return { short: value, full: null };
    if (value && typeof value === 'object' && isText(value.short)) return { short: value.short, full: value.full || null };
    return null;
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
      if (own(wrong, i) && !isExplanation(wrong[i])) {
        errors.push(name + ': объяснение для варианта «' + option + '» — строка или { short, full }');
      } else if (required && !own(wrong, i)) {
        errors.push(name + ': нет объяснения ошибки для варианта «' + option + '»');
      }
    });
    return errors;
  }

  /* ---------- Ситуация, определения, раскладка ---------- */

  /**
   * Необязательные поля условия: situation — абзацы общей ситуации; definitions — определения,
   * в рамках которых отвечает ученик ([{ term, text }]); layout — 'split' (ситуация и тексты норм
   * в закреплённой колонке); row.context — эпизод строки (строка или список абзацев).
   */
  function validateContext(task) {
    var errors = [];
    if (task.situation !== undefined && (!Array.isArray(task.situation) || !task.situation.length || !task.situation.every(isText))) {
      errors.push('situation — непустой список абзацев');
    }
    if (task.definitions !== undefined) {
      if (!Array.isArray(task.definitions) || !task.definitions.length ||
        !task.definitions.every(function (d) { return d && isText(d.term) && isText(d.text); })) {
        errors.push('definitions — список { term, text }');
      }
    }
    if (task.layout !== undefined && task.layout !== 'split') errors.push("layout — только 'split'");
    return errors;
  }

  function validateRowContext(row) {
    if (row.context === undefined) return [];
    var ok = isText(row.context) || (Array.isArray(row.context) && row.context.length && row.context.every(isText));
    return ok ? [] : ['строка ' + row.id + ': context — строка или список абзацев'];
  }

  /* ---------- Строки выбора ---------- */

  /** Все строки по порядку разделов. */
  function rowsOf(sections) {
    var rows = [];
    (sections || []).forEach(function (section) {
      (section.rows || []).forEach(function (row) { rows.push(row); });
    });
    return rows;
  }

  function choiceComponent(row) {
    return row.component || 'K';
  }

  /** Максимум баллов строки по компонентам. */
  function rowMax(row) {
    var max = { K: 0, T: 0, R: 0 };
    max[choiceComponent(row)] += 1;
    if (row.evidence) max.T += 1;
    return max;
  }

  /**
   * Проверка строки. fragments — индекс фрагментов (для доказательства);
   * options.allowEvidence — разрешено ли доказательство в этом типе.
   */
  function validateRow(row, fragments, options) {
    var opts = options || {};
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
    errors = errors.concat(validateRowContext(row));
    errors = errors.concat(validateWrong(name, row.options, row.key, row.wrong, true));

    if (row.multi !== undefined) {
      var mu = row.multi;
      if (!mu || typeof mu !== 'object') errors.push(name + ': multi должно быть объектом');
      else {
        if (!Number.isInteger(mu.max) || mu.max < 1 || mu.max >= n) errors.push(name + ': multi.max — от 1 до числа вариантов минус один');
        if (mu.contra !== undefined) {
          if (!Array.isArray(mu.contra) || !mu.contra.every(function (i) { return isIndex(i, n) && row.key.indexOf(i) === -1; })) {
            errors.push(name + ': multi.contra — номера вариантов вне key');
          }
        }
        if (row.partial !== undefined || row.followUp !== undefined) errors.push(name + ': при multi не бывает partial и followUp');
      }
    }

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
      if (!opts.allowEvidence) {
        errors.push(ename + ': в этом типе задания доказательство в строках не предусмотрено');
      } else if (!ev || typeof ev !== 'object') {
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
            else if (!isExplanation(ev.wrong[id])) errors.push(ename + ': объяснение для ' + id + ' — строка или { short, full }');
          });
        }
      }
    }
    return errors;
  }

  /** Проверка разделов со строками; rowIds — общий словарь id строк задания. */
  function validateSections(sections, fragments, options, rowIds) {
    var errors = [];
    if (!Array.isArray(sections) || sections.length === 0) return ['нужен хотя бы один раздел sections'];
    var ids = rowIds || Object.create(null);
    sections.forEach(function (section, s) {
      if (!section || !isText(section.id)) errors.push('sections[' + s + ']: нет id');
      if (!section || !isText(section.title)) errors.push('sections[' + s + ']: нет title');
      if (!section || !Array.isArray(section.rows) || section.rows.length === 0) {
        errors.push('sections[' + s + ']: нет строк');
        return;
      }
      section.rows.forEach(function (row) {
        if (row && isText(row.id)) {
          if (ids[row.id]) errors.push('повторяющийся id строки ' + row.id);
          ids[row.id] = true;
        }
        errors = errors.concat(validateRow(row, fragments, options));
      });
    });
    return errors;
  }

  function emptyRow() {
    return { c: null, f: [], e: [] };
  }

  function needsFollowUp(row, answer) {
    return !!row.followUp && answer.c === row.followUp.when;
  }

  function rowAnswer(answers, row) {
    return answers && own(answers, row.id) && answers[row.id] ? answers[row.id] : emptyRow();
  }

  function rowIsEmpty(answer) {
    return (answer.c === null || answer.c === undefined) && (!answer.e || answer.e.length === 0) && (!answer.m || answer.m.length === 0);
  }

  function rowIsComplete(row, answer) {
    if (row.multi) return !!answer.m && answer.m.length > 0 && (!row.evidence || (answer.e && answer.e.length > 0));
    if (answer.c === null || answer.c === undefined) return false;
    if (needsFollowUp(row, answer) && (!answer.f || answer.f.length === 0)) return false;
    if (row.evidence && (!answer.e || answer.e.length === 0)) return false;
    return true;
  }

  /** Канонический ответ строки; бросает ошибку при неверной структуре. */
  function cleanRow(row, answer, fragments) {
    var a = answer === undefined ? emptyRow() : answer;
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
      if (!fragments || !fragments[id]) throw new Error('Строка ' + row.id + ': неизвестный фрагмент ' + id);
    });
    var max = row.evidence ? (row.evidence.max || DEFAULT_EVIDENCE_MAX) : 0;
    if (new Set(e).size > max) throw new Error('Строка ' + row.id + ': можно отметить не больше ' + max + ' фрагментов');
    if (row.multi) {
      if (c !== null) throw new Error('Строка ' + row.id + ': при множественном выборе ответ — список m');
      var m = a.m === undefined ? [] : a.m;
      if (!Array.isArray(m)) throw new Error('Строка ' + row.id + ': m должно быть списком');
      m.forEach(function (i) { if (!isIndex(i, row.options.length)) throw new Error('Строка ' + row.id + ': некорректный вариант ' + i); });
      var uniq = Array.from(new Set(m)).sort(function (x, y) { return x - y; });
      if (uniq.length > row.multi.max) throw new Error('Строка ' + row.id + ': можно выбрать не больше ' + row.multi.max);
      return { c: null, f: [], e: Array.from(new Set(e)), m: uniq };
    }
    if (a.m !== undefined && a.m.length) throw new Error('Строка ' + row.id + ': множественный выбор не предусмотрен');
    return {
      c: c,
      // Уточнение имеет смысл только при выборе, к которому оно относится.
      f: needsFollowUp(row, { c: c }) ? Array.from(new Set(f)).sort(function (x, y) { return x - y; }) : [],
      e: Array.from(new Set(e))
    };
  }

  /** Канонические ответы всех строк; неизвестные строки — ошибка. */
  function cleanRows(rows, answers, fragments) {
    if (answers === undefined || answers === null) answers = {};
    if (typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Ответы строк должны быть объектом');
    var known = Object.create(null);
    rows.forEach(function (row) { known[row.id] = true; });
    Object.keys(answers).forEach(function (id) {
      if (!known[id]) throw new Error('Неизвестная строка: ' + id);
    });
    var cleaned = {};
    rows.forEach(function (row) {
      cleaned[row.id] = cleanRow(row, own(answers, row.id) ? answers[row.id] : undefined, fragments);
    });
    return cleaned;
  }

  function sameSet(a, b) {
    return a.length === b.length && a.every(function (x) { return b.indexOf(x) !== -1; });
  }

  /** Оценка выбора в строке: { status, points, follow }. */
  function scoreChoice(row, answer) {
    if (row.multi) {
      var picked = answer.m || [];
      if (!picked.length) return { status: 'empty', points: 0, follow: null };
      var ok = picked.length <= row.multi.max && picked.every(function (i) { return row.key.indexOf(i) !== -1; });
      return { status: ok ? 'ok' : 'wrong', points: ok ? 1 : 0, follow: null };
    }
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

  /** Подробности по строке для разбора и начисление в components. */
  function scoreRow(row, answer, components) {
    var choice = scoreChoice(row, answer);
    var detail = { choice: choice.status, choicePoints: choice.points, follow: choice.follow, evidence: null, evidencePoints: 0 };
    if (components) components[choiceComponent(row)].earned += choice.points;
    if (row.evidence) {
      var evidence = scoreEvidence(row, answer);
      if (components) components.T.earned += evidence.points;
      detail.evidence = evidence.status;
      detail.evidencePoints = evidence.points;
      detail.evidenceHits = evidence.hits;
      detail.evidenceExtra = evidence.extra;
    }
    return detail;
  }

  function correctRow(row) {
    if (row.multi) return { c: null, f: [], e: [], m: row.key.slice(0, row.multi.max) };
    return {
      c: row.key[0],
      f: row.followUp && row.key[0] === row.followUp.when ? row.followUp.key.slice() : [],
      // Эталон доказательства — первые ключевые фрагменты в пределах лимита отметки.
      e: row.evidence ? row.evidence.key.slice(0, row.evidence.max || DEFAULT_EVIDENCE_MAX) : []
    };
  }

  /* ---------- Компоненты и вердикт ---------- */

  function emptyComponents(max) {
    var components = {};
    COMPONENTS.forEach(function (c) { components[c] = { earned: 0, max: max ? max[c] : 0 }; });
    return components;
  }

  function addMax(target, max) {
    COMPONENTS.forEach(function (c) { target[c] += max[c] || 0; });
    return target;
  }

  function total(components, field) {
    return COMPONENTS.reduce(function (sum, c) { return sum + components[c][field]; }, 0);
  }

  /** Вердикт по набранным баллам: correct — все; partial — часть; incorrect — ноль. */
  function verdictOf(earned, max) {
    return earned >= max ? 'correct' : (earned > 0 ? 'partial' : 'incorrect');
  }

  /** Проверка scoring: правило components и maxPoints = сумме максимумов. */
  function validateScoringTotal(task, max) {
    if (!task.scoring) return [];
    var errors = [];
    if (task.scoring.rule !== 'components') errors.push('scoring.rule для заданий практикума «Норма права» — components');
    if (task.scoring.maxPoints !== max) errors.push('scoring.maxPoints должно равняться сумме баллов элементов: ' + max);
    return errors;
  }

  OLY.nrmRows = {
    COMPONENTS: COMPONENTS,
    DEFAULT_EVIDENCE_MAX: DEFAULT_EVIDENCE_MAX,
    validateContext: validateContext,
    isText: isText,
    isIndex: isIndex,
    own: own,
    fragmentIndex: fragmentIndex,
    validateLegal: validateLegal,
    isExplanation: isExplanation,
    explanation: explanation,
    validateWrong: validateWrong,
    rowsOf: rowsOf,
    choiceComponent: choiceComponent,
    rowMax: rowMax,
    validateRow: validateRow,
    validateSections: validateSections,
    emptyRow: emptyRow,
    needsFollowUp: needsFollowUp,
    rowAnswer: rowAnswer,
    rowIsEmpty: rowIsEmpty,
    rowIsComplete: rowIsComplete,
    cleanRow: cleanRow,
    cleanRows: cleanRows,
    scoreChoice: scoreChoice,
    scoreEvidence: scoreEvidence,
    scoreRow: scoreRow,
    correctRow: correctRow,
    emptyComponents: emptyComponents,
    addMax: addMax,
    total: total,
    verdictOf: verdictOf,
    validateScoringTotal: validateScoringTotal
  };
})(typeof window !== 'undefined' ? window : globalThis);
