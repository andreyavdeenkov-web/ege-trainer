/**
 * Итоговый практикум по теме (практикум с kind: 'final', см. data/practicums.js):
 * модель попытки, оценивание, итоги, учебная аналитика и сохранение в браузере.
 * Чистые функции без DOM: хранилище передаётся аргументом, модуль работает и в Node.js.
 *
 * Тренировочные практикумы (kind: 'training') этим модулем не пользуются: у них прежняя
 * попытка с проверкой после каждого задания (js/attempt.js, js/attempt-save.js).
 *
 * Итоговая работа: задания без проверки; можно переходить между ними, менять, очищать и
 * пропускать ответы. Баллы считаются только при завершении — общим оцениванием платформы
 * (EGE.scoring: модели ФИПИ по позиции КИМ). Незаполненное задание — «без ответа», 0 баллов;
 * частично заполненный ответ оценивается как есть (как на бланке).
 *
 * Попытка — объект из примитивов (целиком сериализуется в JSON):
 * {
 *   format: 'ege-final-session', version: 1,
 *   id, practicum, scope,
 *   startedAt, updatedAt, finishedAt,      // ISO; finishedAt — null до завершения
 *   taskIds: [...],                        // порядок практикума
 *   fingerprints: { id: отпечаток },       // EGE.attemptSave.taskFingerprint на момент старта
 *   viewIndex,                             // задание на экране
 *   responses: { id: selected },           // ответы ученика (пустые не хранятся)
 *   scores?: { id: { points, maxPoints, level } }  // баллы на момент завершения
 * }
 * До завершения в попытке нет ни ключей, ни баллов — только выбор ученика.
 * selected — как в js/scoring.js: номера по возрастанию или, для matching, номера по позициям
 * А, Б, В… (null — позиция не заполнена).
 *
 * Хранилище (область — практикум; записи тренировочных практикумов не затрагиваются):
 *   ege-trainer:final:<область>          — незавершённая попытка;
 *   ege-trainer:final-result:<область>   — последняя завершённая попытка (для разбора);
 *   ege-trainer:final-history:<область>  — краткие итоги завершённых попыток (до 500; первая
 *                                          попытка не вытесняется, см. complete).
 */
(function (root) {
  'use strict';

  var EGE = root.EGE || (root.EGE = {});
  var scoring = EGE.scoring || (typeof require === 'function' ? require('./scoring.js') : null);

  var FORMAT = 'ege-final-session';
  var VERSION = 1;
  var KEY_PREFIX = 'ege-trainer:final:';
  var RESULT_PREFIX = 'ege-trainer:final-result:';
  var HISTORY_PREFIX = 'ege-trainer:final-history:';
  var HISTORY_LIMIT = 500;

  /** Измерения учебной аналитики, общие для итоговых практикумов. */
  var FORMATS = [
    { id: 'EXCL', title: 'Исключение двух позиций' },
    { id: 'MATCH', title: 'Установление соответствия' },
    { id: 'MULTI', title: 'Выбор верных суждений' },
    { id: 'COND', title: 'Выбор признаков по условию' }
  ];
  var LEVELS = [
    { id: 1, title: 'Базовый' },
    { id: 2, title: 'Средний' },
    { id: 3, title: 'Повышенный' }
  ];
  var ACTIONS = [
    { id: 'recognition', title: 'Узнавание' },
    { id: 'understanding', title: 'Понимание' },
    { id: 'distinction', title: 'Различение' }
  ];

  /** Причины, по которым сохранённую попытку нельзя продолжить (продолжение фразы «…нельзя продолжить: …»). */
  var REASONS = {
    corrupt: 'запись повреждена.',
    format: 'она записана в другом формате.',
    tasks: 'задания практикума с тех пор обновились.',
    composition: 'состав заданий практикума с тех пор изменился.'
  };

  function nowIso(now) {
    return (now || new Date()).toISOString();
  }

  function isIsoDate(v) {
    return typeof v === 'string' && !isNaN(Date.parse(v));
  }

  function copy(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function generateId() {
    if (EGE.attempt && EGE.attempt.generateId) return EGE.attempt.generateId();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
      var r = Math.random() * 16 | 0;
      return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function typeOf(task) {
    return scoring.getTaskType(task);
  }

  /* ---------- Ответы ---------- */

  /** Пустой ответ: [] или, для matching, null по каждой позиции. */
  function emptyResponse(task) {
    return typeOf(task) === 'matching' ? task.items.map(function () { return null; }) : [];
  }

  /**
   * Проверяет и нормализует ответ (в том числе неполный). Бросает ошибку при некорректном:
   * номер вне диапазона, у exclude-two больше двух позиций, у matching — не та длина.
   */
  function normalize(task, selected) {
    if (!Array.isArray(selected)) throw new Error('Ответ — массив');
    if (typeOf(task) === 'matching') {
      if (selected.length !== task.items.length) throw new Error('Ответ на соответствие — по числу позиций');
      var used = [];
      return selected.map(function (n) {
        if (n === null || n === undefined) return null;
        if (!Number.isInteger(n) || n < 1 || n > task.options.length) throw new Error('Некорректный номер варианта: ' + n);
        if (task.oneToOne && used.indexOf(n) !== -1) throw new Error('Вариант использован дважды');
        used.push(n);
        return n;
      });
    }
    var seen = [];
    selected.forEach(function (n) {
      if (!Number.isInteger(n) || n < 1 || n > task.statements.length) throw new Error('Некорректный номер: ' + n);
      if (seen.indexOf(n) === -1) seen.push(n);
    });
    if (typeOf(task) === 'exclude-two' && seen.length > scoring.EXCLUDE_COUNT) {
      throw new Error('Можно выбрать только ' + scoring.EXCLUDE_COUNT + ' позиции');
    }
    return seen.sort(function (a, b) { return a - b; });
  }

  /** Есть ли в ответе хоть одна отметка. */
  function isFilled(task, selected) {
    if (!Array.isArray(selected)) return false;
    if (typeOf(task) === 'matching') return selected.some(function (n) { return n != null; });
    return selected.length > 0;
  }

  /**
   * Оценка ответа по модели ФИПИ задания (js/scoring.js). Пустой ответ — 0 баллов, skipped.
   * Неполное соответствие: каждая незаполненная позиция — ошибка (countMatchingMistakes).
   */
  function grade(task, selected) {
    var correct = scoring.getCorrect(task);
    var maxPoints = scoring.getMaxPoints(task);
    var filled = isFilled(task, selected);
    var answer = filled ? normalize(task, selected) : [];
    var mistakes = scoring.countTaskMistakes(task, answer, correct);
    var points = filled ? scoring.scoreTask(task, answer, correct) : 0;
    return {
      selected: answer,
      correct: correct,
      points: points,
      maxPoints: maxPoints,
      mistakes: mistakes,
      skipped: !filled,
      level: filled ? scoring.pointsLevel(points, maxPoints) : 'skipped'
    };
  }

  /**
   * Разбор ошибок ответа по позициям — для блока «Разбор вашего ответа»:
   * choice — [{ number, kind: 'wrong' | 'missed', statement }],
   * matching — [{ row, letter, chosen, expected, item }].
   */
  function mistakeDetails(task, selected) {
    var g = grade(task, selected);
    if (typeOf(task) === 'matching') {
      var rows = [];
      task.items.forEach(function (item, i) {
        var chosen = g.selected[i] == null ? null : g.selected[i];
        if (chosen !== item.match) {
          rows.push({ row: i, letter: scoring.letter(i + 1), chosen: chosen, expected: item.match, item: item });
        }
      });
      return rows;
    }
    var out = [];
    task.statements.forEach(function (s, i) {
      var n = i + 1;
      var chosen = g.selected.indexOf(n) !== -1;
      if (chosen && !s.correct) out.push({ number: n, kind: 'wrong', statement: s });
      if (!chosen && s.correct) out.push({ number: n, kind: 'missed', statement: s });
    });
    return out;
  }

  /* ---------- Попытка ---------- */

  function create(options) {
    var taskIds = options.taskIds.slice();
    if (taskIds.length === 0) throw new Error('В попытке нет заданий');
    if (new Set(taskIds).size !== taskIds.length) throw new Error('Задания повторяются');
    var fingerprints = {};
    taskIds.forEach(function (id) {
      var task = options.getTask(id);
      if (!task) throw new Error('Нет задания ' + id);
      fingerprints[id] = options.fingerprint(task);
    });
    var t = nowIso(options.now);
    return {
      format: FORMAT,
      version: VERSION,
      id: options.id || generateId(),
      practicum: options.practicum,
      scope: options.scope,
      startedAt: t,
      updatedAt: t,
      finishedAt: null,
      taskIds: taskIds,
      fingerprints: fingerprints,
      viewIndex: 0,
      responses: {}
    };
  }

  function assertOpen(session) {
    if (session.finishedAt) throw new Error('Попытка уже завершена');
  }

  /** Любое задание можно открыть в любой момент. */
  function canView(session, index) {
    return Number.isInteger(index) && index >= 0 && index < session.taskIds.length;
  }

  function setView(session, index, now) {
    if (!canView(session, index)) return false;
    session.viewIndex = index;
    session.updatedAt = nowIso(now);
    return true;
  }

  /** Записывает ответ; пустой ответ удаляется (задание снова «без ответа»). */
  function setResponse(session, task, selected, now) {
    assertOpen(session);
    if (session.taskIds.indexOf(task.id) === -1) throw new Error('Задание не из этой попытки');
    var clean = normalize(task, selected);
    if (isFilled(task, clean)) session.responses[task.id] = clean;
    else delete session.responses[task.id];
    session.updatedAt = nowIso(now);
    return clean;
  }

  function getResponse(session, task) {
    return has(session.responses, task.id) ? copy(session.responses[task.id]) : emptyResponse(task);
  }

  /** Число заданий с ответом. */
  function answeredCount(session, getTask) {
    return session.taskIds.filter(function (id) {
      var task = getTask(id);
      return task && isFilled(task, session.responses[id]);
    }).length;
  }

  /** Номера (с 1) заданий без ответа. */
  function unanswered(session, getTask) {
    return session.taskIds.map(function (id, i) {
      return isFilled(getTask(id), session.responses[id]) ? null : i + 1;
    }).filter(function (n) { return n !== null; });
  }

  /**
   * Завершает попытку (с пропусками — тоже). scores — баллы каждого задания на момент
   * завершения: по ним строится итог, если задание потом изменится.
   */
  function finish(session, now, getTask) {
    assertOpen(session);
    session.finishedAt = nowIso(now);
    session.updatedAt = session.finishedAt;
    if (getTask) {
      session.scores = {};
      results(session, getTask).forEach(function (r) {
        session.scores[r.taskId] = { points: r.points, maxPoints: r.maxPoints, level: r.level };
      });
    }
    return session;
  }

  /* ---------- Итоги и аналитика ---------- */

  /**
   * Итог по каждому заданию: { index, taskId, task, selected, correct, points, maxPoints,
   * level: 'full' | 'partial' | 'none' | 'skipped', mistakes, changed? }.
   * changed — ID заданий, изменившихся после завершения: для них берутся сохранённые баллы.
   */
  function results(session, getTask, changed) {
    return session.taskIds.map(function (id, index) {
      var task = getTask(id);
      if (changed && changed.indexOf(id) !== -1 && session.scores && session.scores[id]) {
        var sc = session.scores[id];
        return {
          index: index, taskId: id, task: task, changed: true, selected: [], correct: [],
          points: sc.points, maxPoints: sc.maxPoints, level: sc.level, mistakes: null
        };
      }
      var g = grade(task, session.responses[id] || []);
      return {
        index: index, taskId: id, task: task, selected: g.selected, correct: g.correct,
        points: g.points, maxPoints: g.maxPoints, level: g.level, mistakes: g.mistakes
      };
    });
  }

  function emptyGroup(id, title) {
    return { id: id, title: title, tasks: 0, points: 0, max: 0, full: 0, partial: 0, zero: 0, skipped: 0 };
  }

  function addTo(group, row) {
    group.tasks++;
    group.points += row.points;
    group.max += row.maxPoints;
    if (row.level === 'full') group.full++;
    else if (row.level === 'partial') group.partial++;
    else group.zero++;
    if (row.level === 'skipped') group.skipped++;
  }

  /** Группировка по измерению: valuesOf(task) — значения задания (одно или несколько). */
  function groupBy(rows, dims, valuesOf) {
    var byId = {};
    var list = dims.map(function (d) { return (byId[d.id] = emptyGroup(d.id, d.title)); });
    rows.forEach(function (row) {
      var values = (row.task && valuesOf(row.task)) || [];
      // Задание учитывается в группе один раз, даже если значение повторено.
      values.filter(function (v, i) { return values.indexOf(v) === i; }).forEach(function (v) {
        if (byId[v]) addTo(byId[v], row);
      });
    });
    return list.filter(function (g) { return g.tasks > 0; }).map(function (g) {
      g.percent = scoring.percent(g.points, g.max);
      return g;
    });
  }

  /**
   * Учебная аналитика по итогам (results): общий балл (каждое задание — один раз),
   * число полностью верных, частично верных, нулевых (в том числе без ответа) и группы:
   * форматы, критерии (criteria практикума — [{ id, title }]), уровни, познавательные действия.
   * Задание с несколькими критериями или действиями входит в каждую свою группу;
   * сумма баллов групп поэтому может быть больше общего балла — общий итог не удваивается.
   */
  function analytics(rows, criteria) {
    var total = emptyGroup('total', 'Итого');
    rows.forEach(function (row) { addTo(total, row); });
    total.percent = scoring.percent(total.points, total.max);
    return {
      total: total,
      byFormat: groupBy(rows, FORMATS, function (t) { return t.bankFormat ? [t.bankFormat] : []; }),
      byCriterion: groupBy(rows, criteria || [], function (t) { return t.criteria; }),
      byLevel: groupBy(rows, LEVELS, function (t) { return t.difficulty ? [t.difficulty] : []; }),
      byAction: groupBy(rows, ACTIONS, function (t) { return t.cognitiveActions; })
    };
  }

  /** Краткий итог для истории попыток. */
  function summary(session, a) {
    return {
      id: session.id, startedAt: session.startedAt, finishedAt: session.finishedAt,
      score: a.total.points, max: a.total.max, full: a.total.full, partial: a.total.partial,
      zero: a.total.zero, skipped: a.total.skipped
    };
  }

  /* ---------- Хранилище ---------- */

  function sessionKey(scope) { return KEY_PREFIX + scope; }
  function resultKey(scope) { return RESULT_PREFIX + scope; }
  function historyKey(scope) { return HISTORY_PREFIX + scope; }

  function readJson(storage, k) {
    if (!storage) return { status: 'none' };
    var raw;
    try { raw = storage.getItem(k); } catch (e) { return { status: 'none' }; }
    if (raw == null) return { status: 'none' };
    try { return { status: 'ok', value: JSON.parse(raw) }; } catch (e) { return { status: 'corrupt' }; }
  }

  function removeKey(storage, k) {
    if (!storage) return;
    try { storage.removeItem(k); } catch (e) { /* не критично */ }
  }

  /**
   * Сохраняет незавершённую попытку. Не затирает другую попытку той же области (другая вкладка
   * начала новую) и более свежую запись этой же; force — новая или продолженная попытка.
   */
  function save(storage, session, options) {
    if (!storage || session.finishedAt) return false;
    var k = sessionKey(session.scope);
    try {
      if (!(options && options.force)) {
        var stored = readJson(storage, k);
        if (stored.status === 'ok' && stored.value && stored.value.id !== session.id) return false;
        if (stored.status === 'ok' && stored.value && isIsoDate(stored.value.updatedAt) &&
            Date.parse(stored.value.updatedAt) > Date.parse(session.updatedAt)) return false;
      }
      storage.setItem(k, JSON.stringify(session));
      return true;
    } catch (e) {
      return false;
    }
  }

  function discard(storage, scope) {
    removeKey(storage, sessionKey(scope));
  }

  function sameArray(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /**
   * Проверка записи незавершённой попытки: формат, область, состав практикума, отпечатки
   * заданий; каждый ответ проходит нормализацию. deps: { getTask, fingerprint, taskIds, scope }.
   */
  function validate(record, deps) {
    var fail = function (reason) { return { ok: false, reason: reason }; };
    if (!record || typeof record !== 'object') return fail('corrupt');
    if (record.format !== FORMAT || record.version !== VERSION) return fail('format');
    if (record.scope !== deps.scope) return fail('corrupt');
    if (!isIsoDate(record.startedAt) || !isIsoDate(record.updatedAt) || record.finishedAt !== null) return fail('corrupt');
    if (!Array.isArray(record.taskIds) || !record.fingerprints || typeof record.fingerprints !== 'object') return fail('corrupt');
    if (!record.responses || typeof record.responses !== 'object' || Array.isArray(record.responses)) return fail('corrupt');
    if (deps.taskIds && !sameArray(record.taskIds, Array.prototype.slice.call(deps.taskIds))) return fail('composition');
    for (var i = 0; i < record.taskIds.length; i++) {
      var id = record.taskIds[i];
      var task = deps.getTask(id);
      if (!task || task.retired) return fail('tasks');
      if (record.fingerprints[id] !== deps.fingerprint(task)) return fail('tasks');
    }
    var session = copy(record);
    try {
      Object.keys(session.responses).forEach(function (id) {
        if (session.taskIds.indexOf(id) === -1) throw new Error('чужое задание');
        session.responses[id] = normalize(deps.getTask(id), session.responses[id]);
      });
    } catch (e) {
      return fail('corrupt');
    }
    if (!canView(session, session.viewIndex)) session.viewIndex = 0;
    return { ok: true, session: session };
  }

  /**
   * Незавершённая попытка: { status: 'none' } | { status: 'ok', session } |
   * { status: 'invalid', reason, message } — запись удалена, ученик видит причину.
   */
  function load(storage, deps) {
    var k = sessionKey(deps.scope);
    var read = readJson(storage, k);
    if (read.status === 'none') return { status: 'none' };
    var result = read.status === 'ok' ? validate(read.value, deps) : { ok: false, reason: 'corrupt' };
    if (result.ok) return { status: 'ok', session: result.session };
    removeKey(storage, k);
    return { status: 'invalid', reason: result.reason, message: REASONS[result.reason] };
  }

  /**
   * Фиксирует завершённую попытку: запись результата (последняя попытка, для разбора)
   * и краткий итог в истории; затем удаляет незавершённую запись. Если результат записать
   * не удалось, незавершённая запись не удаляется. Возвращает 'saved' | 'failed'.
   */
  function complete(storage, session, sum) {
    if (!storage) return 'failed';
    try {
      storage.setItem(resultKey(session.scope), JSON.stringify(session));
      var hist = readJson(storage, historyKey(session.scope));
      var list = hist.status === 'ok' && Array.isArray(hist.value) ? hist.value : [];
      list = list.filter(function (h) { return h && h.id !== session.id; });
      list.unshift(sum);
      // При переполнении вытесняются промежуточные попытки, первая остаётся (для динамики).
      while (list.length > HISTORY_LIMIT) list.splice(list.length - 2, 1);
      storage.setItem(historyKey(session.scope), JSON.stringify(list));
    } catch (e) {
      return 'failed';
    }
    removeKey(storage, sessionKey(session.scope));
    return 'saved';
  }

  /**
   * Последняя завершённая попытка для разбора: { status: 'none' | 'ok' | 'corrupt', session?, changed? }.
   * changed — ID заданий, изменившихся после завершения (их разбор не показывается).
   */
  function loadResult(storage, deps) {
    var read = readJson(storage, resultKey(deps.scope));
    if (read.status !== 'ok') return { status: read.status === 'none' ? 'none' : 'corrupt' };
    var rec = read.value;
    if (!rec || rec.format !== FORMAT || rec.scope !== deps.scope || !isIsoDate(rec.finishedAt) ||
        !Array.isArray(rec.taskIds) || !rec.fingerprints || !rec.responses) return { status: 'corrupt' };
    var changed = rec.taskIds.filter(function (id) {
      var task = deps.getTask(id);
      return !task || rec.fingerprints[id] !== deps.fingerprint(task);
    });
    return { status: 'ok', session: rec, changed: changed };
  }

  /**
   * Сводка истории: число попыток, первая, последняя и лучшая (при равенстве — более ранняя)
   * и изменение последней относительно первой и предыдущей (в баллах). null — попыток нет.
   * history — как возвращает loadHistory: новые попытки первыми.
   */
  function progressSummary(history) {
    if (!history.length) return null;
    var chrono = history.slice().reverse();
    var best = chrono.reduce(function (b, h) { return h.score > b.score ? h : b; }, chrono[0]);
    var last = chrono[chrono.length - 1];
    var prev = chrono.length > 1 ? chrono[chrono.length - 2] : null;
    return {
      count: chrono.length,
      first: chrono[0],
      last: last,
      best: best,
      bestIndex: chrono.indexOf(best),
      sinceFirst: last.score - chrono[0].score,
      sincePrevious: prev ? last.score - prev.score : null,
      attempts: chrono
    };
  }

  function loadHistory(storage, scope) {
    var read = readJson(storage, historyKey(scope));
    return read.status === 'ok' && Array.isArray(read.value) ? read.value.filter(function (h) {
      return h && typeof h.score === 'number' && typeof h.max === 'number' && isIsoDate(h.finishedAt);
    }) : [];
  }

  var api = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    FORMATS: FORMATS,
    LEVELS: LEVELS,
    ACTIONS: ACTIONS,
    REASONS: REASONS,
    KEY_PREFIX: KEY_PREFIX,
    RESULT_PREFIX: RESULT_PREFIX,
    HISTORY_PREFIX: HISTORY_PREFIX,
    HISTORY_LIMIT: HISTORY_LIMIT,
    emptyResponse: emptyResponse,
    normalize: normalize,
    isFilled: isFilled,
    grade: grade,
    mistakeDetails: mistakeDetails,
    create: create,
    canView: canView,
    setView: setView,
    setResponse: setResponse,
    getResponse: getResponse,
    answeredCount: answeredCount,
    unanswered: unanswered,
    finish: finish,
    results: results,
    analytics: analytics,
    summary: summary,
    sessionKey: sessionKey,
    resultKey: resultKey,
    historyKey: historyKey,
    save: save,
    discard: discard,
    validate: validate,
    load: load,
    complete: complete,
    loadResult: loadResult,
    loadHistory: loadHistory,
    progressSummary: progressSummary
  };

  EGE.finalSession = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
