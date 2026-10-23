/**
 * Олимпиады: пробный тур — фиксированный вариант с таймером. Чистые функции без DOM.
 *
 * Вариант пробного тура (OLY.mock.defineVariant) — условия заданий без ключей.
 * Ключи и разборы (OLY.mock.defineKey) лежат в отдельном файле, который страница
 * загружает только после завершения попытки: до этого правильных ответов в
 * памяти страницы нет. Защиты от технического доступа к файлу это не даёт —
 * на статическом сайте для неё нужна серверная проверка.
 *
 * Задания варианта не регистрируются в банке (OLY.addTasks), поэтому не попадают
 * в тематическую тренировку. Проверка — общая для платформы: типы заданий
 * OLY.types, оценка OLY.grade.gradeTask и правила OLY.scoringRules.
 *
 * Попытка — объект из примитивов, целиком сериализуется в JSON:
 * {
 *   schemaVersion: 1, kind: 'olympiad-mock', id, variantId,
 *   startedAt, deadline,              // ISO; deadline = startedAt + длительность
 *   finishedAt, finishReason,         // null | ISO; null | 'manual' | 'timeout'
 *   responses: { '1': { value, updatedAt }, … }   // по номерам заданий
 * }
 * Таймер не хранит «оставшееся время»: дедлайн абсолютный, поэтому время идёт
 * и при закрытой вкладке, а после перезагрузки отсчёт продолжается.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});

  var SCHEMA_VERSION = 1;
  var STORAGE_KEY = 'olymp-trainer:mock:v1';
  var REASONS = ['manual', 'timeout'];
  var LETTERS = 'АБВГДЕЖЗИК';

  var variants = Object.create(null);
  var keys = Object.create(null);

  function copy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function nowMs(now) {
    return (now || new Date()).getTime();
  }

  function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  /* ---------- Варианты и ключи ---------- */

  /**
   * Регистрирует вариант: { id, olympiad, title, subtitle, durationMinutes,
   * maxPoints, autoMaxPoints, keySrc, scoring, disciplines, parts, instruction, tasks }.
   * tasks — по номерам с 1, без ключей; поля типа — те, что нужны для ввода ответа.
   */
  function defineVariant(variant) {
    var errors = [];
    if (!variant || !/^[A-Z][A-Z0-9-]*$/.test(variant.id)) throw new Error('Пробный тур: некорректный id ' + (variant && variant.id));
    if (variants[variant.id]) throw new Error('Пробный тур уже зарегистрирован: ' + variant.id);
    if (!(variant.durationMinutes > 0)) errors.push('durationMinutes должно быть положительным');
    if (typeof variant.keySrc !== 'string') errors.push('нет keySrc');
    if (!Array.isArray(variant.tasks) || variant.tasks.length === 0) errors.push('нет заданий');
    else {
      variant.tasks.forEach(function (t, i) {
        if (t.number !== i + 1) errors.push('задание ' + (i + 1) + ': number должен быть ' + (i + 1));
        if (!OLY.types.has(t.type)) errors.push('задание ' + t.number + ': неизвестный тип ' + t.type);
        if (!(t.points > 0)) errors.push('задание ' + t.number + ': нет баллов');
      });
      var auto = variant.tasks.filter(function (t) { return t.type !== 'essay'; })
        .reduce(function (s, t) { return s + t.points; }, 0);
      var total = variant.tasks.reduce(function (s, t) { return s + t.points; }, 0);
      if (auto !== variant.autoMaxPoints) errors.push('сумма автоматически проверяемых заданий ' + auto + ' ≠ autoMaxPoints ' + variant.autoMaxPoints);
      if (total !== variant.maxPoints) errors.push('сумма баллов ' + total + ' ≠ maxPoints ' + variant.maxPoints);
    }
    if (errors.length) throw new Error('Пробный тур ' + variant.id + ': ' + errors.join('; '));
    variants[variant.id] = variant;
    return variant;
  }

  function getVariant(id) {
    return variants[id] || null;
  }

  function listVariants(olympiad) {
    return Object.keys(variants).map(function (id) { return variants[id]; })
      .filter(function (v) { return !olympiad || v.olympiad === olympiad; });
  }

  function taskOf(variant, number) {
    return variant.tasks[number - 1] || null;
  }

  /** Задание с ключом в формате типа OLY.types (для проверки и разбора). */
  function mergeTask(variant, keyTask, task) {
    var t = copy(task);
    t.id = variant.id + '-' + (task.number < 10 ? '0' : '') + task.number;
    if (task.type === 'multiple-select') {
      t.options = task.options.map(function (o, i) {
        return { text: o.text, correct: keyTask.options[i].correct, explanation: keyTask.options[i].explanation };
      });
    } else if (task.type === 'short-text') {
      t.acceptedAnswers = keyTask.acceptedAnswers.slice();
      t.normalize = copy(keyTask.normalize);
    } else if (task.type === 'numeric') {
      t.answer = keyTask.answer;
      if (keyTask.unitSuffixes) t.unitSuffixes = keyTask.unitSuffixes.slice();
    } else if (task.type === 'multi-field') {
      t.fields = task.fields.map(function (f) {
        var field = copy(f);
        field.answer = keyTask.answers[f.id];
        return field;
      });
    } else if (task.type === 'matching') {
      t.items = task.items.map(function (item, i) {
        return { text: item.text, match: keyTask.matches[i], explanation: keyTask.itemExplanations[i] };
      });
    }
    return t;
  }

  /**
   * Регистрирует ключ и разборы варианта: { tasks: { '1': { …ключ типа, feedback,
   * keyDisplay }, … } }. Каждое задание с ключом проверяется контрактом своего типа.
   */
  function defineKey(variantId, key) {
    var variant = variants[variantId];
    if (!variant) throw new Error('Ключ к неизвестному пробному туру: ' + variantId);
    var errors = [];
    var merged = {};
    variant.tasks.forEach(function (task) {
      var k = key.tasks && key.tasks[task.number];
      if (!k) { errors.push('задание ' + task.number + ': нет ключа'); return; }
      try {
        var t = mergeTask(variant, k, task);
        OLY.types.get(t.type).validateTask(t).forEach(function (e) { errors.push('задание ' + task.number + ': ' + e); });
        if (!k.feedback) errors.push('задание ' + task.number + ': нет разбора');
        t.key = k;
        merged[task.number] = t;
      } catch (e) {
        errors.push('задание ' + task.number + ': ' + e.message);
      }
    });
    if (errors.length) throw new Error('Ключ пробного тура ' + variantId + ': ' + errors.join('; '));
    keys[variantId] = merged;
    return merged;
  }

  function hasKey(variantId) {
    return !!keys[variantId];
  }

  /** Задание с ключом и разбором (после загрузки ключа) или null. */
  function keyedTask(variantId, number) {
    return (keys[variantId] && keys[variantId][number]) || null;
  }

  /* ---------- Попытка ---------- */

  function createAttempt(variantId, now) {
    var variant = variants[variantId];
    if (!variant) throw new Error('Неизвестный пробный тур: ' + variantId);
    var start = nowMs(now);
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: 'olympiad-mock',
      id: OLY.attempt ? OLY.attempt.generateId() : String(start),
      variantId: variantId,
      startedAt: new Date(start).toISOString(),
      deadline: new Date(start + variant.durationMinutes * 60000).toISOString(),
      finishedAt: null,
      finishReason: null,
      responses: {}
    };
  }

  function remainingMs(attempt, now) {
    return Math.max(0, Date.parse(attempt.deadline) - nowMs(now));
  }

  function isExpired(attempt, now) {
    return !attempt.finishedAt && remainingMs(attempt, now) === 0;
  }

  /** Текущий ответ или пустой ответ типа. */
  function getResponse(attempt, variant, number) {
    var task = taskOf(variant, number);
    if (!task) throw new Error('Нет задания № ' + number);
    var entry = attempt.responses[number];
    return entry ? copy(entry.value) : OLY.types.get(task.type).emptyResponse(task);
  }

  /** Сохраняет ответ. После завершения попытки или истечения времени ответы не меняются. */
  function setResponse(attempt, variant, number, value, now) {
    var task = taskOf(variant, number);
    if (!task) throw new Error('Нет задания № ' + number);
    if (attempt.finishedAt) throw new Error('Попытка уже завершена');
    if (remainingMs(attempt, now) === 0) throw new Error('Время вышло');
    var type = OLY.types.get(task.type);
    var cleaned = type.isEmpty(task, value) ? type.emptyResponse(task) : type.cleanResponse(task, copy(value));
    if (type.isEmpty(task, cleaned)) delete attempt.responses[number];
    else attempt.responses[number] = { value: cleaned, updatedAt: new Date(nowMs(now)).toISOString() };
    return copy(cleaned);
  }

  function isAnswered(attempt, variant, number) {
    var task = taskOf(variant, number);
    var entry = attempt.responses[number];
    return !!entry && !OLY.types.get(task.type).isEmpty(task, entry.value);
  }

  function answeredCount(attempt, variant) {
    return variant.tasks.filter(function (t) { return isAnswered(attempt, variant, t.number); }).length;
  }

  /**
   * Завершает попытку. По таймеру время окончания — дедлайн, даже если страница
   * узнала об этом позже (была закрыта). Повторный вызов ничего не меняет.
   */
  function finish(attempt, reason, now) {
    if (attempt.finishedAt) return attempt;
    if (REASONS.indexOf(reason) === -1) throw new Error('Неизвестная причина завершения: ' + reason);
    var end = Math.min(nowMs(now), Date.parse(attempt.deadline));
    attempt.finishedAt = new Date(end).toISOString();
    attempt.finishReason = reason;
    return attempt;
  }

  /* ---------- Проверка и итоги ---------- */

  function scoringFor(variant, task, scheme) {
    if (task.type === 'essay') return null;
    var rules = variant.scoring.schemes[scheme].rules;
    var r = rules[task.type] || rules['*'];
    var s = { maxPoints: task.points, rule: r.rule, basis: 'author' };
    if (r.params) s.params = copy(r.params);
    return s;
  }

  /**
   * Результаты всех заданий: [{ number, task (с ключом), response, verdict, details,
   * correct, points, altPoints, maxPoints, scored }]. verdict эссе — 'ungraded'
   * (или 'unanswered'); у эссе points и altPoints — null.
   */
  function gradeAttempt(variant, attempt) {
    if (!hasKey(variant.id)) throw new Error('Ключ пробного тура ' + variant.id + ' не загружен');
    return variant.tasks.map(function (plain) {
      var task = keyedTask(variant.id, plain.number);
      var entry = attempt.responses[plain.number];
      var value = entry ? entry.value : null;
      var main = OLY.grade.gradeTask(task, value, scoringFor(variant, task, variant.scoring.main));
      var alt = OLY.grade.gradeTask(task, value, scoringFor(variant, task, variant.scoring.alternative));
      return {
        number: plain.number,
        task: task,
        response: main.response,
        verdict: main.verdict,
        details: main.details,
        correct: main.correct,
        points: main.points,
        altPoints: alt.points,
        maxPoints: task.points,
        scored: main.scored
      };
    });
  }

  /**
   * Итоги: автоматическая часть (из autoMaxPoints) по основной и альтернативной
   * схемам, счёт заданий, баллы по дисциплинам (по полю discipline задания),
   * статус мини-эссе и рекомендации по заданиям с ошибками и без ответа.
   * Эссе в баллы и дисциплины не входит: оно не оценивается автоматически.
   */
  function summarize(variant, attempt, results) {
    var s = {
      points: 0, altPoints: 0, maxPoints: 0,
      total: 0, correct: 0, incorrect: 0, unanswered: 0,
      essays: [],
      disciplines: variant.disciplines.map(function (d) {
        return { id: d.id, title: d.title, points: 0, altPoints: 0, maxPoints: 0, tasks: [] };
      }),
      recommendations: [],
      final: false,
      durationMs: attempt.finishedAt ? Date.parse(attempt.finishedAt) - Date.parse(attempt.startedAt) : null
    };
    results.forEach(function (r) {
      if (!r.scored) {
        var text = r.verdict === 'unanswered' ? '' : r.response;
        s.essays.push({
          number: r.number,
          status: r.verdict === 'unanswered' ? 'empty' : 'written',
          words: OLY.types.countWords(text),
          limits: r.task.limits || null,
          maxPoints: r.maxPoints
        });
        return;
      }
      s.total++;
      s.points += r.points;
      s.altPoints += r.altPoints;
      s.maxPoints += r.maxPoints;
      if (r.verdict === 'correct') s.correct++;
      else if (r.verdict === 'unanswered') s.unanswered++;
      else s.incorrect++;
      var d = s.disciplines.filter(function (x) { return x.id === r.task.discipline; })[0];
      if (d) {
        d.points += r.points;
        d.altPoints += r.altPoints;
        d.maxPoints += r.maxPoints;
        d.tasks.push(r.number);
      }
      if (r.verdict !== 'correct' && r.task.key.feedback.recommendation) {
        s.recommendations.push({ number: r.number, discipline: r.task.discipline, text: r.task.key.feedback.recommendation, verdict: r.verdict });
      }
    });
    // Итог из maxPoints варианта — только когда все задания оценены (эссе — преподавателем).
    s.final = s.essays.length === 0;
    return s;
  }

  /* ---------- Сохранение ---------- */

  /**
   * Попытка из сохранённого снимка или null (другая схема, вариант, повреждённые
   * данные). Ответы неподходящей структуры отбрасываются. Не бросает исключений.
   */
  function restore(snapshot, variant) {
    try {
      if (!isObject(snapshot) || snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.kind !== 'olympiad-mock') return null;
      if (snapshot.variantId !== variant.id) return null;
      if (isNaN(Date.parse(snapshot.startedAt)) || isNaN(Date.parse(snapshot.deadline))) return null;
      if (snapshot.finishedAt !== null && isNaN(Date.parse(snapshot.finishedAt))) return null;
      if (snapshot.finishedAt !== null && REASONS.indexOf(snapshot.finishReason) === -1) return null;
      if (!isObject(snapshot.responses)) return null;
      var attempt = copy(snapshot);
      Object.keys(attempt.responses).forEach(function (n) {
        var task = taskOf(variant, Number(n));
        var entry = attempt.responses[n];
        var ok = false;
        if (task && String(task.number) === n && isObject(entry)) {
          try {
            entry.value = OLY.types.get(task.type).cleanResponse(task, entry.value);
            ok = !OLY.types.get(task.type).isEmpty(task, entry.value);
          } catch (e) { ok = false; }
        }
        if (!ok) delete attempt.responses[n];
      });
      return attempt;
    } catch (e) {
      return null;
    }
  }

  /** Хранилище попыток поверх backend { read(key), write(key, value) }: последняя попытка на вариант. */
  function createStore(backend) {
    function readAll() {
      var all = backend.read(STORAGE_KEY);
      return isObject(all) ? all : {};
    }
    return {
      load: function (variant) {
        try { return restore(readAll()[variant.id], variant); } catch (e) { return null; }
      },
      save: function (attempt) {
        try {
          var all = readAll();
          all[attempt.variantId] = copy(attempt);
          backend.write(STORAGE_KEY, all);
        } catch (e) { /* попытка просто не сохранится */ }
      },
      remove: function (variantId) {
        try {
          var all = readAll();
          if (!has(all, variantId)) return;
          delete all[variantId];
          backend.write(STORAGE_KEY, all);
        } catch (e) { /* хранилище недоступно */ }
      }
    };
  }

  /** «1:05:09» / «04:09». */
  function formatClock(ms) {
    var total = Math.ceil(Math.max(0, ms) / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var sec = total % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(sec);
  }

  function letter(n) {
    return LETTERS.charAt(n - 1) || String(n);
  }

  OLY.mock = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    defineVariant: defineVariant,
    defineKey: defineKey,
    getVariant: getVariant,
    listVariants: listVariants,
    hasKey: hasKey,
    keyedTask: keyedTask,
    createAttempt: createAttempt,
    remainingMs: remainingMs,
    isExpired: isExpired,
    getResponse: getResponse,
    setResponse: setResponse,
    isAnswered: isAnswered,
    answeredCount: answeredCount,
    finish: finish,
    gradeAttempt: gradeAttempt,
    summarize: summarize,
    restore: restore,
    createStore: createStore,
    formatClock: formatClock,
    letter: letter
  };
})(typeof window !== 'undefined' ? window : globalThis);
