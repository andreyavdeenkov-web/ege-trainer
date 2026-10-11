/**
 * Олимпиады: тип задания reasoning-check — поиск ошибок в юридическом рассуждении.
 * Чистые функции без DOM. Подключается после js/olymp/types/nrm-rows.js.
 *
 * Ученик читает пронумерованное рассуждение, отмечает ошибочные шаги и для
 * каждого отмеченного шага указывает:
 *   • происхождение ошибки — самостоятельная / только унаследована (от шага N) /
 *     унаследована и содержит собственную ошибку (от шага N);
 *   • содержательный тип Т1–Т6 — для самостоятельной и для собственной ошибки
 *     (упорядоченное правило: первый подходящий тип сверху вниз).
 * Затем отвечает на строки выбора (конструктор формулировки и т. п.).
 *
 * Данные задания:
 * {
 *   type: 'reasoning-check',
 *   legal?: [...],                     // положение для чтения (как в analysis-grid)
 *   intro?: 'Студент рассуждает так:',
 *   markHint?: 'Отметьте шаги, неверные при любом научном подходе…',
 *   steps: [{
 *     id: 's1', text: '…',
 *     key: { error: false }
 *        | { error: true, origin: 'own' | 'inherited' | 'mixed', from?: 's2', type?: 'T5' },
 *     explanation: '…',                // разбор шага
 *     wrong?: '…' | { short, full },   // верный шаг отмечен как ошибочный — почему он верен
 *     missed?: '…' | { short, full },  // ошибочный шаг не отмечен
 *     originWrong?: { own | inherited | mixed: '…' },   // неверное происхождение
 *     fromWrong?: '…',                 // неверный номер шага с исходной ошибкой
 *     typeWrong?: { T4: '…' }          // неверный тип; для типа, предшествующего ключевому
 *                                      // по упорядоченному правилу, объяснение обязательно
 *   }],
 *   sections?: [...]                   // строки выбора (как в analysis-grid, без доказательства)
 * }
 *
 * Ответ: { steps: { s1: { flag, origin, from, type } }, rows: { rowId: { c, f, e } } }.
 *
 * Баллы (все шаги — компонент R):
 *   2 — первый ошибочный шаг отмечен;
 *   1 — отмечены все остальные ошибочные шаги (если они есть);
 *   1 — не отмечен ни один верный шаг;
 *   по каждому ошибочному шагу: 1 — происхождение (вместе с номером шага, если
 *   ошибка унаследована); 1 — содержательный тип, если он требуется (own / mixed).
 *   Строки выбора — по компоненту строки.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var types = OLY.types;
  var R = OLY.nrmRows;

  var ORIGINS = [
    { id: 'own', label: 'Самостоятельная' },
    { id: 'inherited', label: 'Только унаследована' },
    { id: 'mixed', label: 'Унаследована + собственная' }
  ];

  var ERROR_TYPES = [
    { id: 'T1', label: 'Ложное или неполное определение понятия', test: 'шаг даёт определение понятия, и оно неверно' },
    { id: 'T2', label: 'Смешение оснований классификации или свойств нормы', test: 'вывод по одному основанию сделан по признаку другого основания' },
    { id: 'T3', label: 'Перенос термина из другой отрасли или научного подхода', test: 'термин употреблён в значении, которое он имеет в другой отрасли или другом подходе' },
    { id: 'T4', label: '«Нет в тексте статьи — нет в праве»', test: 'отсутствие нормы или элемента выводится из отсутствия слов в статье' },
    { id: 'T5', label: 'Противоречие тексту нормы', test: 'шаг утверждает то, что прямо опровергается текстом' },
    { id: 'T6', label: 'Недостаточное основание', test: 'вывод сделан из признака, который сам по себе его не обосновывает' }
  ];

  var ORIGIN_IDS = ORIGINS.map(function (o) { return o.id; });
  var TYPE_IDS = ERROR_TYPES.map(function (t) { return t.id; });

  function rowsOf(task) {
    return R.rowsOf(task.sections || []);
  }

  function needsFrom(origin) { return origin === 'inherited' || origin === 'mixed'; }
  function needsType(origin) { return origin === 'own' || origin === 'mixed'; }

  function errorSteps(task) {
    return task.steps.filter(function (s) { return s.key.error; });
  }

  /** Число баллов за отметку шагов: 2 + (1, если ошибочных шагов больше одного) + 1. */
  function flagMax(task) {
    return 2 + (errorSteps(task).length > 1 ? 1 : 0) + 1;
  }

  function stepMax(step) {
    if (!step.key.error) return 0;
    return 1 + (needsType(step.key.origin) ? 1 : 0);
  }

  function maxByComponent(task) {
    var max = { K: 0, T: 0, R: flagMax(task) };
    task.steps.forEach(function (s) { max.R += stepMax(s); });
    rowsOf(task).forEach(function (row) { R.addMax(max, R.rowMax(row)); });
    return max;
  }

  function maxPoints(task) {
    var m = maxByComponent(task);
    return m.K + m.T + m.R;
  }

  /* ---------- Данные ---------- */

  function validateTask(task) {
    var errors = task.legal === undefined ? [] : R.validateLegal(task.legal, { required: false, requireMain: false });
    if (!Array.isArray(task.steps) || task.steps.length < 3) return errors.concat('steps — не меньше трёх шагов');
    var index = Object.create(null);
    var order = [];
    task.steps.forEach(function (step, i) {
      var where = 'steps[' + i + ']';
      if (!step || !R.isText(step.id)) { errors.push(where + ': нет id'); return; }
      if (index[step.id]) { errors.push('steps: повторяющийся id ' + step.id); return; }
      where = 'шаг ' + step.id;
      if (!R.isText(step.text)) errors.push(where + ': нет text');
      if (!R.isText(step.explanation)) errors.push(where + ': нет explanation');
      var key = step.key;
      if (!key || typeof key.error !== 'boolean') errors.push(where + ': key.error должно быть true или false');
      else if (!key.error) {
        if (!R.isExplanation(step.wrong)) errors.push(where + ': нет объяснения wrong — почему верный шаг не ошибочен');
        ['origin', 'from', 'type'].forEach(function (k) { if (key[k] !== undefined) errors.push(where + ': у верного шага не бывает key.' + k); });
      } else {
        if (!R.isExplanation(step.missed)) errors.push(where + ': нет объяснения missed — для неотмеченного ошибочного шага');
        if (ORIGIN_IDS.indexOf(key.origin) === -1) errors.push(where + ': key.origin — own, inherited или mixed');
        if (needsFrom(key.origin)) {
          var src = index[key.from];
          if (!src) errors.push(where + ': key.from должен указывать на предшествующий шаг');
          else if (!src.key || !src.key.error) errors.push(where + ': унаследовать можно только от ошибочного шага (' + key.from + ')');
        } else if (key.from !== undefined) errors.push(where + ': key.from задаётся только для унаследованной ошибки');
        if (needsType(key.origin)) {
          var t = TYPE_IDS.indexOf(key.type);
          if (t === -1) errors.push(where + ': key.type — один из ' + TYPE_IDS.join(', '));
          else if (t > 0 && !(step.typeWrong && R.isExplanation(step.typeWrong[TYPE_IDS[t - 1]]))) {
            errors.push(where + ': нужно объяснение typeWrong.' + TYPE_IDS[t - 1] + ' — почему не подходит предыдущий по порядку тип');
          }
        } else if (key.type !== undefined) errors.push(where + ': у только унаследованной ошибки нет содержательного типа');
      }
      if (step.typeWrong !== undefined) {
        Object.keys(step.typeWrong).forEach(function (k) {
          if (TYPE_IDS.indexOf(k) === -1) errors.push(where + ': typeWrong — неизвестный тип ' + k);
          else if (!R.isExplanation(step.typeWrong[k])) errors.push(where + ': typeWrong.' + k + ' — пустое объяснение');
        });
      }
      if (step.originWrong !== undefined) {
        Object.keys(step.originWrong).forEach(function (k) {
          if (ORIGIN_IDS.indexOf(k) === -1) errors.push(where + ': originWrong — неизвестное происхождение ' + k);
          else if (!R.isExplanation(step.originWrong[k])) errors.push(where + ': originWrong.' + k + ' — пустое объяснение');
        });
      }
      index[step.id] = step;
      order.push(step.id);
    });
    if (errors.length === 0 && errorSteps(task).length === 0) errors.push('в рассуждении нет ни одного ошибочного шага');
    if (task.sections !== undefined) {
      // id строк не должны совпадать с id шагов: по ним строятся якоря разбора.
      var taken = Object.create(null);
      order.forEach(function (id) { taken[id] = true; });
      errors = errors.concat(R.validateSections(task.sections, R.fragmentIndex(task.legal || []), { allowEvidence: false }, taken));
    }
    if (errors.length === 0) errors = errors.concat(R.validateScoringTotal(task, maxPoints(task)));
    return errors;
  }

  /* ---------- Ответ ---------- */

  function emptyStep() {
    return { flag: false, origin: null, from: null, type: null };
  }

  function emptyResponse(task) {
    var steps = {};
    task.steps.forEach(function (s) { steps[s.id] = emptyStep(); });
    var rows = {};
    rowsOf(task).forEach(function (row) { rows[row.id] = R.emptyRow(); });
    return { steps: steps, rows: rows };
  }

  function stepAnswer(response, step) {
    var a = response && response.steps && response.steps[step.id];
    return a && typeof a === 'object' ? a : emptyStep();
  }

  /** Отмеченный шаг заполнен, если указаны происхождение, номер шага (если нужен) и тип (если нужен). */
  function stepIsComplete(a) {
    if (!a.flag) return true;
    if (ORIGIN_IDS.indexOf(a.origin) === -1) return false;
    if (needsFrom(a.origin) && !a.from) return false;
    if (needsType(a.origin) && !a.type) return false;
    return true;
  }

  function anyFlag(task, response) {
    return task.steps.some(function (s) { return stepAnswer(response, s).flag; });
  }

  function isEmpty(task, response) {
    if (!response || typeof response !== 'object') return true;
    if (anyFlag(task, response)) return false;
    return rowsOf(task).every(function (row) { return R.rowIsEmpty(R.rowAnswer(response.rows, row)); });
  }

  function isComplete(task, response) {
    if (!response || typeof response !== 'object') return false;
    return anyFlag(task, response)
      && task.steps.every(function (s) { return stepIsComplete(stepAnswer(response, s)); })
      && rowsOf(task).every(function (row) { return R.rowIsComplete(row, R.rowAnswer(response.rows, row)); });
  }

  function cleanResponse(task, response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Ответ должен быть объектом');
    Object.keys(response).forEach(function (k) {
      if (k !== 'steps' && k !== 'rows') throw new Error('Неизвестное поле ответа: ' + k);
    });
    var given = response.steps === undefined ? {} : response.steps;
    if (!given || typeof given !== 'object' || Array.isArray(given)) throw new Error('steps должно быть объектом');
    var position = {};
    task.steps.forEach(function (s, i) { position[s.id] = i; });
    Object.keys(given).forEach(function (id) {
      if (!R.own(position, id)) throw new Error('Неизвестный шаг: ' + id);
    });
    var steps = {};
    task.steps.forEach(function (s, i) {
      var a = R.own(given, s.id) ? given[s.id] : emptyStep();
      if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Шаг ' + s.id + ': ответ должен быть объектом');
      var flag = a.flag === true;
      if (a.flag !== undefined && typeof a.flag !== 'boolean') throw new Error('Шаг ' + s.id + ': flag — true или false');
      var origin = a.origin === undefined ? null : a.origin;
      if (origin !== null && ORIGIN_IDS.indexOf(origin) === -1) throw new Error('Шаг ' + s.id + ': неизвестное происхождение ' + origin);
      var from = a.from === undefined ? null : a.from;
      if (from !== null && (!R.own(position, from) || position[from] >= i)) throw new Error('Шаг ' + s.id + ': унаследовать можно только от предыдущего шага');
      var type = a.type === undefined ? null : a.type;
      if (type !== null && TYPE_IDS.indexOf(type) === -1) throw new Error('Шаг ' + s.id + ': неизвестный тип ' + type);
      // Неотмеченный шаг не хранит уточнений; уточнения, не нужные для выбранного происхождения, сбрасываются.
      steps[s.id] = flag
        ? { flag: true, origin: origin, from: needsFrom(origin) ? from : null, type: needsType(origin) ? type : null }
        : emptyStep();
    });
    return { steps: steps, rows: R.cleanRows(rowsOf(task), response.rows, R.fragmentIndex(task.legal || [])) };
  }

  /* ---------- Проверка ---------- */

  function scoreSteps(task, response) {
    var errs = errorSteps(task);
    var first = errs[0];
    var flags = {
      first: { status: 'wrong', points: 0, max: 2, step: first.id },
      rest: null,
      clean: { status: 'ok', points: 1, max: 1, falsePositives: [] }
    };
    var firstAnswer = stepAnswer(response, first);
    if (firstAnswer.flag) { flags.first.status = 'ok'; flags.first.points = 2; }
    if (errs.length > 1) {
      var missed = errs.slice(1).filter(function (s) { return !stepAnswer(response, s).flag; }).map(function (s) { return s.id; });
      flags.rest = { status: missed.length ? 'wrong' : 'ok', points: missed.length ? 0 : 1, max: 1, missed: missed };
    }
    var steps = {};
    task.steps.forEach(function (s) {
      var a = stepAnswer(response, s);
      var d = { flag: a.flag, flagStatus: a.flag === s.key.error ? 'ok' : 'wrong', origin: null, type: null, points: 0, max: stepMax(s) };
      if (!s.key.error) {
        if (a.flag) flags.clean.falsePositives.push(s.id);
      } else if (a.flag) {
        var originOk = a.origin === s.key.origin && (!needsFrom(s.key.origin) || a.from === s.key.from);
        d.origin = originOk ? 'ok' : (a.origin === s.key.origin ? 'from' : 'wrong');
        if (originOk) d.points += 1;
        if (needsType(s.key.origin)) {
          d.type = a.type === s.key.type ? 'ok' : (a.type ? 'wrong' : 'empty');
          if (d.type === 'ok') d.points += 1;
        }
      } else {
        d.origin = 'empty';
        if (needsType(s.key.origin)) d.type = 'empty';
      }
      steps[s.id] = d;
    });
    if (flags.clean.falsePositives.length) { flags.clean.status = 'wrong'; flags.clean.points = 0; }
    return { flags: flags, steps: steps };
  }

  function check(task, response) {
    var components = R.emptyComponents(maxByComponent(task));
    var reasoning = scoreSteps(task, response);
    var f = reasoning.flags;
    components.R.earned += f.first.points + f.clean.points + (f.rest ? f.rest.points : 0);
    Object.keys(reasoning.steps).forEach(function (id) { components.R.earned += reasoning.steps[id].points; });
    var rows = {};
    rowsOf(task).forEach(function (row) {
      rows[row.id] = R.scoreRow(row, R.rowAnswer(response.rows, row), components);
    });
    var earned = R.total(components, 'earned');
    var max = R.total(components, 'max');
    return {
      verdict: R.verdictOf(earned, max),
      details: { reasoning: reasoning, rows: rows, components: components, earned: earned, max: max }
    };
  }

  function getCorrect(task) {
    var steps = {};
    task.steps.forEach(function (s) {
      steps[s.id] = s.key.error
        ? { flag: true, origin: s.key.origin, from: needsFrom(s.key.origin) ? s.key.from : null, type: needsType(s.key.origin) ? s.key.type : null }
        : emptyStep();
    });
    var rows = {};
    rowsOf(task).forEach(function (row) { rows[row.id] = R.correctRow(row); });
    return { steps: steps, rows: rows };
  }

  function stepNumber(task, id) {
    for (var i = 0; i < task.steps.length; i++) if (task.steps[i].id === id) return i + 1;
    return null;
  }

  function formatResponse(task, response) {
    var flagged = task.steps.filter(function (s) { return stepAnswer(response, s).flag; })
      .map(function (s) { return stepNumber(task, s.id); });
    return flagged.length ? 'отмечены шаги: ' + flagged.join(', ') : 'ошибочные шаги не отмечены';
  }

  types.register('reasoning-check', {
    validateTask: validateTask,
    emptyResponse: emptyResponse,
    isEmpty: isEmpty,
    isComplete: isComplete,
    cleanResponse: cleanResponse,
    check: check,
    getCorrect: getCorrect,
    formatResponse: formatResponse
  });

  OLY.reasoningCheck = {
    ORIGINS: ORIGINS,
    ERROR_TYPES: ERROR_TYPES,
    needsFrom: needsFrom,
    needsType: needsType,
    rowsOf: rowsOf,
    stepNumber: stepNumber,
    stepIsComplete: stepIsComplete,
    maxByComponent: maxByComponent,
    maxPoints: maxPoints,
    scoreSteps: scoreSteps
  };
})(typeof window !== 'undefined' ? window : globalThis);
