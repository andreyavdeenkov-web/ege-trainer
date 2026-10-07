/**
 * Олимпиады, интерфейс: сохранение попыток по теме и правила повторного
 * прохождения. Чистые функции без DOM (хранилище передаётся параметром).
 *
 * Правила берутся из attemptPolicy трека (OLY.getAttemptPolicy). У олимпиад
 * правила по умолчанию: попытка живёт только в памяти страницы, тему можно
 * пройти заново, повторить ошибки и пропущенные. У практикума сейчас — одна
 * попытка на тему: она сохраняется в браузере, а после завершения тема
 * открывается только для просмотра результатов.
 *
 * Хранилище: один ключ localStorage со словарём
 *   { 'PR/LAW/LAW-CPT': <снимок попытки OLY.attempt>, … }
 * — по последней попытке на область тренировки (трек / дисциплина / тема).
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui || (OLY.ui = {});

  var STORAGE_KEY = 'olymp-trainer:attempts:v1';

  /** Ключ области тренировки: 'PR/LAW/LAW-CPT'. */
  function scopeKey(scope) {
    return [scope.olympiad, scope.discipline, scope.topic].join('/');
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  var VERDICTS = ['correct', 'incorrect', 'unanswered'];

  /** Ответ подходит заданию по структуре (как при вводе ученика). */
  function validResponse(task, value) {
    if (value === null || value === undefined) return false;
    try {
      OLY.types.get(task.type).cleanResponse(task, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Черновик: { value, updatedAt } с ответом подходящей структуры. */
  function validDraft(task, entry) {
    return isObject(entry) && validResponse(task, entry.value);
  }

  /** Результат проверки: известный вердикт и ответ подходящей структуры (у пропущенного — null). */
  function validResult(task, entry) {
    if (!isObject(entry) || VERDICTS.indexOf(entry.verdict) === -1) return false;
    if (entry.verdict === 'unanswered') return entry.response === null || validResponse(task, entry.response);
    return validResponse(task, entry.response);
  }

  /**
   * Попытка из сохранённого снимка или null, если снимок не подходит:
   * другая версия схемы, другая область, повреждённая структура.
   * Задания, которых больше нет в банке, из попытки убираются вместе с ответами;
   * повреждённые черновики и результаты отбрасываются (задание считается
   * непроверенным). Функция никогда не бросает исключение: несовместимое
   * сохранённое состояние безопасно игнорируется.
   */
  function restore(snapshot, scope) {
    try {
      return restoreUnsafe(snapshot, scope);
    } catch (e) {
      return null;
    }
  }

  function restoreUnsafe(snapshot, scope) {
    var A = OLY.attempt;
    if (!isObject(snapshot) || snapshot.schemaVersion !== A.SCHEMA_VERSION || snapshot.mode !== 'practice') return null;
    if (snapshot.olympiad !== scope.olympiad || snapshot.subject !== scope.subject) return null;
    if (!isObject(snapshot.settings) || snapshot.settings.discipline !== scope.discipline ||
        snapshot.settings.topic !== scope.topic) return null;
    if (!Array.isArray(snapshot.taskIds) || !isObject(snapshot.responses) || !isObject(snapshot.results)) return null;
    if (snapshot.finishedAt !== null && typeof snapshot.finishedAt !== 'string') return null;

    var attempt = A.snapshot(snapshot);
    attempt.taskIds = attempt.taskIds.filter(function (id) {
      var task = OLY.getTask(id);
      return !!task && task.olympiad === attempt.olympiad && task.subject === attempt.subject;
    });
    if (attempt.taskIds.length === 0) return null;
    if (new Set(attempt.taskIds).size !== attempt.taskIds.length) return null;
    Object.keys(attempt.responses).forEach(function (id) {
      if (attempt.taskIds.indexOf(id) === -1 || !validDraft(OLY.getTask(id), attempt.responses[id])) delete attempt.responses[id];
    });
    Object.keys(attempt.results).forEach(function (id) {
      if (attempt.taskIds.indexOf(id) === -1 || !validResult(OLY.getTask(id), attempt.results[id])) delete attempt.results[id];
    });
    return attempt;
  }

  /**
   * Хранилище попыток поверх backend с методами read(key) и write(key, value)
   * (например, OLY.ui.storage). Ошибки хранилища не прерывают тренировку.
   */
  function createStore(backend) {
    function readAll() {
      var all = backend.read(STORAGE_KEY);
      return isObject(all) ? all : {};
    }
    return {
      /** Сохранённая попытка области или null. */
      load: function (scope) {
        try {
          return restore(readAll()[scopeKey(scope)], scope);
        } catch (e) {
          return null;
        }
      },
      /** Сохраняет копию попытки для области. */
      save: function (scope, attempt) {
        try {
          var all = readAll();
          all[scopeKey(scope)] = OLY.attempt.snapshot(attempt);
          backend.write(STORAGE_KEY, all);
        } catch (e) { /* попытка просто не сохранится */ }
      }
    };
  }

  /** Состояние темы: 'new' — попытки нет, 'in-progress' — начата, 'completed' — завершена. */
  function topicState(attempt) {
    if (!attempt) return 'new';
    return attempt.finishedAt ? 'completed' : 'in-progress';
  }

  /**
   * Можно ли начать новую попытку. Без сохранённой попытки — всегда.
   * Если попытка уже есть (начатая или завершённая), новая её заменит, —
   * это разрешено только при allowRetake.
   */
  function canStartNew(policy, attempt) {
    return topicState(attempt) === 'new' || policy.allowRetake;
  }

  /** Можно ли начать новую попытку из ошибок ('mistakes') или пропущенных ('skipped'). */
  function canRetry(policy, kind) {
    if (kind === 'mistakes') return policy.allowRetryMistakes;
    if (kind === 'skipped') return policy.allowRetrySkipped;
    return false;
  }

  /**
   * Тренировку можно покинуть без подтверждения, если попытка сохраняется:
   * к ней можно вернуться и продолжить.
   */
  function leavesFreely(policy) {
    return policy.persistAttempts;
  }

  /**
   * Тренировка всегда охватывает всю тему, без фильтров и выбора количества,
   * когда повторное прохождение запрещено: иначе завершение попытки
   * по части заданий навсегда закрыло бы остальные.
   */
  function wholeTopicOnly(policy) {
    return !policy.allowRetake;
  }

  ui.progress = {
    STORAGE_KEY: STORAGE_KEY,
    scopeKey: scopeKey,
    restore: restore,
    createStore: createStore,
    topicState: topicState,
    canStartNew: canStartNew,
    canRetry: canRetry,
    leavesFreely: leavesFreely,
    wholeTopicOnly: wholeTopicOnly
  };
})(typeof window !== 'undefined' ? window : globalThis);
