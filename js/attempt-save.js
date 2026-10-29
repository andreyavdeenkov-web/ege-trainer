/**
 * Сохранение незавершённой попытки в браузере (localStorage) и её восстановление.
 * Чистые функции без DOM: хранилище передаётся аргументом, поэтому модуль
 * работает и в браузере, и в Node.js (для тестов).
 *
 * Одна запись на «область» (scope): режим страницы + раздел + тема [+ практикум].
 *   ege/OBS/OBS-COG/OBS-COG-P01  — основной тренажёр, «Познание», Практикум № 1;
 *   ege/SOC/SOC-FAM              — до практикумов: тема «Семья и брак» целиком
 *                                  (такие записи переносятся в практикум, см. migrate);
 *   ege/all/all                  — до практикумов: все разделы;
 *   preview/preview/<id набора>  — страница предпросмотра.
 * Записи разных областей не пересекаются: у каждой свой ключ хранилища, поэтому
 * разные практикумы не перезаписывают прогресс друг друга.
 *
 * Запись:
 * {
 *   format: 'ege-attempt-save', saveVersion: 1, scope, savedAt,
 *   attempt,                      // попытка целиком (js/attempt.js)
 *   viewIndex,                    // задание на экране
 *   draft,                        // отметки в текущем, ещё не засчитанном задании
 *   tasks: { id: отпечаток }      // отпечатки заданий на момент старта
 * }
 *
 * Восстановление (load) ничему не верит на слово: попытка проигрывается заново
 * текущим движком (recordAnswer по сохранённым ответам). Запись отбрасывается,
 * если задание удалено, снято с выдачи или изменилось (отпечаток, version),
 * если ответ не проходит проверку или текущее оценивание даёт другие баллы
 * и ключ, если запись повреждена, устарела или от другой версии формата.
 * Отброшенная запись удаляется, ученик получает объяснение, а не прежние баллы.
 *
 * Результат практикума (одна попытка на практикум) — отдельная запись под ключом
 * RESULT_PREFIX + scope, рядом с незавершённой попыткой:
 * {
 *   format: 'ege-practicum-result', resultVersion: 1, scope, savedAt,
 *   attempt,                      // завершённая попытка: ответы и баллы на момент прохождения
 *   tasks: { id: { fingerprint, task } }  // копия каждого задания, как его видел ученик
 * }
 * Результат не пересчитывается и не устаревает, а записанный результат не перезаписывается
 * ни другой попыткой, ни незавершённой записью той же области (вторая вкладка).
 * Повреждённая запись результата не удаляется: практикум остаётся пройденным.
 * Разбор строится по текущему заданию, если его отпечаток не изменился (исправленные
 * объяснения доходят до ученика), иначе — по сохранённой копии (см. reviewTask).
 */
(function (root) {
  'use strict';

  var EGE = root.EGE || (root.EGE = {});

  var FORMAT = 'ege-attempt-save';
  var SAVE_VERSION = 1;
  var KEY_PREFIX = 'ege-trainer:attempt:';
  var RESULT_FORMAT = 'ege-practicum-result';
  var RESULT_VERSION = 1;
  var RESULT_PREFIX = 'ege-trainer:result:';
  /** Старше этого срока попытка не предлагается к продолжению. */
  var MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  /** Причины, по которым сохранение нельзя продолжить (продолжение фразы «Сохранённую тренировку нельзя продолжить: …»). */
  var REASONS = {
    corrupt: 'запись повреждена.',
    format: 'она записана в старом формате.',
    expired: 'она старше 30 дней.',
    tasks: 'задания этой тренировки с тех пор обновились.',
    scoring: 'правила оценивания или ключи заданий с тех пор изменились.',
    composition: 'состав заданий этой тренировки с тех пор изменился.'
  };

  /**
   * Область сохранения: mode — 'ege' (основной тренажёр) или 'preview'.
   * settings.practicum — id практикума: у каждого практикума своя запись.
   */
  function scopeId(mode, settings) {
    var s = settings || {};
    var parts = [mode, s.section || 'all', s.topic || 'all'];
    if (s.practicum) parts.push(s.practicum);
    return parts.join('/');
  }

  function storageKey(scope) {
    return KEY_PREFIX + scope;
  }

  function resultKey(scope) {
    return RESULT_PREFIX + scope;
  }

  /** Есть ли в хранилище запись результата области (любая, даже нечитаемая). */
  function hasResult(storage, scope) {
    if (!storage) return false;
    try { return storage.getItem(resultKey(scope)) != null; } catch (e) { return false; }
  }

  /** FNV-1a (32 бита) — короткий отпечаток строки. */
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /**
   * Отпечаток задания: всё, от чего зависят номера вариантов, ключ и баллы.
   * Объяснения не входят: их правка не делает сохранённые ответы неверными.
   */
  function taskFingerprint(task) {
    return hash(JSON.stringify({
      version: task.version || 1,
      type: task.type || 'multiple',
      kimTask: task.kimTask === undefined ? null : task.kimTask,
      oneToOne: !!task.oneToOne,
      question: task.question,
      statements: (task.statements || []).map(function (s) { return [s.text, !!s.correct]; }),
      items: (task.items || []).map(function (i) { return [i.text, i.match]; }),
      options: task.options || []
    }));
  }

  /** Запись для сохранения: копия попытки и отпечатки её заданий. */
  function buildRecord(options) {
    var attempt = options.attempt;
    var tasks = {};
    attempt.taskIds.forEach(function (id) {
      var task = options.getTask(id);
      if (task) tasks[id] = taskFingerprint(task);
    });
    return {
      format: FORMAT,
      saveVersion: SAVE_VERSION,
      scope: options.scope,
      savedAt: (options.now || new Date()).toISOString(),
      attempt: JSON.parse(JSON.stringify(attempt)),
      viewIndex: options.viewIndex,
      draft: options.draft == null ? null : JSON.parse(JSON.stringify(options.draft)),
      tasks: tasks
    };
  }

  /**
   * Не затирает ли запись более свежее состояние из другой вкладки: в хранилище
   * другая попытка той же области или та же попытка с бо́льшим числом ответов.
   */
  function isStale(storage, record) {
    var stored;
    try { stored = JSON.parse(storage.getItem(storageKey(record.scope))); } catch (e) { return false; }
    if (!stored || !stored.attempt || !Array.isArray(stored.attempt.answers)) return false;
    if (stored.attempt.id !== record.attempt.id) return true;
    return stored.attempt.answers.length > record.attempt.answers.length;
  }

  /**
   * Записывает запись; false — не записано: хранилище недоступно или переполнено
   * (тренировка продолжается), запись устарела (см. isStale) или у области уже есть
   * результат (практикум завершён, например, в другой вкладке).
   * options.force — новая или только что продолженная попытка: записать, если нет результата.
   */
  function write(storage, record, options) {
    if (!storage) return false;
    try {
      if (hasResult(storage, record.scope)) return false;
      if (!(options && options.force) && isStale(storage, record)) return false;
      storage.setItem(storageKey(record.scope), JSON.stringify(record));
      return true;
    } catch (e) {
      return false;
    }
  }

  function remove(storage, scope) {
    if (!storage) return;
    try { storage.removeItem(storageKey(scope)); } catch (e) { /* не критично */ }
  }

  function sameArray(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /** Тот же набор ID без учёта порядка (практикум с перемешиванием заданий). */
  function sameSet(a, b) {
    return sameArray(a.slice().sort(), b.slice().sort());
  }

  function isIsoDate(value) {
    return typeof value === 'string' && !isNaN(Date.parse(value));
  }

  /** Черновик текущего задания: проверяется по заданию; неверный просто не восстанавливается. */
  function cleanDraft(task, draft, scoring) {
    if (!Array.isArray(draft)) return null;
    var type = scoring.getTaskType(task);
    if (type === 'matching') {
      if (draft.length !== task.items.length) return null;
      var used = [];
      for (var i = 0; i < draft.length; i++) {
        var n = draft[i];
        if (n === null) continue;
        if (!Number.isInteger(n) || n < 1 || n > task.options.length) return null;
        if (task.oneToOne && used.indexOf(n) !== -1) return null;
        used.push(n);
      }
      return draft.slice();
    }
    var seen = [];
    for (var j = 0; j < draft.length; j++) {
      var k = draft[j];
      if (!Number.isInteger(k) || k < 1 || k > task.statements.length || seen.indexOf(k) !== -1) return null;
      seen.push(k);
    }
    if (type === 'exclude-two' && seen.length > scoring.EXCLUDE_COUNT) return null;
    return seen;
  }

  /**
   * Проверяет запись и проигрывает попытку текущим движком.
   * deps: { getTask, attempt: EGE.attempt, scoring: EGE.scoring, now?, taskIds?, anyOrder?,
   *         expires?, allowComplete? }.
   * taskIds — фиксированный состав набора (практикум, страница предпросмотра): попытка
   * восстанавливается, только если её задания совпадают с ним поштучно и по порядку;
   * anyOrder: true — порядок не важен (практикум, задания которого перемешиваются).
   * expires: false — запись не устаревает (практикумы: попытка одна, её нельзя потерять по сроку).
   * allowComplete: true — запись, в которой даны все ответы (вкладку закрыли после последнего
   * ответа, до итогов), принимается: complete: true, попытку нужно завершить (см. buildResult).
   * Результат: { ok: true, attempt, viewIndex, draft, savedAt, complete } или { ok: false, reason }.
   */
  function restore(record, scope, deps) {
    var A = deps.attempt;
    var scoring = deps.scoring;
    var fail = function (reason) { return { ok: false, reason: reason }; };

    if (!record || typeof record !== 'object') return fail('corrupt');
    if (record.format !== FORMAT || record.saveVersion !== SAVE_VERSION) return fail('format');
    if (record.scope !== scope) return fail('corrupt');
    if (!isIsoDate(record.savedAt)) return fail('corrupt');
    var now = deps.now || new Date();
    if (deps.expires !== false && now.getTime() - Date.parse(record.savedAt) > MAX_AGE_MS) return fail('expired');

    var saved = record.attempt;
    if (!saved || typeof saved !== 'object') return fail('corrupt');
    if (saved.schemaVersion !== A.SCHEMA_VERSION) return fail('format');
    if (saved.finishedAt !== null) return fail('corrupt');
    if (!Array.isArray(saved.taskIds) || !Array.isArray(saved.answers) || !isIsoDate(saved.startedAt)) return fail('corrupt');
    if (saved.answers.length > saved.taskIds.length) return fail('corrupt');
    if (saved.answers.length === saved.taskIds.length && !deps.allowComplete) return fail('corrupt');
    if (!record.tasks || typeof record.tasks !== 'object') return fail('corrupt');

    // Набор с фиксированным составом: попытка другого состава (или порядка) не продолжается.
    if (deps.taskIds) {
      var expected = Array.prototype.slice.call(deps.taskIds);
      var same = deps.anyOrder ? sameSet(saved.taskIds, expected) : sameArray(saved.taskIds, expected);
      if (!same) return fail('composition');
    }

    // Задания: на месте, выдаются и не изменились с момента старта.
    for (var i = 0; i < saved.taskIds.length; i++) {
      var id = saved.taskIds[i];
      var task = typeof id === 'string' ? deps.getTask(id) : null;
      if (!task || task.retired) return fail('tasks');
      if (record.tasks[id] !== taskFingerprint(task)) return fail('tasks');
    }

    // Попытка проигрывается заново: те же ID, порядок, ответы — баллы считает текущий движок.
    var attempt;
    try {
      attempt = A.createAttempt({
        id: saved.id,
        settings: saved.settings,
        taskIds: saved.taskIds,
        now: new Date(saved.startedAt)
      });
      for (var k = 0; k < saved.answers.length; k++) {
        var s = saved.answers[k];
        if (!s || s.taskId !== saved.taskIds[k] || !isIsoDate(s.answeredAt)) return fail('corrupt');
        var t = deps.getTask(s.taskId);
        if (s.taskVersion !== (t.version || 1)) return fail('tasks');
        var answer = A.recordAnswer(attempt, t, s.selected, new Date(s.answeredAt));
        if (answer.points !== s.points || answer.maxPoints !== s.maxPoints || !sameArray(answer.correct, s.correct)) {
          return fail('scoring');
        }
      }
    } catch (e) {
      return fail('corrupt');
    }
    if (scopeId(scope.split('/')[0], attempt.settings) !== scope) return fail('corrupt');

    var viewIndex = A.canView(attempt, record.viewIndex) ? record.viewIndex : A.lastReachableIndex(attempt);
    var complete = A.isComplete(attempt);
    var draft = complete ? null : cleanDraft(deps.getTask(attempt.taskIds[A.currentIndex(attempt)]), record.draft, scoring);
    return { ok: true, attempt: attempt, viewIndex: viewIndex, draft: draft, savedAt: record.savedAt, complete: complete };
  }

  /**
   * Читает и проверяет сохранение области.
   * { status: 'none' } — сохранения нет;
   * { status: 'ok', state } — можно продолжить (state — результат restore);
   * { status: 'invalid', reason, message } — запись отброшена и удалена.
   */
  function load(storage, scope, deps) {
    if (!storage) return { status: 'none' };
    var raw;
    try { raw = storage.getItem(storageKey(scope)); } catch (e) { return { status: 'none' }; }
    if (raw == null) return { status: 'none' };
    var record;
    try { record = JSON.parse(raw); } catch (e) { record = null; }
    var result = restore(record, scope, deps);
    if (result.ok) return { status: 'ok', state: result };
    remove(storage, scope);
    return { status: 'invalid', reason: result.reason, message: REASONS[result.reason] };
  }

  /**
   * Перенос незавершённой попытки из прежней области в новую — например, попытки
   * темы целиком (ege/OBS/OBS-ACT, до появления практикумов) в практикум этой темы
   * (ege/OBS/OBS-ACT/OBS-ACT-P01).
   * options: { from, to, settings, deps } — settings дописываются в attempt.settings
   * (например, { practicum: 'OBS-ACT-P01' }); deps — как у restore для новой области.
   *
   * Переносится только запись, которая полностью проходит проверку restore в новой
   * области (в том числе по составу практикума): тогда она записывается под новым
   * ключом, а прежняя удаляется. Во всех остальных случаях хранилище не меняется:
   * прежняя запись не удаляется и не портится, новая не создаётся.
   * Результат: { status: 'migrated' | 'none' | 'kept' | 'skipped', reason? }:
   * none — переносить нечего; skipped — в новой области уже есть своя запись;
   * kept — запись не подходит (reason — причина из REASONS) и оставлена как есть.
   */
  function migrate(storage, options) {
    if (!storage) return { status: 'none' };
    var raw;
    try {
      if (storage.getItem(storageKey(options.to)) != null) return { status: 'skipped' };
      raw = storage.getItem(storageKey(options.from));
    } catch (e) {
      return { status: 'none' };
    }
    if (raw == null) return { status: 'none' };
    var record;
    try { record = JSON.parse(raw); } catch (e) { return { status: 'kept', reason: 'corrupt' }; }
    if (!record || typeof record !== 'object' || record.scope !== options.from ||
        !record.attempt || typeof record.attempt !== 'object' || !record.attempt.settings) {
      return { status: 'kept', reason: 'corrupt' };
    }
    var moved = JSON.parse(raw);
    moved.scope = options.to;
    Object.keys(options.settings || {}).forEach(function (k) { moved.attempt.settings[k] = options.settings[k]; });
    var result = restore(moved, options.to, options.deps);
    if (!result.ok) return { status: 'kept', reason: result.reason };
    try {
      storage.setItem(storageKey(options.to), JSON.stringify(moved));
      storage.removeItem(storageKey(options.from));
    } catch (e) {
      // Новая запись не записалась (или прежняя не удалилась) — прежняя остаётся источником.
      try { storage.removeItem(storageKey(options.to)); } catch (e2) { /* не критично */ }
      return { status: 'kept', reason: 'corrupt' };
    }
    return { status: 'migrated' };
  }

  /* ---------- Результат практикума ---------- */

  function isInteger(n) {
    return typeof n === 'number' && Math.floor(n) === n;
  }

  /**
   * Запись результата: завершённая попытка (ответы и баллы — как засчитаны) и копия
   * каждого её задания с отпечатком. attempt должна быть завершена (finishedAt).
   */
  function buildResult(options) {
    var attempt = options.attempt;
    if (!attempt.finishedAt) throw new Error('Попытка не завершена');
    var tasks = {};
    attempt.taskIds.forEach(function (id) {
      var task = options.getTask(id);
      if (!task) throw new Error('Нет задания ' + id);
      tasks[id] = { fingerprint: taskFingerprint(task), task: JSON.parse(JSON.stringify(task)) };
    });
    return {
      format: RESULT_FORMAT,
      resultVersion: RESULT_VERSION,
      scope: options.scope,
      savedAt: (options.now || new Date()).toISOString(),
      attempt: JSON.parse(JSON.stringify(attempt)),
      tasks: tasks
    };
  }

  /**
   * Записывает результат. Записанный результат не перезаписывается: если у области уже
   * есть результат (другая вкладка, повторное завершение), возвращается 'exists',
   * а прежняя запись остаётся. 'saved' — записан; 'failed' — хранилище недоступно
   * или переполнено (записи незавершённой попытки в этом случае удалять нельзя).
   */
  function writeResult(storage, record) {
    if (!storage) return 'failed';
    try {
      if (storage.getItem(resultKey(record.scope)) != null) return 'exists';
      storage.setItem(resultKey(record.scope), JSON.stringify(record));
      return storage.getItem(resultKey(record.scope)) != null ? 'saved' : 'failed';
    } catch (e) {
      return 'failed';
    }
  }

  /** Проверка записи результата: форма, область, завершённая попытка, копии всех заданий. */
  function checkResult(record, scope) {
    if (!record || typeof record !== 'object') return false;
    if (record.format !== RESULT_FORMAT || record.resultVersion !== RESULT_VERSION) return false;
    if (record.scope !== scope || !isIsoDate(record.savedAt)) return false;
    var a = record.attempt;
    if (!a || typeof a !== 'object' || !isIsoDate(a.finishedAt) || !isIsoDate(a.startedAt)) return false;
    if (!Array.isArray(a.taskIds) || a.taskIds.length === 0 || !Array.isArray(a.answers)) return false;
    if (a.answers.length !== a.taskIds.length) return false;
    if (!record.tasks || typeof record.tasks !== 'object') return false;
    for (var i = 0; i < a.taskIds.length; i++) {
      var ans = a.answers[i];
      var entry = record.tasks[a.taskIds[i]];
      if (!ans || ans.taskId !== a.taskIds[i]) return false;
      if (!isInteger(ans.points) || !isInteger(ans.maxPoints) || ans.points < 0 || ans.points > ans.maxPoints) return false;
      if (!Array.isArray(ans.selected) || !Array.isArray(ans.correct)) return false;
      if (!entry || typeof entry.fingerprint !== 'string' || !entry.task || entry.task.id !== a.taskIds[i]) return false;
    }
    return true;
  }

  /**
   * Читает результат области.
   * { status: 'none' } — результата нет (или хранилище недоступно);
   * { status: 'ok', result } — запись результата;
   * { status: 'corrupt' } — запись есть, но прочитать её нельзя. Она не удаляется:
   * практикум считается пройденным, новая попытка не открывается.
   */
  function loadResult(storage, scope) {
    if (!storage) return { status: 'none' };
    var raw;
    try { raw = storage.getItem(resultKey(scope)); } catch (e) { return { status: 'none' }; }
    if (raw == null) return { status: 'none' };
    var record;
    try { record = JSON.parse(raw); } catch (e) { return { status: 'corrupt' }; }
    return checkResult(record, scope) ? { status: 'ok', result: record } : { status: 'corrupt' };
  }

  /**
   * Задание для разбора результата: текущее задание банка, если его отпечаток совпадает
   * с сохранённым (условие, варианты и ключ те же; исправленные объяснения показываются),
   * иначе — копия, которую видел ученик.
   */
  function reviewTask(record, id, getTask) {
    var entry = record.tasks[id];
    var current = getTask ? getTask(id) : null;
    if (current && taskFingerprint(current) === entry.fingerprint) return current;
    return entry.task;
  }

  var api = {
    FORMAT: FORMAT,
    SAVE_VERSION: SAVE_VERSION,
    KEY_PREFIX: KEY_PREFIX,
    RESULT_FORMAT: RESULT_FORMAT,
    RESULT_VERSION: RESULT_VERSION,
    RESULT_PREFIX: RESULT_PREFIX,
    MAX_AGE_MS: MAX_AGE_MS,
    REASONS: REASONS,
    scopeId: scopeId,
    storageKey: storageKey,
    resultKey: resultKey,
    hasResult: hasResult,
    taskFingerprint: taskFingerprint,
    buildRecord: buildRecord,
    write: write,
    remove: remove,
    restore: restore,
    load: load,
    migrate: migrate,
    buildResult: buildResult,
    writeResult: writeResult,
    loadResult: loadResult,
    reviewTask: reviewTask
  };

  EGE.attemptSave = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
