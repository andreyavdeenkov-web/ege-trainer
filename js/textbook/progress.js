/**
 * Учебник: прогресс ученика. Модель — чистые функции (работают и в Node.js),
 * хранение — localStorage (TXT.progressStorage). Сервер и аккаунты не нужны:
 * состояние — JSON из примитивов и id, его можно будет отправлять в БД через
 * точку расширения TXT.progressStore.onChange.
 *
 *   {
 *     schemaVersion: 1,
 *     chapters: {
 *       power: {
 *         answers:  { 'force/power-or-force/police': { value: 0, correct: true, at: '…' } },
 *         opened:   { 'structure/structure-flow': ['subject', 'object'] },  // что раскрыто в схемах и карточках
 *         finished: { intro: true },   // раздел пролистан до конца («Дальше»)
 *         visited:  { intro: true },
 *         last: 'intro'                // где ученик остановился
 *       }
 *     }
 *   }
 *
 * Раздел изучен: если в нём есть задания — когда на все дан ответ; если
 * заданий нет — когда ученик нажал «Дальше» в конце раздела.
 * Олимпиадные разделы (level: 'olympiad') в основной процент не входят и
 * считаются отдельно, чтобы ученик, который готовится только к ЕГЭ, мог
 * пройти главу на 100%.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT || (root.TXT = {});

  var SCHEMA_VERSION = 1;

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function create() {
    return { schemaVersion: SCHEMA_VERSION, chapters: {} };
  }

  function emptyChapter() {
    return { answers: {}, opened: {}, finished: {}, visited: {}, last: null };
  }

  /** Приводит сохранённые данные к корректному виду; мусор отбрасывается. */
  function normalize(raw) {
    var state = create();
    if (!isObject(raw) || raw.schemaVersion !== SCHEMA_VERSION || !isObject(raw.chapters)) return state;
    Object.keys(raw.chapters).forEach(function (id) {
      var src = raw.chapters[id];
      if (!isObject(src)) return;
      var ch = emptyChapter();
      if (isObject(src.answers)) {
        Object.keys(src.answers).forEach(function (k) {
          var a = src.answers[k];
          if (isObject(a) && 'value' in a && (a.correct === true || a.correct === false || a.correct === null)) {
            ch.answers[k] = { value: a.value, correct: a.correct, at: typeof a.at === 'string' ? a.at : null };
          }
        });
      }
      if (isObject(src.opened)) {
        Object.keys(src.opened).forEach(function (k) {
          if (Array.isArray(src.opened[k])) {
            ch.opened[k] = src.opened[k].filter(function (x) { return typeof x === 'string'; });
          }
        });
      }
      ['finished', 'visited'].forEach(function (field) {
        if (!isObject(src[field])) return;
        Object.keys(src[field]).forEach(function (k) { if (src[field][k] === true) ch[field][k] = true; });
      });
      if (typeof src.last === 'string') ch.last = src.last;
      state.chapters[id] = ch;
    });
    return state;
  }

  function chapterState(state, chapterId) {
    if (!state.chapters[chapterId]) state.chapters[chapterId] = emptyChapter();
    return state.chapters[chapterId];
  }

  function peek(state, chapterId) {
    return state.chapters[chapterId] || emptyChapter();
  }

  function getAnswer(state, chapterId, key) {
    return peek(state, chapterId).answers[key] || null;
  }

  /**
   * Засчитывает ответ. correct: true / false / null (задание без верного ответа).
   * Засчитанный ответ не меняется: возвращает false, если ответ уже есть.
   */
  function setAnswer(state, chapterId, key, value, correct, now) {
    var ch = chapterState(state, chapterId);
    if (ch.answers[key]) return false;
    ch.answers[key] = {
      value: value,
      correct: correct === true || correct === false ? correct : null,
      at: now || new Date().toISOString()
    };
    return true;
  }

  /** Сбрасывает ответы (например, чтобы пройти проверку заново). */
  function clearAnswers(state, chapterId, keys) {
    var ch = chapterState(state, chapterId);
    keys.forEach(function (k) { delete ch.answers[k]; });
  }

  function isOpened(state, chapterId, blockKey, itemId) {
    var list = peek(state, chapterId).opened[blockKey];
    return !!list && list.indexOf(itemId) !== -1;
  }

  function openedCount(state, chapterId, blockKey) {
    var list = peek(state, chapterId).opened[blockKey];
    return list ? list.length : 0;
  }

  /** Отмечает раскрытый элемент схемы или карточку; true — если это впервые. */
  function open(state, chapterId, blockKey, itemId) {
    var ch = chapterState(state, chapterId);
    var list = ch.opened[blockKey] || (ch.opened[blockKey] = []);
    if (list.indexOf(itemId) !== -1) return false;
    list.push(itemId);
    return true;
  }

  function visit(state, chapterId, sectionId) {
    var ch = chapterState(state, chapterId);
    ch.visited[sectionId] = true;
    ch.last = sectionId;
  }

  function finish(state, chapterId, sectionId) {
    chapterState(state, chapterId).finished[sectionId] = true;
  }

  /** Сколько заданий раздела ещё без ответа. */
  function pendingCount(state, chapter, section) {
    var answers = peek(state, chapter.id).answers;
    return TXT.sectionKeys(section).filter(function (k) { return !answers[k.key]; }).length;
  }

  /** 'new' | 'started' | 'done'. */
  function sectionStatus(state, chapter, section) {
    var ch = peek(state, chapter.id);
    var keys = TXT.sectionKeys(section);
    var answered = keys.filter(function (k) { return !!ch.answers[k.key]; }).length;
    var done = keys.length > 0 ? answered === keys.length : !!ch.finished[section.id];
    if (done) return 'done';
    if (ch.visited[section.id] || answered > 0) return 'started';
    return 'new';
  }

  function tally(state, chapter, sections) {
    var done = sections.filter(function (s) { return sectionStatus(state, chapter, s) === 'done'; }).length;
    return {
      done: done,
      total: sections.length,
      percent: sections.length ? Math.round((done / sections.length) * 100) : 0
    };
  }

  /**
   * Прогресс главы: { done, total, percent, olympiad: { done, total, percent } | null,
   *                   started, next } — next: раздел для кнопки «Продолжить».
   */
  function chapterSummary(state, chapter) {
    var ch = peek(state, chapter.id);
    var core = chapter.sections.filter(TXT.isCoreSection);
    var olymp = chapter.sections.filter(function (s) { return s.level === 'olympiad' && s.progress !== false; });
    var result = tally(state, chapter, core);
    result.olympiad = olymp.length ? tally(state, chapter, olymp) : null;
    result.started = Object.keys(ch.visited).length > 0 || Object.keys(ch.answers).length > 0;

    var tracked = chapter.sections.filter(function (s) { return s.progress !== false; });
    var next = null;
    var last = ch.last ? TXT.getSection(chapter, ch.last) : null;
    if (last && last.progress !== false && sectionStatus(state, chapter, last) !== 'done') {
      next = last;
    } else {
      for (var i = 0; i < tracked.length; i++) {
        if (sectionStatus(state, chapter, tracked[i]) !== 'done') { next = tracked[i]; break; }
      }
    }
    if (!next) next = chapter.sections[chapter.sections.length - 1];
    result.next = next.id;
    return result;
  }

  /**
   * Итоги по финальной проверке:
   *   final:    { sectionId, total, answered, correct, complete }
   *   mastered: разделы, по которым все вопросы финальной проверки решены верно;
   *   review:   разделы с ошибками в финальной проверке — их стоит повторить;
   *   mistakes: [{ questionId, text, ref }] — вопросы с ошибкой;
   *   unfinished: разделы (кроме итогов), которые ещё не изучены.
   * Порядок разделов — как в главе.
   */
  function report(state, chapter) {
    var found = TXT.findFinalQuiz(chapter);
    var answers = peek(state, chapter.id).answers;
    var out = { final: null, mastered: [], review: [], mistakes: [], unfinished: [] };

    chapter.sections.forEach(function (s) {
      if (s.progress !== false && sectionStatus(state, chapter, s) !== 'done') out.unfinished.push(s.id);
    });
    if (!found) return out;

    var byRef = Object.create(null);
    var answered = 0;
    var correct = 0;
    found.block.questions.forEach(function (q) {
      var a = answers[TXT.key(found.section.id, found.block.id, q.id)];
      var bucket = byRef[q.ref] || (byRef[q.ref] = { total: 0, answered: 0, wrong: 0 });
      bucket.total += 1;
      if (!a) return;
      answered += 1;
      bucket.answered += 1;
      if (a.correct) correct += 1;
      else {
        bucket.wrong += 1;
        out.mistakes.push({ questionId: q.id, text: q.text, ref: q.ref });
      }
    });

    var total = found.block.questions.length;
    out.final = { sectionId: found.section.id, total: total, answered: answered, correct: correct, complete: answered === total };
    chapter.sections.forEach(function (s) {
      var b = byRef[s.id];
      if (!b) return;
      if (b.wrong > 0) out.review.push(s.id);
      else if (b.answered === b.total) out.mastered.push(s.id);
    });
    return out;
  }

  function reset(state, chapterId) {
    state.chapters[chapterId] = emptyChapter();
  }

  TXT.progress = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    create: create,
    normalize: normalize,
    getAnswer: getAnswer,
    setAnswer: setAnswer,
    clearAnswers: clearAnswers,
    isOpened: isOpened,
    openedCount: openedCount,
    open: open,
    visit: visit,
    finish: finish,
    pendingCount: pendingCount,
    sectionStatus: sectionStatus,
    chapterSummary: chapterSummary,
    report: report,
    reset: reset
  };

  /** Хранение в браузере. Если localStorage недоступен, прогресс живёт до перезагрузки. */
  TXT.progressStorage = {
    KEY: 'textbook:progress:v1',
    load: function () {
      try {
        return normalize(JSON.parse(root.localStorage.getItem(this.KEY)));
      } catch (e) {
        return create();
      }
    },
    save: function (state) {
      try {
        root.localStorage.setItem(this.KEY, JSON.stringify(state));
      } catch (e) { /* не критично */ }
    }
  };

  /** Точка расширения для будущей синхронизации с сервером. Сейчас ничего не делает. */
  TXT.progressStore = TXT.progressStore || {
    onChange: function (state, chapterId) { /* копия состояния после каждого изменения */ }
  };
})(typeof window !== 'undefined' ? window : globalThis);
