/**
 * Олимпиады: тип задания argument-check — оценка доводов (Ф7).
 * Чистые функции без DOM. Подключается после js/olymp/types/nrm-rows.js.
 *
 * Дан юридический вопрос, вывод и доводы. Для каждого довода ученик принимает
 * два независимых решения:
 *   1) правильность — верен; неверен, потому что противоречит фактам ситуации;
 *      неверен, потому что противоречит праву или теории;
 *   2) связь с выводом — оценивается так, как если бы довод был верен:
 *      обосновывает вывод; относится к вопросу, но сам вывод не обосновывает;
 *      опровергает вывод (обосновывает противоположный); не относится к вопросу.
 *      Критерий «обосновывает» — достаточность: принятый довод вместе с фактами условия
 *      ведёт к выводу без других доводов. Довод, который лишь поддерживает вывод в ряду
 *      других, — «относится, но сам вывод не обосновывает» (определения — LINK[i].definition).
 * Так различаются три свойства довода: правильность, относимость к вопросу и
 * способность обосновать конкретный вывод. Решения не зависят друг от друга,
 * поэтому одна ошибка не снимает баллы дважды.
 *
 * Данные задания:
 * {
 *   type: 'argument-check',
 *   situation?: ['абзац', …], legal?: [...],
 *   issue: 'Юридический вопрос',
 *   conclusion: 'Вывод, который оценивается',
 *   arguments: [{
 *     id, text,
 *     key: { truth: 0 | 1 | 2, link: 0 | 1 | 2 | 3 },
 *     linkAlt?: [n],        // равноправные ответы о связи (спорная квалификация) — полный балл
 *     linkPartial?: [n],    // допустимый, но более слабый ответ о связи — ½
 *     wrong: { truth: { i: '…' }, link: { i: '…' } },   // объяснение для каждого неверного варианта
 *     interpretations?: '…',   // границы допустимых интерпретаций — показываются в разборе
 *     explanation: '…'
 *   }]
 * }
 *
 * Баллы (компонент R): по каждому доводу 1 — правильность (½ — довод верно признан
 * неверным, но по другому основанию: факты вместо права или наоборот); 1 — связь с выводом.
 * Ответ: { argId: { t: номер | null, l: номер | null } }.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var R = OLY.nrmRows;

  var TRUTH = [
    { label: 'Верен', short: 'Верен' },
    { label: 'Неверен: противоречит фактам ситуации', short: 'Неверен (факты)' },
    { label: 'Неверен: противоречит праву или теории', short: 'Неверен (право)' }
  ];
  var LINK = [
    { label: 'Обосновывает вывод', short: 'Обосновывает',
      definition: 'довод достаточен сам по себе: если принять его, то вместе с фактами условия и общими определениями теории права вывод следует без других доводов и без дополнительного анализа ситуации' },
    { label: 'Относится к вопросу, но сам вывод не обосновывает', short: 'Относится, недостаточен',
      definition: 'довод касается вопроса и может быть одним из аргументов в пользу вывода (или против него), но вывод следует из него только вместе с другими доводами — или не следует вовсе' },
    { label: 'Опровергает вывод (обосновывает противоположный)', short: 'Опровергает',
      definition: 'если принять довод, то вместе с фактами условия и общими определениями теории права следует противоположный вывод' },
    { label: 'Не относится к вопросу', short: 'Не относится',
      definition: 'от истинности довода ответ на вопрос не зависит' }
  ];

  function isIndex(v, n) { return Number.isInteger(v) && v >= 0 && v < n; }

  function validateArgument(arg, where) {
    var errors = [];
    if (!arg || !R.isText(arg.id)) return [where + ': нет id'];
    where = 'довод ' + arg.id;
    if (!R.isText(arg.text)) errors.push(where + ': нет text');
    if (!R.isText(arg.explanation)) errors.push(where + ': нет explanation');
    var k = arg.key;
    if (!k || !isIndex(k.truth, TRUTH.length)) errors.push(where + ': key.truth — 0, 1 или 2');
    if (!k || !isIndex(k.link, LINK.length)) errors.push(where + ': key.link — от 0 до 3');
    if (errors.length) return errors;
    var alt = arg.linkAlt || [];
    var part = arg.linkPartial || [];
    [['linkAlt', arg.linkAlt], ['linkPartial', arg.linkPartial]].forEach(function (pair) {
      if (pair[1] === undefined) return;
      if (!Array.isArray(pair[1]) || !pair[1].every(function (i) { return isIndex(i, LINK.length) && i !== k.link; })) {
        errors.push(where + ': ' + pair[0] + ' — номера вариантов связи, кроме ключа');
      }
    });
    if (alt.some(function (i) { return part.indexOf(i) !== -1; })) errors.push(where + ': вариант не может быть одновременно в linkAlt и linkPartial');
    if (alt.length && !R.isText(arg.interpretations)) errors.push(where + ': для равноправных ответов нужно описать границы интерпретаций (interpretations)');
    var w = arg.wrong || {};
    TRUTH.forEach(function (t, i) {
      if (i !== k.truth && !R.isExplanation(w.truth && w.truth[i])) errors.push(where + ': нет объяснения ошибки для правильности «' + t.label + '»');
    });
    LINK.forEach(function (l, i) {
      if (i !== k.link && alt.indexOf(i) === -1 && !R.isExplanation(w.link && w.link[i])) {
        errors.push(where + ': нет объяснения ошибки для связи «' + l.label + '»');
      }
    });
    if (arg.interpretations !== undefined && !R.isText(arg.interpretations)) errors.push(where + ': interpretations — строка');
    return errors;
  }

  function validateArguments(list) {
    if (!Array.isArray(list) || list.length < 3) return ['arguments — не меньше трёх доводов'];
    var errors = [];
    var ids = {};
    list.forEach(function (arg, i) {
      if (arg && ids[arg.id]) errors.push('повторяющийся id довода ' + arg.id);
      if (arg) ids[arg.id] = true;
      errors = errors.concat(validateArgument(arg, 'arguments[' + i + ']'));
    });
    return errors;
  }

  function emptyAnswer() { return { t: null, l: null }; }

  function answerOf(response, arg) {
    var a = response && response[arg.id];
    return a && typeof a === 'object' ? { t: a.t === undefined ? null : a.t, l: a.l === undefined ? null : a.l } : emptyAnswer();
  }

  function argIsComplete(a) { return a.t !== null && a.l !== null; }
  function argIsEmpty(a) { return a.t === null && a.l === null; }

  function cleanArguments(list, response) {
    if (response === undefined) response = {};
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Ответ должен быть объектом');
    var ids = list.map(function (a) { return a.id; });
    Object.keys(response).forEach(function (k) {
      if (ids.indexOf(k) === -1) throw new Error('Неизвестный довод: ' + k);
    });
    var clean = {};
    list.forEach(function (arg) {
      var a = response[arg.id] === undefined ? emptyAnswer() : response[arg.id];
      if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Довод ' + arg.id + ': ответ должен быть объектом');
      Object.keys(a).forEach(function (k) { if (k !== 't' && k !== 'l') throw new Error('Довод ' + arg.id + ': неизвестное поле ' + k); });
      var t = a.t === undefined ? null : a.t;
      var l = a.l === undefined ? null : a.l;
      if (t !== null && !isIndex(t, TRUTH.length)) throw new Error('Довод ' + arg.id + ': неверный вариант правильности');
      if (l !== null && !isIndex(l, LINK.length)) throw new Error('Довод ' + arg.id + ': неверный вариант связи');
      clean[arg.id] = { t: t, l: l };
    });
    return clean;
  }

  /** Оценка довода: { truth: ok|partial|wrong|empty, truthPoints, link: …, linkPoints, points }. */
  function scoreArgument(arg, a) {
    var d = { truth: 'empty', truthPoints: 0, link: 'empty', linkPoints: 0 };
    if (a.t !== null) {
      if (a.t === arg.key.truth) { d.truth = 'ok'; d.truthPoints = 1; }
      else if (a.t > 0 && arg.key.truth > 0) { d.truth = 'partial'; d.truthPoints = 0.5; }
      else d.truth = 'wrong';
    }
    if (a.l !== null) {
      if (a.l === arg.key.link || (arg.linkAlt || []).indexOf(a.l) !== -1) { d.link = 'ok'; d.linkPoints = 1; }
      else if ((arg.linkPartial || []).indexOf(a.l) !== -1) { d.link = 'partial'; d.linkPoints = 0.5; }
      else d.link = 'wrong';
    }
    d.points = d.truthPoints + d.linkPoints;
    return d;
  }

  function scoreArguments(list, response, components, component) {
    var details = {};
    list.forEach(function (arg) {
      var d = scoreArgument(arg, answerOf(response, arg));
      components[component || 'R'].earned += d.points;
      details[arg.id] = d;
    });
    return details;
  }

  function correctArguments(list) {
    var r = {};
    list.forEach(function (arg) { r[arg.id] = { t: arg.key.truth, l: arg.key.link }; });
    return r;
  }

  /* ---------- Тип задания ---------- */

  function maxByComponent(task) {
    return { K: 0, T: 0, R: task.arguments.length * 2 };
  }

  function maxPoints(task) { return task.arguments.length * 2; }

  function validateTask(task) {
    var errors = task.legal === undefined ? [] : R.validateLegal(task.legal, { required: false, requireMain: false });
    if (!R.isText(task.issue)) errors.push('нет issue — юридического вопроса');
    if (!R.isText(task.conclusion)) errors.push('нет conclusion — оцениваемого вывода');
    if (task.situation !== undefined && (!Array.isArray(task.situation) || !task.situation.every(R.isText))) errors.push('situation — список абзацев');
    errors = errors.concat(validateArguments(task.arguments));
    if (errors.length === 0) errors = errors.concat(R.validateScoringTotal(task, maxPoints(task)));
    return errors;
  }

  function check(task, response) {
    var components = R.emptyComponents(maxByComponent(task));
    var args = scoreArguments(task.arguments, response, components, 'R');
    var earned = R.total(components, 'earned');
    var max = R.total(components, 'max');
    return { verdict: R.verdictOf(earned, max), details: { arguments: args, components: components, earned: earned, max: max } };
  }

  OLY.types.register('argument-check', {
    validateTask: validateTask,
    emptyResponse: function (task) {
      var r = {};
      task.arguments.forEach(function (arg) { r[arg.id] = emptyAnswer(); });
      return r;
    },
    isEmpty: function (task, response) {
      return task.arguments.every(function (arg) { return argIsEmpty(answerOf(response, arg)); });
    },
    isComplete: function (task, response) {
      return task.arguments.every(function (arg) { return argIsComplete(answerOf(response, arg)); });
    },
    cleanResponse: function (task, response) { return cleanArguments(task.arguments, response); },
    check: check,
    getCorrect: function (task) { return correctArguments(task.arguments); },
    formatResponse: function (task, response) {
      var n = task.arguments.filter(function (arg) { return argIsComplete(answerOf(response, arg)); }).length;
      return 'оценено доводов: ' + n + ' из ' + task.arguments.length;
    }
  });

  OLY.argumentCheck = {
    TRUTH: TRUTH,
    LINK: LINK,
    validateArguments: validateArguments,
    answerOf: answerOf,
    argIsComplete: argIsComplete,
    argIsEmpty: argIsEmpty,
    cleanArguments: cleanArguments,
    scoreArgument: scoreArgument,
    scoreArguments: scoreArguments,
    correctArguments: correctArguments,
    maxPoints: maxPoints
  };
})(typeof window !== 'undefined' ? window : globalThis);
