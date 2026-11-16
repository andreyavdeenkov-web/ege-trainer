/**
 * Интерфейс итогового практикума по теме (kind: 'final'): карточка в каталоге темы,
 * итоговая работа и итоги. Логика, оценивание, аналитика и сохранение — js/final-session.js;
 * отрисовка заданий и разбора — общая js/task-view.js; каркас карточки, экраны и шапка —
 * js/app.js, который вызывает EGE.finalPracticum.init(env) и fillCard(frame).
 *
 * До завершения работы в разметке нет ни ключей, ни статусов «верно/неверно», ни объяснений:
 * варианты рисуются только для выбора.
 */
(function () {
  'use strict';

  var EGE = window.EGE;
  var scoring = EGE.scoring;
  var F = EGE.finalSession;
  var save = EGE.attemptSave;
  var view = EGE.taskView;
  var el = view.el;

  var HINTS = {
    'multiple': 'Отметьте все верные суждения. Можно выбрать несколько вариантов.',
    'multiple-items': 'Выберите все подходящие варианты.',
    'exclude-two': 'Отметьте ровно две позиции, которые «выпадают» из общего ряда.',
    'matching': 'Напротив каждой позиции выберите номер из второго столбца.'
  };
  var FORMAT_TITLES = {};
  F.FORMATS.forEach(function (f) { FORMAT_TITLES[f.id] = f.title; });

  var env = null;
  var screens = {};
  var state = {
    practicum: null,
    session: null,
    matchRow: 0,
    confirmFinish: false,
    result: null      // { session, rows, analytics, changed, note }
  };

  function storage() { return env.storage; }

  function scopeOf(practicum) {
    return save.scopeId('ege', { section: practicum.section, topic: practicum.topic, practicum: practicum.id });
  }

  function deps(practicum) {
    return {
      getTask: EGE.getTask,
      fingerprint: save.taskFingerprint,
      taskIds: practicum.taskIds,
      scope: scopeOf(practicum)
    };
  }

  /** Есть ли незавершённая итоговая работа (без проверки — её делает карточка). */
  function hasProgress(practicum) {
    if (!EGE.isFinalPracticum(practicum) || !storage()) return false;
    try { return storage().getItem(F.sessionKey(scopeOf(practicum))) !== null; } catch (e) { return false; }
  }

  function isStorageKey(key) {
    return typeof key === 'string' && (key.indexOf(F.KEY_PREFIX) === 0 || key.indexOf(F.RESULT_PREFIX) === 0 ||
      key.indexOf(F.HISTORY_PREFIX) === 0);
  }

  function button(className, text, onClick) {
    var btn = el('button', 'btn ' + className, text);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function plural(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function typeOf(task) { return scoring.getTaskType(task); }

  /* ---------- Карточка в каталоге темы ---------- */

  /**
   * Заполняет карточку итогового практикума (каркас — js/app.js): метка «Итоговый»,
   * описание, состояние и кнопки «Начать итоговую работу» / «Продолжить», «Посмотреть результаты».
   */
  function fillCard(frame) {
    var practicum = EGE.getPracticum(frame.card.getAttribute('data-practicum'));
    var d = deps(practicum);
    frame.card.classList.add('practicum-card--final');
    frame.head.insertBefore(el('span', 'practicum-card__kind', 'Итоговый'), frame.head.firstChild);
    frame.card.appendChild(el('p', 'practicum-card__note',
      'Итоговая работа по теме: все задания без проверки — к ним можно возвращаться, менять ответы и пропускать. ' +
      'Балл, подробный разбор и аналитика ошибок — после завершения.'));

    var loaded = F.load(storage(), d);
    var history = F.loadHistory(storage(), d.scope);
    var last = F.loadResult(storage(), d);
    var actions = frame.actions;

    if (loaded.status === 'invalid') {
      var notice = el('p', 'practicum-card__notice', 'Незавершённую итоговую работу нельзя продолжить: ' + loaded.message + ' Начните заново.');
      notice.setAttribute('role', 'status');
      frame.card.appendChild(notice);
    }
    var sum = F.progressSummary(history);
    if (sum) {
      frame.head.appendChild(el('span', 'practicum-card__status practicum-card__status--done', 'Выполнен'));
      frame.card.appendChild(el('p', 'practicum-card__result', 'Последний результат: ' + resultText(sum.last) +
        ' · ' + env.formatDate(sum.last.finishedAt)));
      if (sum.count > 1) {
        var line = el('p', 'practicum-card__progress final-card__history');
        line.textContent = 'Попыток: ' + sum.count + ' · первая: ' + scoreText(sum.first) +
          ' · лучшая: ' + scoreText(sum.best) + ' · ' + deltaText(sum.sinceFirst) + ' с первой попытки';
        frame.card.appendChild(line);
      }
    }

    if (loaded.status === 'ok') {
      var s = loaded.session;
      frame.head.appendChild(el('span', 'practicum-card__status', 'Не завершён'));
      frame.card.appendChild(el('p', 'practicum-card__progress', 'Отвечено ' + F.answeredCount(s, EGE.getTask) +
        ' из ' + s.taskIds.length + ' · сохранено ' + env.formatDate(s.updatedAt)));
      actions.appendChild(button('btn--primary final-card__continue', 'Продолжить', function () {
        openRun(practicum, s);
      }));
      restartControl(frame, practicum);
    } else {
      actions.appendChild(button('btn--primary final-card__start', 'Начать итоговую работу', function () {
        start(practicum);
      }));
    }
    if (last.status === 'ok') {
      actions.appendChild(button('btn--ghost final-card__results', 'Посмотреть результаты', function () {
        openResult(practicum, last.session, last.changed, null);
      }));
    }
  }

  /** «27 из 35 баллов (77%)» */
  function resultText(h) {
    return scoring.formatPointsOutOf(h.score, h.max) + ' (' + scoring.percent(h.score, h.max) + '%)';
  }

  /** «27 из 35» */
  function scoreText(h) {
    return h.score + ' из ' + h.max;
  }

  /** «+3 балла», «−1 балл», «без изменений» */
  function deltaText(d) {
    if (d === 0) return 'без изменений';
    var n = Math.abs(d);
    return (d > 0 ? '+' : '−') + n + ' ' + scoring.pluralPoints(n);
  }

  /** «Начать заново» с подтверждением: незавершённая работа удаляется (итоги прежних попыток остаются). */
  function restartControl(frame, practicum) {
    var actions = frame.actions;
    var open = button('btn--ghost final-card__restart', 'Начать заново', function () {
      open.hidden = true;
      confirm.hidden = false;
      confirm.querySelector('.final-card__confirm-yes').focus();
    });
    var confirm = el('div', 'practicum-card__confirm');
    confirm.hidden = true;
    confirm.setAttribute('role', 'group');
    var text = el('p', 'practicum-card__confirm-text', 'Незавершённая работа будет удалена, результаты завершённых попыток сохранятся. Начать заново?');
    text.id = 'final-' + practicum.id + '-confirm';
    confirm.setAttribute('aria-labelledby', text.id);
    confirm.appendChild(text);
    var row = el('div', 'practicum-card__confirm-actions');
    row.appendChild(button('btn--primary final-card__confirm-yes', 'Начать заново', function () {
      F.discard(storage(), scopeOf(practicum));
      start(practicum);
    }));
    row.appendChild(button('btn--ghost final-card__confirm-no', 'Отмена', function () {
      confirm.hidden = true;
      open.hidden = false;
      open.focus();
    }));
    confirm.appendChild(row);
    actions.appendChild(open);
    actions.appendChild(confirm);
  }

  /* ---------- Итоговая работа ---------- */

  function start(practicum) {
    if (!EGE.isPracticumReady(practicum)) { env.showStart(); return; }
    var session = F.create({
      practicum: practicum.id, scope: scopeOf(practicum),
      taskIds: practicum.taskIds, getTask: EGE.getTask, fingerprint: save.taskFingerprint
    });
    F.save(storage(), session, { force: true });
    openRun(practicum, session);
  }

  function openRun(practicum, session) {
    state.practicum = practicum;
    state.session = session;
    state.matchRow = 0;
    state.confirmFinish = false;
    state.result = null;
    F.save(storage(), session, { force: true });
    buildRun();
    env.showScreen('final');
    renderRun();
  }

  function persist() {
    if (state.session && !state.session.finishedAt) F.save(storage(), state.session);
  }

  var run = {};

  function buildRun() {
    var root = screens.run;
    root.textContent = '';

    var top = el('div', 'final-top');
    run.title = el('p', 'quiz-title final-top__title', EGE.practicumTitle(state.practicum));
    run.title.id = 'final-run-title';
    top.appendChild(run.title);
    top.appendChild(button('btn--ghost btn--sm final-top__exit', 'К выбору практикума', function () { env.showStart(); }));
    root.appendChild(top);
    root.appendChild(el('p', 'final-banner',
      'Итоговая работа: правильные ответы и разбор появятся после завершения. Ответы можно менять до конца работы.'));

    var progress = el('div', 'progress');
    var row = el('div', 'progress__row');
    run.label = el('span', 'progress__label');
    run.label.id = 'final-progress-label';
    run.pill = el('span', 'score-pill');
    run.pill.id = 'final-pill';
    row.appendChild(run.label);
    row.appendChild(run.pill);
    progress.appendChild(row);
    run.track = el('div', 'progress__track');
    run.track.setAttribute('role', 'progressbar');
    run.track.setAttribute('aria-valuemin', '0');
    run.track.setAttribute('aria-label', 'Прогресс');
    run.fill = el('div', 'progress__fill');
    run.track.appendChild(run.fill);
    progress.appendChild(run.track);
    var nav = el('nav', 'task-nav');
    nav.setAttribute('aria-label', 'Задания итоговой работы');
    run.nav = el('ol', 'task-nav__list');
    run.nav.id = 'final-nav';
    nav.appendChild(run.nav);
    progress.appendChild(nav);
    root.appendChild(progress);

    var card = el('article', 'panel task');
    card.id = 'final-task';
    run.card = card;
    var meta = el('div', 'task__meta');
    run.chip = el('span', 'chip');
    run.format = el('span', 'chip chip--format');
    meta.appendChild(run.chip);
    meta.appendChild(run.format);
    card.appendChild(meta);
    run.question = el('h2', 'task__question');
    run.question.id = 'final-question';
    card.appendChild(run.question);
    run.hint = el('p', 'task__hint');
    run.hint.id = 'final-hint';
    run.hint.setAttribute('aria-live', 'polite');
    card.appendChild(run.hint);
    run.statements = el('ol', 'statements');
    run.statements.id = 'final-statements';
    card.appendChild(run.statements);
    run.matching = el('div', 'matching');
    run.matching.id = 'final-matching';
    card.appendChild(run.matching);
    run.instruction = el('p', 'task__instruction');
    card.appendChild(run.instruction);

    var actions = el('div', 'task__actions');
    run.prev = button('btn--ghost btn--lg', '← Назад', function () { go(state.session.viewIndex - 1); });
    run.prev.id = 'final-prev';
    run.clear = button('btn--ghost btn--lg', 'Очистить ответ', clearResponse);
    run.clear.id = 'final-clear';
    run.primary = button('btn--primary btn--lg', '', primaryAction);
    run.primary.id = 'final-primary';
    actions.appendChild(run.prev);
    actions.appendChild(run.clear);
    actions.appendChild(el('span', 'task__actions-spacer'));
    actions.appendChild(run.primary);
    card.appendChild(actions);
    var kbd = el('p', 'kbd-hint');
    kbd.setAttribute('aria-hidden', 'true');
    kbd.innerHTML = 'Клавиши <kbd>1</kbd>–<kbd>9</kbd> отмечают позиции (в соответствии — номер для выделенной позиции), ' +
      '<kbd>Enter</kbd> — следующее задание, <kbd>←</kbd> <kbd>→</kbd> — переход между заданиями';
    card.appendChild(kbd);
    root.appendChild(card);

    run.finish = el('div', 'panel final-finish');
    run.finish.id = 'final-finish';
    root.appendChild(run.finish);
  }

  function currentTask() {
    return EGE.getTask(state.session.taskIds[state.session.viewIndex]);
  }

  function hintFor(task, selected) {
    var type = typeOf(task);
    var hint = HINTS[type === 'multiple' && task.choiceOf === 'items' ? 'multiple-items' : type];
    if (type === 'exclude-two') hint += ' Выбрано: ' + selected.length + ' из ' + scoring.EXCLUDE_COUNT + '.';
    return hint;
  }

  function renderRun() {
    var s = state.session;
    var task = currentTask();
    var selected = F.getResponse(s, task);
    var isMatching = typeOf(task) === 'matching';

    run.chip.textContent = view.topicLabel(task);
    run.chip.style.setProperty('--topic-color', EGE.getSection(task.section).color);
    run.format.textContent = FORMAT_TITLES[task.bankFormat] || '';
    run.format.hidden = !task.bankFormat;
    run.question.textContent = task.question;
    run.instruction.textContent = task.instruction || '';
    run.instruction.hidden = !task.instruction;
    run.hint.textContent = hintFor(task, selected);

    run.statements.hidden = isMatching;
    run.matching.hidden = !isMatching;
    if (isMatching) {
      run.statements.textContent = '';
      renderMatchingBox(task, selected);
    } else {
      run.matching.textContent = '';
      view.renderStatements(run.statements, task, { selected: selected, onToggle: toggle });
    }
    renderActions(task, selected);
    renderProgress();
    renderNav();
    renderFinish();
  }

  function renderMatchingBox(task, selected) {
    view.renderMatching(run.matching, task, { selected: selected, activeRow: state.matchRow, onChoose: choose });
  }

  function renderActions(task, selected) {
    var s = state.session;
    run.prev.hidden = s.viewIndex === 0;
    run.clear.hidden = !F.isFilled(task, selected);
    run.primary.textContent = s.viewIndex < s.taskIds.length - 1 ? 'Следующее задание' : 'К завершению';
  }

  function renderProgress() {
    var s = state.session;
    var total = s.taskIds.length;
    var done = F.answeredCount(s, EGE.getTask);
    run.label.textContent = 'Задание ' + (s.viewIndex + 1) + ' из ' + total + ' · отвечено ' + done;
    run.pill.textContent = 'Без ответа: ' + (total - done);
    run.fill.style.width = (done / total) * 100 + '%';
    run.track.setAttribute('aria-valuemax', String(total));
    run.track.setAttribute('aria-valuenow', String(done));
  }

  function renderNav() {
    var s = state.session;
    var active = null;
    run.nav.textContent = '';
    s.taskIds.forEach(function (id, i) {
      var li = el('li');
      var btn = el('button', 'task-nav__item', String(i + 1));
      btn.type = 'button';
      var answered = F.isFilled(EGE.getTask(id), s.responses[id]);
      if (answered) btn.classList.add('is-answered');
      var label = 'Задание ' + (i + 1) + ': ' + (answered ? 'есть ответ' : 'без ответа');
      if (i === s.viewIndex) {
        btn.classList.add('is-viewed');
        btn.setAttribute('aria-current', 'step');
        active = btn;
      }
      btn.setAttribute('aria-label', label);
      btn.title = label;
      btn.addEventListener('click', function () { go(i); });
      li.appendChild(btn);
      run.nav.appendChild(li);
    });
    if (active) {
      var list = run.nav;
      var left = active.offsetLeft;
      if (left < list.scrollLeft || left + active.offsetWidth > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = left - (list.clientWidth - active.offsetWidth) / 2;
      }
    }
  }

  function renderFinish() {
    var box = run.finish;
    box.textContent = '';
    box.removeAttribute('role');
    box.removeAttribute('aria-labelledby');
    var missing = F.unanswered(state.session, EGE.getTask);
    if (!state.confirmFinish) {
      box.appendChild(el('p', 'final-finish__text', missing.length
        ? 'Без ответа: ' + missing.length + ' ' + plural(missing.length, 'задание', 'задания', 'заданий') + '. Завершить работу можно в любой момент.'
        : 'Ответы даны на все задания. Проверьте их и завершите работу.'));
      box.appendChild(button('btn--ghost final-finish__open', 'Завершить работу', function () {
        state.confirmFinish = true;
        renderFinish();
        box.querySelector('.final-finish__confirm').focus();
      }));
      return;
    }
    box.setAttribute('role', 'group');
    var text = el('p', 'final-finish__text final-finish__warn', missing.length
      ? 'Без ответа останутся задания: ' + missing.join(', ') + ' — за них 0 баллов. После завершения ответы изменить нельзя. Завершить работу?'
      : 'После завершения ответы изменить нельзя. Завершить работу?');
    text.id = 'final-finish-text';
    box.setAttribute('aria-labelledby', text.id);
    box.appendChild(text);
    var row = el('div', 'practicum-card__confirm-actions');
    row.appendChild(button('btn--primary final-finish__confirm', 'Завершить и посмотреть результаты', finishSession));
    row.appendChild(button('btn--ghost final-finish__cancel', 'Вернуться к заданиям', function () {
      state.confirmFinish = false;
      renderFinish();
      box.querySelector('.final-finish__open').focus();
    }));
    box.appendChild(row);
  }

  function go(index) {
    var s = state.session;
    if (index === s.viewIndex || !F.setView(s, index)) return;
    state.matchRow = 0;
    persist();
    renderRun();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** После изменения ответа: подсказка, кнопки, прогресс, полоса номеров, панель завершения. */
  function afterChange(task, selected) {
    persist();
    run.hint.textContent = hintFor(task, selected);
    renderActions(task, selected);
    renderProgress();
    renderNav();
    renderFinish();
  }

  function toggle(number) {
    var task = currentTask();
    var selected = F.getResponse(state.session, task);
    var pos = selected.indexOf(number);
    if (pos === -1) {
      if (typeOf(task) === 'exclude-two' && selected.length >= scoring.EXCLUDE_COUNT) {
        run.hint.textContent = 'Можно отметить только две позиции — снимите одну отметку, чтобы выбрать другую.';
        return;
      }
      selected.push(number);
    } else {
      selected.splice(pos, 1);
    }
    selected = F.setResponse(state.session, task, selected);
    view.setStatementSelected(run.statements, number, pos === -1);
    afterChange(task, selected);
  }

  function choose(row, number) {
    var task = currentTask();
    var selected = F.getResponse(state.session, task);
    if (selected[row] === number) {
      selected[row] = null;
      state.matchRow = row;
    } else {
      if (task.oneToOne) {
        var other = selected.indexOf(number);
        if (other !== -1) selected[other] = null;
      }
      selected[row] = number;
      state.matchRow = nextEmptyRow(selected, row);
    }
    selected = F.setResponse(state.session, task, selected);
    renderMatchingBox(task, selected);
    afterChange(task, selected);
  }

  function nextEmptyRow(selected, row) {
    for (var k = 1; k <= selected.length; k++) {
      var i = (row + k) % selected.length;
      if (selected[i] === null) return i;
    }
    return row;
  }

  function clearResponse() {
    var task = currentTask();
    F.setResponse(state.session, task, F.emptyResponse(task));
    state.matchRow = 0;
    persist();
    renderRun();
  }

  function primaryAction() {
    var s = state.session;
    if (s.viewIndex < s.taskIds.length - 1) {
      go(s.viewIndex + 1);
      return;
    }
    state.confirmFinish = true;
    renderFinish();
    var c = run.finish.querySelector('.final-finish__confirm');
    if (c) { c.focus({ preventScroll: true }); run.finish.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  function finishSession() {
    var s = state.session;
    F.finish(s, new Date(), EGE.getTask);
    var rows = F.results(s, EGE.getTask);
    var status = F.complete(storage(), s, F.summary(s, F.analytics(rows, state.practicum.criteria)));
    var store = EGE.attemptStore;
    if (store && typeof store.onFinish === 'function') {
      try { store.onFinish(JSON.parse(JSON.stringify(s))); } catch (e) {
        if (window.console) console.error('EGE.attemptStore.onFinish:', e);
      }
    }
    openResult(state.practicum, s, [], status === 'failed'
      ? 'Результат не удалось сохранить в этом браузере (хранилище недоступно или переполнено): он доступен, пока открыта эта страница.'
      : null);
  }

  /* ---------- Итоги ---------- */

  function resultMessage(pct) {
    if (pct === 100) return 'Идеально! Все ответы верные.';
    if (pct >= 80) return 'Отличный результат! Осталось разобрать несколько неточностей.';
    if (pct >= 50) return 'Неплохо, но есть над чем поработать. Перечитайте объяснения к ошибкам.';
    return 'Стоит повторить тему и разобрать ошибки по объяснениям ниже.';
  }

  function openResult(practicum, session, changed, note) {
    state.practicum = practicum;
    state.session = null;
    var rows = F.results(session, EGE.getTask, changed);
    state.result = {
      session: session, rows: rows, changed: changed || [], note: note,
      analytics: F.analytics(rows, practicum.criteria)
    };
    renderResult();
    env.showScreen('finalResult');
  }

  function statTile(value, label, cls) {
    var li = el('li', 'final-stat ' + (cls || ''));
    li.appendChild(el('span', 'final-stat__value', String(value)));
    li.appendChild(el('span', 'final-stat__label', label));
    return li;
  }

  function renderResult() {
    var r = state.result;
    var s = r.session;
    var total = r.analytics.total;
    var root = screens.result;
    root.textContent = '';

    var panel = el('div', 'panel result');
    var ring = el('div', 'result__ring ' + (total.percent >= 80 ? 'is-high' : total.percent >= 50 ? 'is-mid' : 'is-low'));
    ring.setAttribute('aria-hidden', 'true');
    ring.style.setProperty('--pct', String(total.percent));
    ring.appendChild(el('span', null, total.percent + '%'));
    panel.appendChild(ring);
    var title = el('h2', 'result__title', 'Итоговая работа завершена');
    title.id = 'final-result-title';
    panel.appendChild(title);
    panel.appendChild(el('p', 'result__context', EGE.practicumTitle(state.practicum)));
    var score = el('p', 'result__score', scoring.formatPointsOutOf(total.points, total.max));
    score.id = 'final-result-score';
    panel.appendChild(score);
    panel.appendChild(el('p', 'result__message', resultMessage(total.percent)));

    var stats = el('ul', 'final-stats');
    stats.id = 'final-stats';
    stats.appendChild(statTile(total.full, 'полностью верно', 'final-stat--full'));
    stats.appendChild(statTile(total.partial, 'частично верно', 'final-stat--partial'));
    stats.appendChild(statTile(total.zero, '0 баллов' + (total.skipped ? ', из них без ответа: ' + total.skipped : ''), 'final-stat--none'));
    panel.appendChild(stats);
    panel.appendChild(el('p', 'result__fixed', 'Завершено ' + env.formatDate(s.finishedAt)));
    if (r.changed.length) {
      var ch = el('p', 'result__note', 'Некоторые задания с тех пор обновились: их баллы показаны такими, какими были при завершении, а разбор недоступен.');
      ch.setAttribute('role', 'status');
      panel.appendChild(ch);
    }
    if (r.note) {
      var note = el('p', 'result__note', r.note);
      note.setAttribute('role', 'status');
      panel.appendChild(note);
    }
    var actions = el('div', 'result__actions');
    actions.appendChild(button('btn--primary btn--lg final-result__again', 'Пройти ещё раз', function () {
      var practicum = state.practicum;
      var saved = F.load(storage(), deps(practicum));
      if (saved.status === 'ok') openRun(practicum, saved.session);
      else start(practicum);
    }));
    actions.appendChild(button('btn--ghost btn--lg final-result__home', 'К выбору практикума', function () { env.showStart(); }));
    panel.appendChild(actions);
    root.appendChild(panel);

    var hist = historyPanel(s);
    if (hist) root.appendChild(hist);
    root.appendChild(analyticsPanel(r.analytics));
    root.appendChild(reviewPanel());
  }

  /**
   * История попыток: первая, последняя и лучшая, изменение и все попытки по порядку
   * (шкала — процент от максимума). Текущая попытка отмечена.
   */
  function historyPanel(session) {
    var sum = F.progressSummary(F.loadHistory(storage(), session.scope));
    if (!sum) return null;
    var panel = el('section', 'panel final-history');
    panel.id = 'final-history';
    var h = el('h3', 'section-title', 'История попыток');
    h.id = 'final-history-title';
    panel.setAttribute('aria-labelledby', h.id);
    panel.appendChild(h);

    var tiles = el('ul', 'final-stats final-history__summary');
    tiles.id = 'final-history-summary';
    tiles.appendChild(statTile(scoreText(sum.first), 'первая попытка', 'final-stat--muted'));
    tiles.appendChild(statTile(scoreText(sum.last), 'последняя попытка', 'final-stat--muted'));
    tiles.appendChild(statTile(scoreText(sum.best), 'лучший результат', 'final-stat--muted'));
    panel.appendChild(tiles);
    if (sum.count > 1) {
      panel.appendChild(el('p', 'final-history__delta', 'С первой попытки: ' + deltaText(sum.sinceFirst) +
        ' · с предыдущей: ' + deltaText(sum.sincePrevious) + '.'));
    }

    var list = el('ol', 'meter-list final-history__list');
    list.id = 'final-history-list';
    sum.attempts.forEach(function (a, i) {
      var li = el('li', 'meter' + (a.id === session.id ? ' is-current' : ''));
      var head = el('div', 'meter__head');
      var label = 'Попытка ' + (i + 1) + ' · ' + env.formatDate(a.finishedAt);
      if (a.id === session.id) label += ' · эта попытка';
      if (i === sum.bestIndex) label += ' · лучшая';
      head.appendChild(el('span', 'meter__title', label));
      head.appendChild(el('span', 'meter__value', scoring.formatPointsOutOf(a.score, a.max) + ' · ' + scoring.percent(a.score, a.max) + '%'));
      li.appendChild(head);
      var track = el('div', 'meter__track');
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', 'Попытка ' + (i + 1) + ': ' + scoring.percent(a.score, a.max) + '% баллов');
      var fill = el('div', 'meter__fill');
      fill.style.width = scoring.percent(a.score, a.max) + '%';
      track.appendChild(fill);
      li.appendChild(track);
      list.appendChild(li);
    });
    panel.appendChild(list);
    return panel;
  }

  function meterGroup(title, groups, id) {
    var box = el('section', 'final-analytics__group');
    box.id = id;
    var h = el('h4', 'final-analytics__title', title);
    h.id = id + '-title';
    box.setAttribute('aria-labelledby', h.id);
    box.appendChild(h);
    var list = el('ul', 'meter-list');
    groups.forEach(function (g) {
      var li = el('li', 'meter');
      li.setAttribute('data-group', String(g.id));
      var head = el('div', 'meter__head');
      head.appendChild(el('span', 'meter__title', g.title));
      head.appendChild(el('span', 'meter__value', scoring.formatPointsOutOf(g.points, g.max) + ' · ' + g.percent + '%'));
      li.appendChild(head);
      var track = el('div', 'meter__track');
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', g.title + ': ' + g.percent + '% баллов');
      var fill = el('div', 'meter__fill');
      fill.style.width = g.percent + '%';
      track.appendChild(fill);
      li.appendChild(track);
      li.appendChild(el('p', 'meter__sub', 'Заданий: ' + g.tasks + ' · полностью верно: ' + g.full +
        ' · частично: ' + g.partial + ' · 0 баллов: ' + g.zero + (g.skipped ? ' (без ответа: ' + g.skipped + ')' : '')));
      list.appendChild(li);
    });
    box.appendChild(list);
    return box;
  }

  function analyticsPanel(a) {
    var panel = el('section', 'panel final-analytics');
    panel.id = 'final-analytics';
    var h = el('h3', 'section-title', 'Учебная аналитика');
    h.id = 'final-analytics-title';
    panel.setAttribute('aria-labelledby', h.id);
    panel.appendChild(h);
    panel.appendChild(el('p', 'final-analytics__disclaimer',
      'Это учебная аналитика по ' + a.total.tasks + ' ' + plural(a.total.tasks, 'заданию', 'заданиям', 'заданиям') +
      ' одной работы, а не диагностика: задания не проходили статистическую апробацию. ' +
      'Задание, которое проверяет несколько критериев или действий, учитывается в каждом из них, ' +
      'поэтому суммы по группам больше общего балла; общий балл считается один раз.'));
    panel.appendChild(meterGroup('Форматы заданий', a.byFormat, 'final-an-format'));
    if (a.byCriterion.length) panel.appendChild(meterGroup('Критерии сравнения обществ', a.byCriterion, 'final-an-criteria'));
    panel.appendChild(meterGroup('Уровни сложности', a.byLevel, 'final-an-level'));
    panel.appendChild(meterGroup('Познавательные действия', a.byAction, 'final-an-action'));
    return panel;
  }

  function reviewPanel() {
    var r = state.result;
    var panel = el('section', 'panel');
    panel.id = 'final-review';
    var head = el('div', 'review__head');
    var h = el('h3', 'section-title', 'Разбор заданий');
    h.id = 'final-review-title';
    panel.setAttribute('aria-labelledby', h.id);
    head.appendChild(h);
    var list = el('ul', 'review-list');
    list.id = 'final-review-list';
    var expand = button('btn--ghost btn--sm', 'Развернуть все', function () {
      var all = Array.prototype.slice.call(list.querySelectorAll('details'));
      var open = !all.every(function (d) { return d.open; });
      all.forEach(function (d) { d.open = open; });
      updateExpand();
    });
    head.appendChild(expand);
    panel.appendChild(head);

    var mistakes = r.rows.filter(function (row) { return row.points < row.maxPoints; });
    var skipped = r.rows.filter(function (row) { return row.level === 'skipped'; });
    var filters = [['all', 'Все задания (' + r.rows.length + ')'], ['mistakes', 'С ошибками (' + mistakes.length + ')'],
      ['skipped', 'Без ответа (' + skipped.length + ')']];
    var seg = el('div', 'segmented review__filter');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', 'Какие задания показать');
    filters.forEach(function (f) {
      var label = el('label', 'segmented__item');
      var input = el('input');
      input.type = 'radio';
      input.name = 'final-review-filter';
      input.value = f[0];
      label.appendChild(input);
      label.appendChild(el('span', null, f[1]));
      seg.appendChild(label);
    });
    panel.appendChild(seg);
    panel.appendChild(list);

    function updateExpand() {
      var all = Array.prototype.slice.call(list.querySelectorAll('details'));
      expand.hidden = all.length === 0;
      expand.textContent = all.length && all.every(function (d) { return d.open; }) ? 'Свернуть все' : 'Развернуть все';
    }

    function render(filter) {
      seg.querySelectorAll('input').forEach(function (i) { i.checked = i.value === filter; });
      list.textContent = '';
      var rows = filter === 'mistakes' ? mistakes : filter === 'skipped' ? skipped : r.rows;
      if (!rows.length) {
        list.appendChild(el('li', 'review-list__empty', filter === 'skipped'
          ? 'Пропущенных заданий нет.' : 'Ошибок нет — все задания выполнены верно. Отличная работа!'));
      }
      rows.forEach(function (row) {
        var details = reviewItem(row);
        details.addEventListener('toggle', updateExpand);
        var li = el('li', 'review-item');
        li.appendChild(details);
        list.appendChild(li);
      });
      updateExpand();
    }
    seg.addEventListener('change', function (e) { render(e.target.value); });
    render(mistakes.length ? 'mistakes' : 'all');
    return panel;
  }

  function optionName(task, n) {
    return n == null ? 'не выбрано' : n + ' (' + task.options[n - 1] + ')';
  }

  /** «Разбор вашего ответа»: что именно не так в каждой ошибочной позиции. */
  function mistakeBlock(task, g) {
    var box = el('div', 'final-mistakes');
    box.appendChild(el('h3', 'final-mistakes__title', 'Разбор вашего ответа'));
    if (g.skipped) {
      box.appendChild(el('p', 'final-mistakes__ok final-mistakes__ok--none', 'Ответ не дан — 0 баллов. Выше — правильный ответ и объяснение каждой позиции.'));
      return box;
    }
    var details = F.mistakeDetails(task, g.selected);
    if (details.length === 0) {
      box.appendChild(el('p', 'final-mistakes__ok', 'Ошибок нет: ответ полностью совпадает с правильным.'));
      return box;
    }
    var type = typeOf(task);
    var list = el('ul', 'final-mistakes__list');
    details.forEach(function (d) {
      var li = el('li', 'final-mistakes__item');
      var text;
      if (type === 'matching') {
        text = d.letter + ') «' + d.item.text + '»: ' + (d.chosen == null ? 'номер не выбран' : 'выбрано ' + optionName(task, d.chosen)) +
          ', правильно — ' + optionName(task, d.expected) + '.';
      } else {
        var noun = type === 'exclude-two' ? 'Позиция' : task.choiceOf === 'items' ? 'Признак' : 'Суждение';
        var q = ' ' + d.number + ' «' + d.statement.text + '» — ';
        if (type === 'exclude-two') {
          text = noun + q + (d.kind === 'wrong' ? 'относится к ряду, исключать её не нужно.' : 'выпадает из ряда, но не отмечена.');
        } else if (task.choiceOf === 'items') {
          text = noun + q + (d.kind === 'wrong' ? 'не подходит, а вы его выбрали.' : 'подходит, но не выбран.');
        } else {
          text = noun + q + (d.kind === 'wrong' ? 'неверное, а вы его выбрали.' : 'верное, но не выбрано.');
        }
      }
      li.appendChild(el('p', null, text));
      var trap = d.statement ? view.trapText(d.statement.trap) : null;
      if (trap) li.appendChild(el('p', 'statement__trap', 'Ловушка: ' + trap));
      list.appendChild(li);
    });
    box.appendChild(list);
    box.appendChild(el('p', 'final-mistakes__rule', scoring.getMaxPoints(task) === 1
      ? 'Задание оценивается в 1 балл только за полностью верный ответ.'
      : 'Одна ошибка — 1 балл, две и более — 0 баллов.'));
    return box;
  }

  function reviewItem(row) {
    var task = row.task;
    var details = el('details', 'review-item__details');
    details.setAttribute('data-task', row.taskId);
    var summary = el('summary', 'review-item__summary');
    var head = el('div', 'mistake__head');
    head.appendChild(el('span', 'mistake__num', 'Задание ' + (row.index + 1)));
    if (task && task.bankFormat) head.appendChild(el('span', 'chip chip--sm chip--format', FORMAT_TITLES[task.bankFormat]));
    head.appendChild(el('span', 'mistake__points points--' + (row.level === 'skipped' ? 'none' : row.level),
      row.level === 'skipped' ? 'Без ответа · 0 из ' + row.maxPoints : scoring.formatPointsOutOf(row.points, row.maxPoints)));
    summary.appendChild(head);
    if (task) summary.appendChild(el('p', 'mistake__question', task.question));
    if (!row.changed) {
      var answers = el('p', 'mistake__answers');
      answers.appendChild(el('span', null, 'Ваш ответ: '));
      answers.appendChild(el('strong', row.points === row.maxPoints ? 'text-right' : 'text-wrong',
        row.level === 'skipped' ? 'нет ответа' : scoring.formatTaskAnswer(task, row.selected)));
      answers.appendChild(el('span', null, ' · Правильный: '));
      answers.appendChild(el('strong', 'text-right', scoring.formatTaskAnswer(task, row.correct)));
      summary.appendChild(answers);
    }
    summary.appendChild(el('span', 'review-item__toggle', 'Показать разбор'));
    details.appendChild(summary);

    var body = el('div', 'review-item__body');
    if (row.changed) {
      body.appendChild(el('p', 'result__note', 'Задание с тех пор обновлено — разбор этой попытки недоступен.'));
      details.appendChild(body);
      return details;
    }
    var g = F.grade(task, row.selected);
    if (typeOf(task) === 'matching') {
      var box = el('div', 'matching');
      view.renderMatching(box, task, { answer: g });
      body.appendChild(box);
    } else {
      var list = el('ol', 'statements');
      view.renderStatements(list, task, { answer: g });
      body.appendChild(list);
    }
    if (task.instruction) body.appendChild(el('p', 'task__instruction', task.instruction));
    var fb = view.createFeedback(g, task);
    if (g.skipped) {
      var cap = fb.querySelector('.points__caption');
      if (cap) cap.textContent = 'Ответ не дан';
    }
    body.appendChild(fb);
    body.appendChild(mistakeBlock(task, g));
    var notes = view.createTaskNotes(task);
    if (notes) body.appendChild(notes);
    details.appendChild(body);
    return details;
  }

  /* ---------- Клавиатура ---------- */

  document.addEventListener('keydown', function (e) {
    if (!screens.run || screens.run.hidden || !state.session || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var task = currentTask();
    if (e.key === 'Escape' && state.confirmFinish) {
      state.confirmFinish = false;
      renderFinish();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      var n = parseInt(e.key, 10);
      if (typeOf(task) === 'matching') {
        if (n <= task.options.length) { e.preventDefault(); choose(state.matchRow, n); }
      } else if (n <= task.statements.length) {
        e.preventDefault();
        toggle(n);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      go(state.session.viewIndex + (e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === 'Enter') {
      if (tag === 'A') return;
      if (tag === 'BUTTON' && !e.target.classList.contains('statement__btn') && !e.target.classList.contains('match-choice')) return;
      e.preventDefault();
      primaryAction();
    }
  });

  /** Последнее состояние при закрытии вкладки. */
  window.addEventListener('pagehide', persist);

  /** env: { storage, showScreen(name), showStart(), formatDate(iso), screens: { run, result } }. */
  function init(options) {
    env = options;
    screens = options.screens;
  }

  EGE.finalPracticum = {
    init: init,
    hasProgress: hasProgress,
    isStorageKey: isStorageKey,
    fillCard: fillCard
  };
})();
