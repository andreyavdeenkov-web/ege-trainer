/**
 * Олимпиады: тип задания compound — составное задание по юридической ситуации.
 * Чистые функции без DOM. Подключается после nrm-rows.js, short-answer.js и argument-check.js.
 *
 * Одна ситуация — несколько взаимосвязанных частей разных видов:
 *   • choice — строки выбора (как в классификационной карте; доказательство — фрагмент
 *     из текстов, видимых к моменту открытия части);
 *   • short — краткие ответы (статья, число, термин);
 *   • arguments — оценка доводов (правильность и связь с выводом).
 *
 * Поэтапное раскрытие. Части открываются по очереди: следующая часть (её условие,
 * дополнительные тексты норм и вопросы) становится видна только после того, как ученик
 * зафиксировал ответ на предыдущую. Зафиксированную часть изменить нельзя. Поэтому
 * формулировки поздних частей не могут подсказать ответы на ранние — это гарантирует
 * сам механизм, а не только подбор формулировок. Проверка и баллы — после последней части.
 *
 * Данные задания:
 * {
 *   type: 'compound',
 *   situation: ['абзац', …],
 *   legal?: [...],                         // тексты, видимые с начала
 *   parts: [
 *     { id: 'A', title: 'Часть А. …', intro?: '…', legal?: [...],   // legal части видны с её открытия
 *       kind: 'choice', rows: [...] },
 *     { id: 'B', title, kind: 'short', items: [...] },
 *     { id: 'C', title, kind: 'arguments', issue: '…', conclusion: '…', arguments: [...] }
 *   ]
 * }
 *
 * Ответ: { stage: номер открытой части (0…), parts: { A: {…}, B: {…}, C: {…} } };
 * ответы на ещё не открытые части должны быть пустыми.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var R = OLY.nrmRows;
  var S = OLY.shortAnswer;
  var A = OLY.argumentCheck;

  var KINDS = ['choice', 'short', 'arguments'];

  function allLegal(task) {
    var list = (task.legal || []).slice();
    task.parts.forEach(function (p) { (p.legal || []).forEach(function (b) { list.push(b); }); });
    return list;
  }

  /** Тексты, видимые на этапе stage: общие и тексты открытых частей. */
  function visibleLegal(task, stage) {
    var list = (task.legal || []).slice();
    task.parts.forEach(function (p, i) { if (i <= stage) (p.legal || []).forEach(function (b) { list.push(b); }); });
    return list;
  }

  /* ---------- Части ---------- */

  var PART = {
    choice: {
      // fragments — только фрагменты, видимые к моменту открытия этой части: доказательство
      // нельзя искать в текстах, которые появятся позже.
      validate: function (part, fragments, ids) {
        var errors = [];
        if (!Array.isArray(part.rows) || !part.rows.length) return ['часть ' + part.id + ': нет rows'];
        part.rows.forEach(function (row) {
          if (row && ids[row.id]) errors.push('повторяющийся id ' + row.id);
          if (row) ids[row.id] = true;
          errors = errors.concat(R.validateRow(row, fragments, { allowEvidence: true }));
        });
        return errors;
      },
      max: function (part) {
        var m = { K: 0, T: 0, R: 0 };
        part.rows.forEach(function (row) { R.addMax(m, R.rowMax(row)); });
        return m;
      },
      empty: function (part) {
        var r = {};
        part.rows.forEach(function (row) { r[row.id] = R.emptyRow(); });
        return r;
      },
      isEmpty: function (part, a) { return part.rows.every(function (row) { return R.rowIsEmpty(R.rowAnswer(a, row)); }); },
      isComplete: function (part, a) { return part.rows.every(function (row) { return R.rowIsComplete(row, R.rowAnswer(a, row)); }); },
      clean: function (part, a, fragments) { return R.cleanRows(part.rows, a, fragments); },
      score: function (part, a, components) {
        var rows = {};
        part.rows.forEach(function (row) { rows[row.id] = R.scoreRow(row, R.rowAnswer(a, row), components); });
        return { rows: rows };
      },
      correct: function (part) {
        var r = {};
        part.rows.forEach(function (row) { r[row.id] = R.correctRow(row); });
        return r;
      }
    },
    short: {
      validate: function (part, fragments, ids) {
        var errors = S.validateItems(part.items).map(function (e) { return 'часть ' + part.id + ': ' + e; });
        (part.items || []).forEach(function (item) {
          if (item && ids[item.id]) errors.push('повторяющийся id ' + item.id);
          if (item) ids[item.id] = true;
        });
        return errors;
      },
      max: function (part) {
        var m = { K: 0, T: 0, R: 0 };
        part.items.forEach(function (item) { m[S.componentOf(item)] += 1; });
        return m;
      },
      empty: function (part) {
        var r = {};
        part.items.forEach(function (item) { r[item.id] = ''; });
        return r;
      },
      isEmpty: function (part, a) { return part.items.every(function (item) { return !String((a || {})[item.id] || '').trim(); }); },
      isComplete: function (part, a) { return part.items.every(function (item) { return !!String((a || {})[item.id] || '').trim(); }); },
      clean: function (part, a) {
        a = a === undefined ? {} : a;
        if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Часть ' + part.id + ': ответ должен быть объектом');
        var ids = part.items.map(function (item) { return item.id; });
        Object.keys(a).forEach(function (k) {
          if (ids.indexOf(k) === -1) throw new Error('Часть ' + part.id + ': неизвестное поле ' + k);
          if (typeof a[k] !== 'string' || a[k].length > 120) throw new Error('Часть ' + part.id + ': ответ ' + k + ' — строка до 120 символов');
        });
        var r = {};
        part.items.forEach(function (item) { r[item.id] = String(a[item.id] || '').trim(); });
        return r;
      },
      score: function (part, a, components) {
        var items = {};
        part.items.forEach(function (item) {
          var d = S.scoreItem(item, (a || {})[item.id]);
          components[S.componentOf(item)].earned += d.points;
          items[item.id] = d;
        });
        return { items: items };
      },
      correct: function (part) {
        var r = {};
        part.items.forEach(function (item) { r[item.id] = S.keyText(item); });
        return r;
      }
    },
    arguments: {
      validate: function (part, fragments, ids) {
        var errors = [];
        if (!R.isText(part.issue)) errors.push('часть ' + part.id + ': нет issue');
        if (!R.isText(part.conclusion)) errors.push('часть ' + part.id + ': нет conclusion');
        errors = errors.concat(A.validateArguments(part.arguments).map(function (e) { return 'часть ' + part.id + ': ' + e; }));
        (part.arguments || []).forEach(function (arg) {
          if (arg && ids[arg.id]) errors.push('повторяющийся id ' + arg.id);
          if (arg) ids[arg.id] = true;
        });
        return errors;
      },
      max: function (part) { return { K: 0, T: 0, R: part.arguments.length * 2 }; },
      empty: function (part) {
        var r = {};
        part.arguments.forEach(function (arg) { r[arg.id] = { t: null, l: null }; });
        return r;
      },
      isEmpty: function (part, a) { return part.arguments.every(function (arg) { return A.argIsEmpty(A.answerOf(a, arg)); }); },
      isComplete: function (part, a) { return part.arguments.every(function (arg) { return A.argIsComplete(A.answerOf(a, arg)); }); },
      clean: function (part, a) { return A.cleanArguments(part.arguments, a); },
      score: function (part, a, components) { return { arguments: A.scoreArguments(part.arguments, a, components, 'R') }; },
      correct: function (part) { return A.correctArguments(part.arguments); }
    }
  };

  function handler(part) { return PART[part.kind]; }

  function partMax(part) { return handler(part).max(part); }

  function maxByComponent(task) {
    var m = { K: 0, T: 0, R: 0 };
    task.parts.forEach(function (p) { R.addMax(m, partMax(p)); });
    return m;
  }

  function maxPoints(task) {
    var m = maxByComponent(task);
    return m.K + m.T + m.R;
  }

  /* ---------- Данные ---------- */

  function validateTask(task) {
    var errors = [];
    if (!Array.isArray(task.situation) || !task.situation.length || !task.situation.every(R.isText)) errors.push('situation — непустой список абзацев');
    if (!Array.isArray(task.parts) || task.parts.length < 2) return errors.concat('parts — не меньше двух частей');
    var partIds = {};
    task.parts.forEach(function (p, i) {
      if (!p || !R.isText(p.id)) { errors.push('parts[' + i + ']: нет id'); return; }
      if (partIds[p.id]) errors.push('повторяющийся id части ' + p.id);
      partIds[p.id] = true;
      if (!R.isText(p.title)) errors.push('часть ' + p.id + ': нет title');
      if (KINDS.indexOf(p.kind) === -1) errors.push('часть ' + p.id + ': kind — choice, short или arguments');
      if (p.intro !== undefined && !R.isText(p.intro)) errors.push('часть ' + p.id + ': intro — строка');
    });
    if (errors.length) return errors;
    errors = errors.concat(R.validateContext(task));
    var legal = allLegal(task);
    if (legal.length) errors = errors.concat(R.validateLegal(legal, { required: false, requireMain: false }));
    var ids = {};
    task.parts.forEach(function (p, i) {
      errors = errors.concat(handler(p).validate(p, R.fragmentIndex(visibleLegal(task, i)), ids));
    });
    if (errors.length === 0) errors = errors.concat(R.validateScoringTotal(task, maxPoints(task)));
    return errors;
  }

  /* ---------- Ответ ---------- */

  function stageOf(task, response) {
    var s = response && response.stage;
    return Number.isInteger(s) && s >= 0 && s < task.parts.length ? s : 0;
  }

  function partAnswer(response, part) {
    return response && response.parts ? response.parts[part.id] : undefined;
  }

  function emptyResponse(task) {
    var parts = {};
    task.parts.forEach(function (p) { parts[p.id] = handler(p).empty(p); });
    return { stage: 0, parts: parts };
  }

  function partIsComplete(task, response, index) {
    var p = task.parts[index];
    return handler(p).isComplete(p, partAnswer(response, p));
  }

  function isEmpty(task, response) {
    return stageOf(task, response) === 0
      && task.parts.every(function (p) { return handler(p).isEmpty(p, partAnswer(response, p)); });
  }

  function isComplete(task, response) {
    return stageOf(task, response) === task.parts.length - 1
      && task.parts.every(function (p, i) { return partIsComplete(task, response, i); });
  }

  function cleanResponse(task, response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Ответ должен быть объектом');
    Object.keys(response).forEach(function (k) {
      if (k !== 'stage' && k !== 'parts') throw new Error('Неизвестное поле ответа: ' + k);
    });
    var stage = response.stage === undefined ? 0 : response.stage;
    if (!Number.isInteger(stage) || stage < 0 || stage >= task.parts.length) throw new Error('stage — номер открытой части');
    var given = response.parts === undefined ? {} : response.parts;
    if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Error('parts должно быть объектом');
    Object.keys(given).forEach(function (k) {
      if (!task.parts.some(function (p) { return p.id === k; })) throw new Error('Неизвестная часть: ' + k);
    });
    var fragments = R.fragmentIndex(allLegal(task));
    var parts = {};
    task.parts.forEach(function (p, i) {
      var h = handler(p);
      var clean = h.clean(p, given[p.id], fragments);
      if (i > stage && !h.isEmpty(p, clean)) throw new Error('Часть ' + p.id + ' ещё не открыта');
      if (i < stage && !h.isComplete(p, clean)) throw new Error('Часть ' + p.id + ' зафиксирована без полного ответа');
      parts[p.id] = clean;
    });
    return { stage: stage, parts: parts };
  }

  /* ---------- Проверка ---------- */

  function check(task, response) {
    var components = R.emptyComponents(maxByComponent(task));
    var parts = {};
    task.parts.forEach(function (p) {
      var before = R.total(components, 'earned');
      var d = handler(p).score(p, partAnswer(response, p), components);
      var m = partMax(p);
      d.earned = R.total(components, 'earned') - before;
      d.max = m.K + m.T + m.R;
      parts[p.id] = d;
    });
    var earned = R.total(components, 'earned');
    var max = R.total(components, 'max');
    return { verdict: R.verdictOf(earned, max), details: { parts: parts, components: components, earned: earned, max: max } };
  }

  function getCorrect(task) {
    var parts = {};
    task.parts.forEach(function (p) { parts[p.id] = handler(p).correct(p); });
    return { stage: task.parts.length - 1, parts: parts };
  }

  function formatResponse(task, response) {
    return 'открыто частей: ' + (stageOf(task, response) + 1) + ' из ' + task.parts.length;
  }

  OLY.types.register('compound', {
    validateTask: validateTask,
    emptyResponse: emptyResponse,
    isEmpty: isEmpty,
    isComplete: isComplete,
    cleanResponse: cleanResponse,
    check: check,
    getCorrect: getCorrect,
    formatResponse: formatResponse
  });

  OLY.compound = {
    stageOf: stageOf,
    partIsComplete: partIsComplete,
    visibleLegal: visibleLegal,
    allLegal: allLegal,
    partMax: partMax,
    maxByComponent: maxByComponent,
    maxPoints: maxPoints
  };
})(typeof window !== 'undefined' ? window : globalThis);
