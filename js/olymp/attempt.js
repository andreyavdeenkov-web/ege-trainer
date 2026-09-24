/**
 * Олимпиады: попытка. Чистые функции без зависимостей от DOM.
 *
 * Два режима с общей моделью:
 *   practice — тематическая тренировка: свободная навигация, задания можно
 *              пропускать; ответ засчитывается только по явной проверке
 *              (check), после неё он read-only и показывается разбор;
 *   mock     — пробный тур по источнику: набор и порядок заданий задаёт
 *              источник, ответы можно менять до завершения, правильные ответы
 *              не показываются; finish оценивает все задания сразу.
 *
 * Попытка — объект из примитивов и ID (без ссылок на задания), целиком
 * сериализуется в JSON:
 * {
 *   schemaVersion: 1, id, kind: 'olympiad', mode: 'practice' | 'mock',
 *   olympiad, subject,
 *   settings: { discipline, topic, filters } | { sourceId },
 *   startedAt, finishedAt,
 *   taskIds: [...],                                   // порядок показа
 *   responses: { taskId: { value, updatedAt } },      // черновики ответов
 *   results:   { taskId: { taskId, taskVersion, response, verdict, details,
 *                          correct, points, maxPoints, scored, checkedAt } }
 * }
 * Зависит от js/olymp/registry.js, js/olymp/types.js и js/olymp/grade.js.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var types = OLY.types;
  var grade = OLY.grade;

  var SCHEMA_VERSION = 1;
  var MODES = ['practice', 'mock'];

  function nowIso(now) {
    return (now || new Date()).toISOString();
  }

  function copy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function generateId() {
    var c = root.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    // Запасной вариант для старых браузеров: UUID v4 на Math.random.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
      var r = Math.random() * 16 | 0;
      return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function requireTask(taskId) {
    var task = OLY.getTask(taskId);
    if (!task) throw new Error('Неизвестное задание: ' + taskId);
    return task;
  }

  /**
   * Новая попытка.
   * practice: { mode: 'practice', olympiad, subject, taskIds,
   *             settings: { discipline, topic, filters: { class, round } } };
   * mock:     { mode: 'mock', settings: { sourceId } } — задания и порядок
   *             берутся из источника (он должен быть playable).
   */
  function createAttempt(options) {
    if (MODES.indexOf(options.mode) === -1) throw new Error('Неизвестный режим попытки: ' + options.mode);
    var settings = copy(options.settings || {});
    var olympiad = options.olympiad;
    var subject = options.subject;
    var taskIds;

    if (options.mode === 'mock') {
      var source = OLY.getSource(settings.sourceId);
      if (!source) throw new Error('Неизвестный источник: ' + settings.sourceId);
      if (!source.playable) throw new Error('Источник ' + source.id + ' нельзя пройти как пробный тур');
      if ((olympiad && olympiad !== source.olympiad) || (subject && subject !== source.subject)) {
        throw new Error('Олимпиада или предмет не совпадают с источником ' + source.id);
      }
      olympiad = source.olympiad;
      subject = source.subject;
      taskIds = OLY.getSourceTaskIds(source.id);
      settings = { sourceId: source.id };
    } else {
      taskIds = (options.taskIds || []).slice();
      if (taskIds.length === 0) throw new Error('В попытке нет заданий');
    }

    if (new Set(taskIds).size !== taskIds.length) throw new Error('Задания в попытке повторяются');
    taskIds.forEach(function (id) {
      var task = requireTask(id);
      if (task.olympiad !== olympiad || task.subject !== subject) {
        throw new Error('Задание ' + id + ' относится к другой олимпиаде или предмету');
      }
    });

    return {
      schemaVersion: SCHEMA_VERSION,
      id: options.id || generateId(),
      kind: 'olympiad',
      mode: options.mode,
      olympiad: olympiad,
      subject: subject,
      settings: settings,
      startedAt: nowIso(options.now),
      finishedAt: null,
      taskIds: taskIds,
      responses: {},
      results: {}
    };
  }

  function requireInAttempt(attempt, taskId) {
    if (attempt.taskIds.indexOf(taskId) === -1) throw new Error('Задания ' + taskId + ' нет в попытке');
    return requireTask(taskId);
  }

  function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  /** Критерии задания в этой попытке: в пробном туре учитывается позиция источника. */
  function scoringFor(attempt, task) {
    var item = attempt.mode === 'mock' ? OLY.getSourceItem(attempt.settings.sourceId, task.id) : null;
    return grade.resolveScoring(task, item);
  }

  /** Проверено ли задание (засчитан ли ответ). */
  function isChecked(attempt, taskId) {
    return has(attempt.results, taskId);
  }

  /** Можно ли менять ответ на задание. */
  function canEdit(attempt, taskId) {
    return !attempt.finishedAt && attempt.taskIds.indexOf(taskId) !== -1 && !isChecked(attempt, taskId);
  }

  /** Текущий ответ (черновик) или пустой ответ типа задания. */
  function getResponse(attempt, taskId) {
    var task = requireInAttempt(attempt, taskId);
    if (has(attempt.responses, taskId)) return copy(attempt.responses[taskId].value);
    return types.get(task.type).emptyResponse(task);
  }

  /** Сохраняет черновик ответа. Структура проверяется сразу; неполный ответ допустим. */
  function setResponse(attempt, taskId, value, now) {
    var task = requireInAttempt(attempt, taskId);
    if (attempt.finishedAt) throw new Error('Попытка уже завершена');
    if (isChecked(attempt, taskId)) throw new Error('Ответ на задание ' + taskId + ' уже засчитан');
    var type = types.get(task.type);
    var cleaned = type.isEmpty(task, value) ? type.emptyResponse(task) : type.cleanResponse(task, copy(value));
    attempt.responses[taskId] = { value: cleaned, updatedAt: nowIso(now) };
    return copy(cleaned);
  }

  function recordResult(attempt, task, now) {
    var value = has(attempt.responses, task.id) ? attempt.responses[task.id].value : null;
    var graded = grade.gradeTask(task, value, scoringFor(attempt, task));
    var result = {
      taskId: task.id,
      taskVersion: task.version || 1,
      response: graded.response,
      verdict: graded.verdict,
      details: graded.details,
      correct: graded.correct,
      points: graded.points,
      maxPoints: graded.maxPoints,
      scored: graded.scored,
      checkedAt: nowIso(now)
    };
    attempt.results[task.id] = copy(result);
    return result;
  }

  /**
   * practice: засчитывает ответ на задание («Проверить») и возвращает результат.
   * После проверки ответ изменить нельзя. Пустой ответ проверить нельзя.
   */
  function check(attempt, taskId, now) {
    if (attempt.mode !== 'practice') throw new Error('Проверка отдельного задания доступна только в тренировке');
    var task = requireInAttempt(attempt, taskId);
    if (attempt.finishedAt) throw new Error('Попытка уже завершена');
    if (isChecked(attempt, taskId)) throw new Error('Ответ на задание ' + taskId + ' уже засчитан');
    var value = has(attempt.responses, taskId) ? attempt.responses[taskId].value : null;
    if (types.get(task.type).isEmpty(task, value)) throw new Error('Нет ответа на задание ' + taskId);
    return recordResult(attempt, task, now);
  }

  /**
   * Завершает попытку. В пробном туре оценивает все задания, включая пустые;
   * в тренировке непроверенные задания остаются пропущенными.
   * Повторный вызов ничего не меняет.
   */
  function finish(attempt, now) {
    if (attempt.finishedAt) return attempt;
    if (attempt.mode === 'mock') {
      attempt.taskIds.forEach(function (id) {
        if (!isChecked(attempt, id)) recordResult(attempt, requireTask(id), now);
      });
    }
    attempt.finishedAt = nowIso(now);
    return attempt;
  }

  /** Результат задания или null. */
  function getResult(attempt, taskId) {
    return has(attempt.results, taskId) ? copy(attempt.results[taskId]) : null;
  }

  /**
   * Итоги попытки:
   *   total, correct, incorrect, skipped (без ответа или без проверки);
   *   points / maxPoints — только по заданиям с определёнными критериями;
   *   scoredCount — сколько результатов с баллами, unscoredCount — без критериев.
   */
  function summary(attempt) {
    var s = {
      total: attempt.taskIds.length,
      correct: 0, incorrect: 0, skipped: 0,
      points: 0, maxPoints: 0,
      scoredCount: 0, unscoredCount: 0
    };
    attempt.taskIds.forEach(function (id) {
      var result = attempt.results[id];
      if (!result || result.verdict === 'unanswered') s.skipped++;
      else if (result.verdict === 'correct') s.correct++;
      else s.incorrect++;
      if (!result) return;
      if (result.scored) {
        s.scoredCount++;
        s.points += result.points;
        s.maxPoints += result.maxPoints;
      } else {
        s.unscoredCount++;
      }
    });
    return s;
  }

  /** Независимая копия попытки для передачи наружу (например, на сервер). */
  function snapshot(attempt) {
    return copy(attempt);
  }

  OLY.attempt = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    MODES: MODES,
    generateId: generateId,
    createAttempt: createAttempt,
    scoringFor: scoringFor,
    isChecked: isChecked,
    canEdit: canEdit,
    getResponse: getResponse,
    setResponse: setResponse,
    check: check,
    finish: finish,
    getResult: getResult,
    summary: summary,
    snapshot: snapshot
  };

  /**
   * Точки расширения для будущей отправки результатов в базу данных.
   * Сейчас ничего не делают; интерфейс будет вызывать их с копиями данных:
   *   onCheck(result, attempt) — после проверки задания в тренировке;
   *   onFinish(attempt)        — один раз при завершении попытки.
   */
  OLY.attemptStore = OLY.attemptStore || {
    onCheck: function () {},
    onFinish: function () {}
  };
})(typeof window !== 'undefined' ? window : globalThis);
