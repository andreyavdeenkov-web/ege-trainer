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

  /**
   * Попытка из сохранённого снимка или null, если снимок не подходит:
   * другая версия схемы, другая область, повреждённая структура.
   * Задания, которых больше нет в банке, из попытки убираются вместе с ответами.
   */
  function restore(snapshot, scope) {
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
    ['responses', 'results'].forEach(function (key) {
      Object.keys(attempt[key]).forEach(function (id) {
        if (attempt.taskIds.indexOf(id) === -1) delete attempt[key][id];
      });
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
        return restore(readAll()[scopeKey(scope)], scope);
      },
      /** Сохраняет копию попытки для области. */
      save: function (scope, attempt) {
        var all = readAll();
        all[scopeKey(scope)] = OLY.attempt.snapshot(attempt);
        backend.write(STORAGE_KEY, all);
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
