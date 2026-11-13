/**
 * Режимы практикума «Обучение» и «Экзамен»: модель сессии, проверка ответов,
 * итоги, учебная аналитика и сохранение в браузере. Чистые функции без DOM:
 * хранилище передаётся аргументом, модуль работает и в Node.js (для тестов).
 *
 * Режимы включаются у практикума полем modes (data/practicums.js, см. README).
 * Оценивание — общее для платформы: EGE.scoring.scoreTask (модели ФИПИ по позиции КИМ).
 *
 * Обучение (learn): задания по порядку; после проверки — баллы и разбор, задание можно
 *   повторить (каждая проверка — отдельная запись tries). В итог идут баллы ПЕРВОЙ проверки:
 *   повтор после показа правильного ответа не делает результат лучше, чем он был;
 *   баллы после повторов показываются отдельно (finalScore).
 * Экзамен (exam): ответы без проверки; можно переходить между заданиями, менять и
 *   пропускать ответы. Баллы считаются только при завершении. Незаполненное задание —
 *   «без ответа», 0 баллов; частично заполненный ответ оценивается как есть (как на бланке).
 *
 * Сессия — объект из примитивов (целиком сериализуется в JSON):
 * {
 *   format: 'ege-mode-session', version: 1,
 *   id, mode: 'learn' | 'exam', practicum, scope,
 *   startedAt, updatedAt, finishedAt,      // ISO; finishedAt — null до завершения
 *   taskIds: [...],                        // порядок практикума
 *   fingerprints: { id: отпечаток },       // EGE.attemptSave.taskFingerprint на момент старта
 *   viewIndex,                             // задание на экране
 *   responses: { id: selected },           // экзамен — ответ; обучение — отметки до проверки
 *   tries: { id: [{ selected, points, maxPoints, answeredAt }] },  // обучение: проверки
 *   reopened: { id: true }                 // обучение: задание открыто для повтора
 * }
 * selected — как в js/scoring.js: номера по возрастанию или, для matching, номера по позициям
 * А, Б, В… (null — позиция не заполнена).
 *
 * Хранилище (одна область — один практикум; режимы и попытки не смешиваются):
 *   ege-trainer:mode:<режим>:<область>          — незавершённая сессия;
 *   ege-trainer:mode-result:<режим>:<область>   — последняя завершённая сессия (для разбора);
 *   ege-trainer:mode-history:<режим>:<область>  — краткие итоги завершённых попыток (до 20).
 */
(function (root) {
  'use strict';

  var EGE = root.EGE || (root.EGE = {});
  var scoring = EGE.scoring || (typeof require === 'function' ? require('./scoring.js') : null);

  var FORMAT = 'ege-mode-session';
  var VERSION = 1;
  var MODES = ['learn', 'exam'];
  var MODE_TITLES = { learn: 'Обучение', exam: 'Экзамен' };
  var KEY_PREFIX = 'ege-trainer:mode:';
  var RESULT_PREFIX = 'ege-trainer:mode-result:';
  var HISTORY_PREFIX = 'ege-trainer:mode-history:';
  var HISTORY_LIMIT = 20;

  /** Измерения учебной аналитики, общие для всех практикумов с режимами. */
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

  /** Причины, по которым сохранённую сессию нельзя продолжить (продолжение фразы «…нельзя продолжить: …»). */
  var REASONS = {
    corrupt: 'запись повреждена.',
    format: 'она записана в другом формате.',
    tasks: 'задания практикума с тех пор обновились.',
    composition: 'состав заданий практикума с тех пор изменился.',
    scoring: 'правила оценивания или ключи заданий с тех пор изменились.'
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
   * номер вне диапазона, повтор, у exclude-two больше двух позиций, у matching — не та длина.
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

  /** Полный ответ: все позиции соответствия, ровно две «выпадающие», хоть одна цифра в остальных. */
  function isComplete(task, selected) {
    if (!isFilled(task, selected)) return false;
    var type = typeOf(task);
    if (type === 'matching') return selected.every(function (n) { return n != null; });
    if (type === 'exclude-two') return selected.length === scoring.EXCLUDE_COUNT;
    return true;
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
   * Разбор ошибок ответа по позициям — для блока «Ваша ошибка»:
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

  /* ---------- Сессия ---------- */

  function create(options) {
    if (MODES.indexOf(options.mode) === -1) throw new Error('Неизвестный режим: ' + options.mode);
    var taskIds = options.taskIds.slice();
    if (taskIds.length === 0) throw new Error('В сессии нет заданий');
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
      mode: options.mode,
      practicum: options.practicum,
      scope: options.scope,
      startedAt: t,
      updatedAt: t,
      finishedAt: null,
      taskIds: taskIds,
      fingerprints: fingerprints,
      viewIndex: 0,
      responses: {},
      tries: {},
      reopened: {}
    };
  }

  function assertOpen(session) {
    if (session.finishedAt) throw new Error('Сессия уже завершена');
  }

  function touch(session, now) {
    session.updatedAt = nowIso(now);
  }

  function triesOf(session, taskId) {
    return session.tries[taskId] || [];
  }

  /** Обучение: задание проверено и показан разбор (не открыто для повтора). */
  function isChecked(session, taskId) {
    return session.mode === 'learn' && triesOf(session, taskId).length > 0 && !session.reopened[taskId];
  }

  /** Обучение: индекс первого задания без проверки (-1 — все проверены). */
  function firstUnchecked(session) {
    for (var i = 0; i < session.taskIds.length; i++) {
      if (triesOf(session, session.taskIds[i]).length === 0) return i;
    }
    return -1;
  }

  /** Можно ли открыть задание: в экзамене — любое; в обучении — проверенные и первое непроверенное. */
  function canView(session, index) {
    if (!Number.isInteger(index) || index < 0 || index >= session.taskIds.length) return false;
    if (session.mode === 'exam') return true;
    var first = firstUnchecked(session);
    return first === -1 || index <= first;
  }

  function setView(session, index, now) {
    if (!canView(session, index)) return false;
    session.viewIndex = index;
    touch(session, now);
    return true;
  }

  /** Записывает ответ (экзамен) или отметки до проверки (обучение). Пустой ответ удаляется. */
  function setResponse(session, task, selected, now) {
    assertOpen(session);
    if (session.taskIds.indexOf(task.id) === -1) throw new Error('Задание не из этой сессии');
    if (isChecked(session, task.id)) throw new Error('Задание уже проверено — сначала «Повторить»');
    var clean = normalize(task, selected);
    if (isFilled(task, clean)) session.responses[task.id] = clean;
    else delete session.responses[task.id];
    touch(session, now);
    return clean;
  }

  function getResponse(session, task) {
    return has(session.responses, task.id) ? copy(session.responses[task.id]) : emptyResponse(task);
  }

  /** Обучение: проверка полного ответа. Возвращает запись проверки с разбором (grade). */
  function check(session, task, now) {
    assertOpen(session);
    if (session.mode !== 'learn') throw new Error('Проверка по одному заданию — только в обучении');
    if (isChecked(session, task.id)) throw new Error('Задание уже проверено');
    var selected = getResponse(session, task);
    if (!isComplete(task, selected)) throw new Error('Ответ не заполнен');
    var g = grade(task, selected);
    var entry = { selected: g.selected, points: g.points, maxPoints: g.maxPoints, answeredAt: nowIso(now) };
    session.tries[task.id] = triesOf(session, task.id).concat([entry]);
    delete session.responses[task.id];
    delete session.reopened[task.id];
    touch(session, now);
    return g;
  }

  /** Обучение: открыть проверенное задание для повторной попытки. */
  function retry(session, taskId, now) {
    assertOpen(session);
    if (session.mode !== 'learn' || triesOf(session, taskId).length === 0) throw new Error('Повторить можно только проверенное задание');
    session.reopened[taskId] = true;
    delete session.responses[taskId];
    touch(session, now);
  }

  /** Можно ли завершить: экзамен — всегда; обучение — когда каждое задание проверено хотя бы раз. */
  function canFinish(session) {
    return session.mode === 'exam' || firstUnchecked(session) === -1;
  }

  /**
   * Завершает сессию. scores — баллы каждого задания на момент завершения: по ним строится
   * итог, если задание потом изменится (разбор такого задания уже не показывается).
   */
  function finish(session, now, getTask) {
    assertOpen(session);
    if (!canFinish(session)) throw new Error('Не все задания проверены');
    // Повтор, начатый и не проверенный, в итог не входит.
    session.reopened = {};
    if (session.mode === 'learn') session.responses = {};
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

  /** Число заданий с ответом (экзамен) или проверенных (обучение). */
  function progressCount(session, getTask) {
    return session.taskIds.filter(function (id) {
      if (session.mode === 'learn') return triesOf(session, id).length > 0;
      var task = getTask(id);
      return task && isFilled(task, session.responses[id]);
    }).length;
  }

  /* ---------- Итоги и аналитика ---------- */

  /**
   * Итог по каждому заданию: { index, taskId, task, selected, correct, points, maxPoints,
   * level: 'full' | 'partial' | 'none' | 'skipped', tries?, finalPoints? }.
   * Обучение — по первой проверке, finalPoints — по последней. Экзамен — по ответу.
   * getTask(id) возвращает задание для разбора (текущее или сохранённое).
   */
  function results(session, getTask, changed) {
    return session.taskIds.map(function (id, index) {
      var task = getTask(id);
      var row;
      if (changed && changed.indexOf(id) !== -1 && session.scores && session.scores[id]) {
        var sc = session.scores[id];
        return {
          index: index, taskId: id, task: task, changed: true, selected: [], correct: [],
          points: sc.points, maxPoints: sc.maxPoints, level: sc.level, mistakes: null
        };
      }
      if (session.mode === 'learn') {
        var tries = triesOf(session, id);
        var first = tries[0];
        var g = first ? grade(task, first.selected) : grade(task, []);
        row = {
          index: index, taskId: id, task: task, selected: g.selected, correct: g.correct,
          points: g.points, maxPoints: g.maxPoints, level: g.level, mistakes: g.mistakes,
          tries: tries.length,
          finalPoints: tries.length ? grade(task, tries[tries.length - 1].selected).points : 0,
          lastSelected: tries.length ? tries[tries.length - 1].selected : []
        };
      } else {
        var e = grade(task, session.responses[id] || []);
        row = {
          index: index, taskId: id, task: task, selected: e.selected, correct: e.correct,
          points: e.points, maxPoints: e.maxPoints, level: e.level, mistakes: e.mistakes
        };
      }
      return row;
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

  function finalizeGroups(groups) {
    return groups.filter(function (g) { return g.tasks > 0; }).map(function (g) {
      g.percent = scoring.percent(g.points, g.max);
      return g;
    });
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
    return finalizeGroups(list);
  }

  /**
   * Учебная аналитика по итогам (results): общий балл (каждое задание — один раз),
   * число полностью верных, частично верных, нулевых (в том числе без ответа) и группы:
   * форматы, критерии сравнения (criteria — [{ id, title }] практикума), уровни, действия.
   * Задание с несколькими критериями или действиями входит в каждую свою группу;
   * сумма баллов групп поэтому может быть больше общего балла — это не двойной учёт в итоге.
   */
  function analytics(rows, criteria) {
    var total = emptyGroup('total', 'Итого');
    rows.forEach(function (row) { addTo(total, row); });
    total.percent = scoring.percent(total.points, total.max);
    var out = {
      total: total,
      byFormat: groupBy(rows, FORMATS, function (t) { return t.bankFormat ? [t.bankFormat] : []; }),
      byCriterion: groupBy(rows, criteria || [], function (t) { return t.criteria; }),
      byLevel: groupBy(rows, LEVELS, function (t) { return t.difficulty ? [t.difficulty] : []; }),
      byAction: groupBy(rows, ACTIONS, function (t) { return t.cognitiveActions; })
    };
    if (rows.length && rows[0].finalPoints !== undefined) {
      out.finalScore = rows.reduce(function (s, r) { return s + r.finalPoints; }, 0);
      out.retried = rows.filter(function (r) { return r.tries > 1; }).length;
    }
    return out;
  }

  /** Краткий итог для истории попыток. */
  function summary(session, a) {
    var s = {
      id: session.id, mode: session.mode, startedAt: session.startedAt, finishedAt: session.finishedAt,
      score: a.total.points, max: a.total.max, full: a.total.full, partial: a.total.partial,
      zero: a.total.zero, skipped: a.total.skipped
    };
    if (a.finalScore !== undefined) s.finalScore = a.finalScore;
    return s;
  }

  /* ---------- Хранилище ---------- */

  function key(prefix, mode, scope) {
    return prefix + mode + ':' + scope;
  }

  function sessionKey(mode, scope) { return key(KEY_PREFIX, mode, scope); }
  function resultKey(mode, scope) { return key(RESULT_PREFIX, mode, scope); }
  function historyKey(mode, scope) { return key(HISTORY_PREFIX, mode, scope); }

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
   * Сохраняет незавершённую сессию. Не затирает чужую сессию той же области (другая вкладка
   * начала новую попытку) и более свежую запись той же сессии; force — новая или продолженная.
   */
  function save(storage, session, options) {
    if (!storage || session.finishedAt) return false;
    var k = sessionKey(session.mode, session.scope);
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

  function discard(storage, mode, scope) {
    removeKey(storage, sessionKey(mode, scope));
  }

  function sameArray(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /**
   * Проверка записи сессии: формат, режим, область, состав практикума, отпечатки заданий;
   * ответы проходят нормализацию, проверки обучения пересчитываются текущим оцениванием.
   * deps: { getTask, fingerprint, taskIds, mode, scope, finished? }.
   */
  function validate(record, deps) {
    var fail = function (reason) { return { ok: false, reason: reason }; };
    if (!record || typeof record !== 'object') return fail('corrupt');
    if (record.format !== FORMAT || record.version !== VERSION) return fail('format');
    if (record.mode !== deps.mode || record.scope !== deps.scope) return fail('corrupt');
    if (!isIsoDate(record.startedAt) || !isIsoDate(record.updatedAt)) return fail('corrupt');
    if (deps.finished ? !isIsoDate(record.finishedAt) : record.finishedAt !== null) return fail('corrupt');
    if (!Array.isArray(record.taskIds) || !record.fingerprints || typeof record.fingerprints !== 'object') return fail('corrupt');
    var badMap = ['responses', 'tries', 'reopened'].some(function (f) {
      return !record[f] || typeof record[f] !== 'object' || Array.isArray(record[f]);
    });
    if (badMap) return fail('corrupt');
    if (deps.taskIds && !sameArray(record.taskIds, Array.prototype.slice.call(deps.taskIds))) return fail('composition');
    for (var i = 0; i < record.taskIds.length; i++) {
      var id = record.taskIds[i];
      var task = deps.getTask(id);
      if (!task || task.retired) return fail('tasks');
      if (record.fingerprints[id] !== deps.fingerprint(task)) return fail('tasks');
    }
    var known = function (obj) { return Object.keys(obj).every(function (k) { return record.taskIds.indexOf(k) !== -1; }); };
    if (!known(record.responses) || !known(record.tries) || !known(record.reopened)) return fail('corrupt');
    try {
      Object.keys(record.responses).forEach(function (id) {
        record.responses[id] = normalize(deps.getTask(id), record.responses[id]);
      });
      var scoringChanged = false;
      Object.keys(record.tries).forEach(function (id) {
        var tries = record.tries[id];
        if (!Array.isArray(tries)) throw new Error('tries');
        tries.forEach(function (t) {
          if (!t || !isIsoDate(t.answeredAt)) throw new Error('try');
          var g = grade(deps.getTask(id), t.selected);
          if (g.points !== t.points || g.maxPoints !== t.maxPoints) scoringChanged = true;
        });
      });
      if (scoringChanged) return fail('scoring');
    } catch (e) {
      return fail('corrupt');
    }
    if (record.mode === 'exam' && Object.keys(record.tries).length) return fail('corrupt');
    var session = copy(record);
    if (!canView(session, session.viewIndex)) session.viewIndex = 0;
    return { ok: true, session: session };
  }

  /**
   * Незавершённая сессия режима: { status: 'none' } | { status: 'ok', session } |
   * { status: 'invalid', reason, message } — запись удалена, ученик видит причину.
   */
  function load(storage, deps) {
    var k = sessionKey(deps.mode, deps.scope);
    var read = readJson(storage, k);
    if (read.status === 'none') return { status: 'none' };
    var result = read.status === 'ok' ? validate(read.value, deps) : { ok: false, reason: 'corrupt' };
    if (result.ok) return { status: 'ok', session: result.session };
    removeKey(storage, k);
    return { status: 'invalid', reason: result.reason, message: REASONS[result.reason] };
  }

  /**
   * Фиксирует завершённую сессию: запись результата (последняя попытка режима, для разбора)
   * и краткий итог в истории; затем удаляет незавершённую запись. Если результат записать
   * не удалось, незавершённая запись не удаляется. Возвращает 'saved' | 'failed'.
   */
  function complete(storage, session, sum) {
    if (!storage) return 'failed';
    try {
      storage.setItem(resultKey(session.mode, session.scope), JSON.stringify(session));
      var hist = readJson(storage, historyKey(session.mode, session.scope));
      var list = hist.status === 'ok' && Array.isArray(hist.value) ? hist.value : [];
      list = list.filter(function (h) { return h && h.id !== session.id; });
      list.unshift(sum);
      storage.setItem(historyKey(session.mode, session.scope), JSON.stringify(list.slice(0, HISTORY_LIMIT)));
    } catch (e) {
      return 'failed';
    }
    removeKey(storage, sessionKey(session.mode, session.scope));
    return 'saved';
  }

  /**
   * Последняя завершённая сессия режима для разбора: { status: 'none' | 'ok' | 'corrupt', session?, changed? }.
   * Если задания с тех пор изменились, разбор по ним недоступен: changed — их ID
   * (баллы попытки остаются такими, какими были при завершении — в истории).
   */
  function loadResult(storage, deps) {
    var read = readJson(storage, resultKey(deps.mode, deps.scope));
    if (read.status !== 'ok') return { status: read.status === 'none' ? 'none' : 'corrupt' };
    var rec = read.value;
    if (!rec || rec.format !== FORMAT || rec.mode !== deps.mode || rec.scope !== deps.scope ||
        !isIsoDate(rec.finishedAt) || !Array.isArray(rec.taskIds)) return { status: 'corrupt' };
    var changed = rec.taskIds.filter(function (id) {
      var task = deps.getTask(id);
      return !task || rec.fingerprints[id] !== deps.fingerprint(task);
    });
    return { status: 'ok', session: rec, changed: changed };
  }

  function loadHistory(storage, mode, scope) {
    var read = readJson(storage, historyKey(mode, scope));
    return read.status === 'ok' && Array.isArray(read.value) ? read.value.filter(function (h) {
      return h && typeof h.score === 'number' && typeof h.max === 'number' && isIsoDate(h.finishedAt);
    }) : [];
  }

  var api = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    MODES: MODES,
    MODE_TITLES: MODE_TITLES,
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
    isComplete: isComplete,
    grade: grade,
    mistakeDetails: mistakeDetails,
    create: create,
    triesOf: triesOf,
    isChecked: isChecked,
    firstUnchecked: firstUnchecked,
    canView: canView,
    setView: setView,
    setResponse: setResponse,
    getResponse: getResponse,
    check: check,
    retry: retry,
    canFinish: canFinish,
    finish: finish,
    progressCount: progressCount,
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
    loadHistory: loadHistory
  };

  EGE.modeSession = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
